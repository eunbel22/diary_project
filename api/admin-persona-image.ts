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

  // 관리자 페이지(/imageadd)는 로그인만 요구하고, 실제 쓰기 권한은 여기서 확인한다.
  // persona_image_pool은 service_role로만 쓸 수 있어서(RLS), 로그인 여부를 서버에서
  // 직접 검증한 뒤에만 service_role 클라이언트로 작업한다.
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

  if (req.method === 'POST') {
    const { imageBase64, mimeType, tags } = req.body ?? {}
    if (!imageBase64 || !tags || tags.length === 0) {
      res.status(400).json({ error: 'imageBase64 and tags are required' })
      return
    }

    try {
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
