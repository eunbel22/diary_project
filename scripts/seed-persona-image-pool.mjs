// 캐릭터 이미지 풀을 채우는 1회성 스크립트. Imagen 호출 비용이 실제로 발생하므로
// Claude나 다른 자동화가 아니라 사람이 직접, 필요할 때만 실행해야 한다.
//
// 사용법:
//   GEMINI_API_KEY=... VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/seed-persona-image-pool.mjs [개수(태그당, 기본 20)]
//
// 태그 구성은 src/lib/personaTags.ts의 PERSONA_MOOD_TAGS와 반드시 맞춰야 한다. 이 스크립트는
// 비용 관리를 위해 무드 태그 하나씩만 붙여서 생성한다 — 활동·생김새 등 추가 태그로 더 다양하게
// 채우고 싶으면 비용이 들지 않는 scripts/upload-persona-image-pool.mjs(사람이 직접 만든
// 이미지를 여러 태그로 올리는 스크립트)를 쓰는 걸 권장한다.

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const IMAGEN_MODEL = 'imagen-3.0-generate-002'
const BUCKET = 'persona-image-pool'
const DELAY_MS = 300

const TAG_DESCRIPTORS = {
  발랄함: '발랄하고 활기차 보이는 표정과 자세',
  차분함: '차분하고 여유로워 보이는 표정과 자세',
  따뜻함: '따뜻하고 다정해 보이는 표정과 자세',
  씩씩함: '씩씩하고 당당해 보이는 표정과 자세',
  몽글몽글함: '몽글몽글하고 아기자기해 보이는 표정과 자세',
}

function buildPrompt(tag) {
  return [
    '따뜻하고 부드러운 색연필 느낌의 다이어리 캐릭터 초상화.',
    `${TAG_DESCRIPTORS[tag]}.`,
    '사람 형태의 개성 있는 캐릭터. 배경은 단순하고, 얼굴과 상반신이 보이는 정면 초상. 텍스트 없음.',
  ].join(' ')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function generateImage(apiKey, tag) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      instances: [{ prompt: buildPrompt(tag) }],
      parameters: { sampleCount: 1 },
    }),
  })
  if (!res.ok) throw new Error(`Imagen API error (${res.status}): ${await res.text()}`)

  const data = await res.json()
  const base64 = data?.predictions?.[0]?.bytesBase64Encoded
  if (typeof base64 !== 'string') throw new Error('Imagen API returned no image')
  return base64
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!apiKey || !supabaseUrl || !serviceRoleKey) {
    console.error('GEMINI_API_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 모두 설정해주세요.')
    process.exit(1)
  }

  const countPerTag = Number(process.argv[2]) || 20
  const tags = Object.keys(TAG_DESCRIPTORS)
  const total = tags.length * countPerTag
  console.log(`태그 ${tags.length}개 × ${countPerTag}장 = 총 ${total}장을 생성합니다.`)

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { error: bucketError } = await admin.storage.createBucket(BUCKET, { public: true })
  if (bucketError && !bucketError.message?.includes('already exists')) {
    console.error('버킷 생성 실패:', bucketError)
    process.exit(1)
  }

  let succeeded = 0
  let failed = 0

  for (const tag of tags) {
    for (let i = 0; i < countPerTag; i++) {
      try {
        const base64 = await generateImage(apiKey, tag)
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        const path = `${tag}/${randomUUID()}.png`

        const { error: uploadError } = await admin.storage
          .from(BUCKET)
          .upload(path, bytes, { contentType: 'image/png' })
        if (uploadError) throw uploadError

        const { data: publicUrlData } = admin.storage.from(BUCKET).getPublicUrl(path)
        const { error: insertError } = await admin
          .from('persona_image_pool')
          .insert({ tags: [tag], image_url: publicUrlData.publicUrl })
        if (insertError) throw insertError

        succeeded++
        console.log(`[${succeeded + failed}/${total}] ${tag} 완료`)
      } catch (err) {
        failed++
        console.error(`[${succeeded + failed}/${total}] ${tag} 실패:`, err.message ?? err)
      }
      await sleep(DELAY_MS)
    }
  }

  console.log(`끝. 성공 ${succeeded}장, 실패 ${failed}장.`)
}

main()
