// 일회성 데이터 보정 스크립트: 기존 raw_log의 소비(consumption) 기록 중
// 이전 버전(모델이 직접 카테고리를 고르던 방식)에서 저장되어 카테고리가 부정확한
// 항목들을 지금의 키워드 분류 규칙으로 다시 계산해 업데이트한다.
//
// raw_log 테이블은 원본 발화를 그대로 보존하기 위해 클라이언트용 UPDATE 정책이
// 없으므로(0001 마이그레이션), service_role 키로 RLS를 우회해서 실행한다.
//
// 실행 방법 (PowerShell 예시):
//   $env:VITE_SUPABASE_URL="https://<project>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role 비밀 키>"
//   node scripts/reclassify-consumption-categories.mjs

import { createClient } from '@supabase/supabase-js'

const CATEGORY_KEYWORDS = {
  식비: [
    '밥', '식당', '김밥', '치킨', '피자', '버거', '분식', '국밥', '백반', '배달', '요기요',
    '배민', '마라탕', '라면', '국수', '냉면', '삼겹살', '회', '초밥', '도시락', '아침', '점심',
    '저녁', '식사', '맛집',
  ],
  '카페/간식': [
    '카페', '커피', '스타벅스', '이디야', '투썸', '빽다방', '아이스크림', '디저트', '베이커리',
    '빵', '케이크', '음료', '주스', '간식',
  ],
  교통: [
    '버스', '지하철', '택시', '기차', 'ktx', '주유', '톨게이트', '대중교통', '카카오t', '티맵',
    '전철', '시외버스', '고속버스',
  ],
  쇼핑: [
    '옷', '쇼핑몰', '백화점', '마트', '올리브영', '화장품', '신발', '가방', '쿠팡', '마켓컬리',
    '지마켓', '온라인', '주문',
  ],
  '문화/여가': [
    '영화', 'cgv', '메가박스', '롯데시네마', '공연', '콘서트', '전시', '게임', '넷플릭스',
    '유튜브', '여행', '숙박', '놀이공원', '티켓',
  ],
  생활: [
    '병원', '약국', '약', '미용실', '헤어', '세탁', '관리비', '통신비', '휴대폰', '월세', '가스비',
    '전기세', '다이소', '생필품',
  ],
}

function inferConsumptionCategory(text) {
  const lower = text.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) return category
  }
  return '기타'
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('VITE_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey)

const { data: rows, error: fetchError } = await admin
  .from('raw_log')
  .select('id, content')
  .eq('type', 'consumption')

if (fetchError) {
  console.error('소비 기록 조회 실패:', fetchError)
  process.exit(1)
}

console.log(`소비 기록 ${rows.length}건 확인`)

let updated = 0
for (const row of rows) {
  const content = row.content ?? {}
  const basis = `${content.item ?? ''} ${content.raw_text ?? ''}`
  const nextCategory = inferConsumptionCategory(basis)

  if (content.category === nextCategory) continue

  const { error: updateError } = await admin
    .from('raw_log')
    .update({ content: { ...content, category: nextCategory } })
    .eq('id', row.id)

  if (updateError) {
    console.error(`id=${row.id} 업데이트 실패:`, updateError)
    continue
  }

  updated += 1
  console.log(`id=${row.id} "${content.item ?? ''}" → ${content.category ?? '(없음)'} → ${nextCategory}`)
}

console.log(`완료: ${updated}건 갱신 (총 ${rows.length}건 중)`)
