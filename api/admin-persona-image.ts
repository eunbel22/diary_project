import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'persona-image-pool'

interface ApiRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body: {
    imageBase64?: string
    mimeType?: string
    tags?: string[]
    imageId?: string
  }
}

interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' })
    return
  }

  // 관리자 페이지(/imageadd)는 특정 구글 계정 하나로만 제한한다. persona_image_pool은
  // service_role로만 쓸 수 있어서(RLS), 로그인 + 허용된 이메일인지를 서버에서 직접 검증한
  // 뒤에만 service_role 클라이언트로 작업한다. ADMIN_EMAIL이 설정 안 돼 있으면 아무도 통과
  // 못 하게 막는다(허용 목록이 없으면 전부 거부 — 열어두는 쪽으로 실패하지 않게).
  const adminEmail = process.env.ADMIN_EMAIL
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const authHeader = req.headers.authorization
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : undefined
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const { data: userData, error: authError } = await admin.auth.getUser(token)
  if (authError || !userData.user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  if (!adminEmail || userData.user.email !== adminEmail) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  if (req.method === 'GET') {
    res.status(200).json({ authorized: true })
    return
  }

  if (req.method === 'POST') {
    const { imageBase64, mimeType, tags } = req.body ?? {}
    if (!imageBase64 || !tags || tags.length === 0) {
      res.status(400).json({ error: 'imageBase64 and tags are required' })
      return
    }

    try {
      // 로컬 시드 스크립트들은 버킷을 미리 만들어두지만, 이 API는 웹에서 처음 올리는
      // 경로일 수 있으니 버킷이 없으면 여기서도 만들어준다("already exists"는 정상 진행).
      const { error: bucketError } = await admin.storage.createBucket(BUCKET, { public: true })
      if (bucketError && !bucketError.message?.includes('already exists')) throw bucketError

      const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0))
      const ext = EXTENSION_BY_MIME[mimeType ?? ''] ?? 'png'
      const path = `${tags.join('-')}/${randomUUID()}.${ext}`

      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: mimeType ?? 'image/png' })
      if (uploadError) throw uploadError

      const { data: publicUrlData } = admin.storage.from(BUCKET).getPublicUrl(path)
      const { data: inserted, error: insertError } = await admin
        .from('persona_image_pool')
        .insert({ tags, image_url: publicUrlData.publicUrl })
        .select()
        .single()
      if (insertError) throw insertError

      res.status(200).json(inserted)
    } catch (err) {
      res.status(500).json({ error: 'Failed to upload image', detail: String(err) })
    }
    return
  }

  if (req.method === 'DELETE') {
    const { imageId } = req.body ?? {}
    if (!imageId) {
      res.status(400).json({ error: 'imageId is required' })
      return
    }

    try {
      const { data: row, error: fetchError } = await admin
        .from('persona_image_pool')
        .select('image_url')
        .eq('id', imageId)
        .single()
      if (fetchError || !row) throw fetchError ?? new Error('Image not found')

      const marker = `/object/public/${BUCKET}/`
      const markerIndex = row.image_url.indexOf(marker)
      if (markerIndex !== -1) {
        const storagePath = decodeURIComponent(row.image_url.slice(markerIndex + marker.length))
        await admin.storage.from(BUCKET).remove([storagePath])
      }

      const { error: deleteError } = await admin.from('persona_image_pool').delete().eq('id', imageId)
      if (deleteError) throw deleteError

      res.status(200).json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete image', detail: String(err) })
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
