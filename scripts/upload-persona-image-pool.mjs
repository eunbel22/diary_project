// ChatGPT/Gemini 앱/나노바나나 등으로 사람이 직접 만들어서 저장해둔 이미지를 캐릭터
// 이미지 풀에 채워 넣는 스크립트. Imagen을 호출하지 않으므로 이 스크립트 자체는
// 비용이 들지 않는다(이미지를 어디서 만들었는지는 무관 — 그냥 로컬 파일을 업로드만 함).
//
// 사용법:
//   1) 저장소 루트에 persona-image-assets/<태그>/ 폴더를 태그별로 만든다.
//      태그는 src/lib/personaVibe.ts의 PERSONA_VIBE_TAGS와 정확히 같아야 한다:
//      발랄함, 차분함, 따뜻함, 씩씩함, 몽글몽글함
//      예: persona-image-assets/발랄함/모모1.png, persona-image-assets/발랄함/모모2.png
//   2) 각 폴더에 그 느낌에 어울리는 이미지 파일(png/jpg/jpeg/webp)을 원하는 만큼 넣는다.
//   3) VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-persona-image-pool.mjs

import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'persona-image-pool'
const SOURCE_DIR = 'persona-image-assets'

// 일반 Node 스크립트라 TS 파일을 직접 import할 수 없어 목록을 그대로 복사해둔다 —
// src/lib/personaVibe.ts의 PERSONA_VIBE_TAGS를 바꾸면 여기도 같이 바꿀 것.
const KNOWN_TAGS = ['발랄함', '차분함', '따뜻함', '씩씩함', '몽글몽글함']

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 설정해주세요.')
    process.exit(1)
  }

  let tagFolders
  try {
    tagFolders = readdirSync(SOURCE_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  } catch {
    console.error(
      `'${SOURCE_DIR}' 폴더가 없어요. 태그별 폴더(예: ${SOURCE_DIR}/발랄함/)를 만들고 이미지를 넣어주세요.`,
    )
    process.exit(1)
  }

  if (tagFolders.length === 0) {
    console.error(`'${SOURCE_DIR}' 안에 태그 폴더가 없어요.`)
    process.exit(1)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { error: bucketError } = await admin.storage.createBucket(BUCKET, { public: true })
  if (bucketError && !bucketError.message?.includes('already exists')) {
    console.error('버킷 생성 실패:', bucketError)
    process.exit(1)
  }

  let succeeded = 0
  let failed = 0

  for (const folder of tagFolders) {
    const tag = folder.name
    if (!KNOWN_TAGS.includes(tag)) {
      console.warn(`'${tag}'는 알 수 없는 태그예요(${KNOWN_TAGS.join(', ')} 중 하나여야 함). 건너뜁니다.`)
      continue
    }

    const dir = join(SOURCE_DIR, tag)
    const files = readdirSync(dir).filter((name) => MIME_TYPES[extname(name).toLowerCase()])

    if (files.length === 0) {
      console.warn(`'${tag}' 폴더에 이미지 파일(png/jpg/jpeg/webp)이 없어요.`)
      continue
    }

    for (const file of files) {
      try {
        const bytes = readFileSync(join(dir, file))
        const ext = extname(file).toLowerCase()
        const path = `${tag}/${randomUUID()}${ext}`

        const { error: uploadError } = await admin.storage
          .from(BUCKET)
          .upload(path, bytes, { contentType: MIME_TYPES[ext] })
        if (uploadError) throw uploadError

        const { data: publicUrlData } = admin.storage.from(BUCKET).getPublicUrl(path)
        const { error: insertError } = await admin
          .from('persona_image_pool')
          .insert({ tag, image_url: publicUrlData.publicUrl })
        if (insertError) throw insertError

        succeeded++
        console.log(`[${tag}] ${file} 업로드 완료`)
      } catch (err) {
        failed++
        console.error(`[${tag}] ${file} 실패:`, err.message ?? err)
      }
    }
  }

  console.log(`끝. 성공 ${succeeded}장, 실패 ${failed}장.`)
}

main()
