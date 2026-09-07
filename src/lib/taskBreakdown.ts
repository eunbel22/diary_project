// 라이트 모델에게 "이 할일이 크고 막연한가"까지 판단시키면 신뢰도가 떨어지므로
// (카테고리·기념일 감지와 같은 이유) 서버 호출 없이 키워드로만 후보를 추린다.
// 이 판단은 어디까지나 "먼저 물어볼지"를 정하는 용도일 뿐이고, 항목별 "쪼개줘" 버튼은
// 이 키워드와 무관하게 항상 쓸 수 있다.
const LARGE_TASK_KEYWORDS = [
  '정리', '준비', '계획', '기획', '발표', '시험공부', '공부', '청소', '이사', '프로젝트',
  '작성', '만들기', '리서치', '연습', '복습', '다이어트', '취업', '이력서', '포트폴리오',
  '대청소', '집들이', '여행 준비',
]

export function looksLikeLargeTask(title?: string): boolean {
  if (!title) return false
  return title.length >= 10 || LARGE_TASK_KEYWORDS.some((keyword) => title.includes(keyword))
}
