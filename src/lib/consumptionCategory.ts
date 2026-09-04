import type { ConsumptionCategory } from '../types'

// 라이트 모델이 타입 분류+필드 추출과 함께 카테고리 지침까지 안정적으로 따르지 못해
// (관찰됨: 대부분 '기타'로만 응답) 카테고리는 모델에 맡기지 않고 키워드로 직접 정한다.
export const CATEGORY_KEYWORDS: Record<Exclude<ConsumptionCategory, '기타'>, string[]> = {
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

export function inferConsumptionCategory(text: string): ConsumptionCategory {
  const lower = text.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [
    ConsumptionCategory,
    string[],
  ][]) {
    if (keywords.some((keyword) => lower.includes(keyword))) return category
  }
  return '기타'
}
