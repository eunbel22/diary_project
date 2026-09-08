// ChatGPT/Gemini 앱/나노바나나 등으로 사람이 직접 만들어서 저장해둔 이미지를 캐릭터
// 이미지 풀에 채워 넣는 스크립트. Imagen을 호출하지 않으므로 이 스크립트 자체는
// 비용이 들지 않는다(이미지를 어디서 만들었는지는 무관 — 그냥 로컬 파일을 업로드만 함).
//
// 태그는 폴더 구조로 표현한다 — 파일이 들어 있는 경로의 폴더 이름들이 그대로 그 이미지의
// 태그가 된다(몇 단계든 가능). 예:
//   persona-image-assets/발랄함/토끼/먹는중/모모1.png
//     → 태그: ["발랄함", "토끼", "먹는중"]
//   persona-image-assets/따뜻함/모모2.png
//     → 태그: ["따뜻함"]
// 무드(발랄함 등, src/lib/personaTags.ts의 PERSONA_MOOD_TAGS)와 활동(먹는중 등,
// PERSONA_ACTIVITY_TAGS)은 실제 매칭에 쓰이고, "토끼"처럼 그 목록에 없는 태그는 매칭에
// 쓰이진 않지만 풀을 채우는 사람이 이미지를 구분해두는 용도로 자유롭게 붙여도 된다.
//
// 사용법:
//   1) persona-image-assets/ 아래에 원하는 만큼 폴더를 겹쳐서 만들고 이미지를 넣는다.
//   2) VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-persona-image-pool.mjs

import { readdirSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { extname, join, relative, sep } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'persona-image-pool'
const SOURCE_DIR = 'persona-image-assets'

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

function collectImageFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectImageFiles(fullPath))
    } else if (MIME_TYPES[extname(entry.name).toLowerCase()]) {
      results.push(fullPath)
    }
  }
  return results
}

function tagsFor(filePath) {
  const relPath = relative(SOURCE_DIR, filePath)
  const segments = relPath.split(sep)
  return segments.slice(0, -1)
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 설정해주세요.')
    process.exit(1)
  }

  let files
  try {
    files = collectImageFiles(SOURCE_DIR)
  } catch {
    console.error(
      `'${SOURCE_DIR}' 폴더가 없어요. 태그 폴더(예: ${SOURCE_DIR}/발랄함/)를 만들고 이미지를 넣어주세요.`,
    )
    process.exit(1)
  }

  if (files.length === 0) {
    console.error(`'${SOURCE_DIR}' 안에 이미지 파일(png/jpg/jpeg/webp)이 없어요.`)
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

  for (const filePath of files) {
    const tags = tagsFor(filePath)
    if (tags.length === 0) {
      console.warn(`'${filePath}'는 태그 폴더 없이 최상위에 있어요. 폴더(예: 발랄함/) 안에 넣어주세요. 건너뜁니다.`)
      continue
    }

    try {
      const bytes = readFileSync(filePath)
      const ext = extname(filePath).toLowerCase()
      const path = `${tags.join('-')}/${randomUUID()}${ext}`

      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: MIME_TYPES[ext] })
      if (uploadError) throw uploadError

      const { data: publicUrlData } = admin.storage.from(BUCKET).getPublicUrl(path)
      const { error: insertError } = await admin
        .from('persona_image_pool')
        .insert({ tags, image_url: publicUrlData.publicUrl })
      if (insertError) throw insertError

      succeeded++
      console.log(`[${tags.join(', ')}] ${filePath} 업로드 완료`)
    } catch (err) {
      failed++
      console.error(`[${filePath}] 실패:`, err.message ?? err)
    }
  }

  console.log(`끝. 성공 ${succeeded}장, 실패 ${failed}장.`)
}

main()
