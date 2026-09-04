function bigrams(text: string): Set<string> {
  const clean = text.replace(/\s+/g, '')
  const set = new Set<string>()
  for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2))
  return set
}

// 두 문자열이 얼마나 비슷한지(0~1) 문자 바이그램 겹침 비율(Dice 계수)로 대략 추정한다.
// 형태소 분석 없이도 "데미안 책읽기" ↔ "데미안이라는 책을 읽어야 함" 같은 표현을
// 어느 정도 매칭시키기 위한 가벼운 방법이다.
export function diceSimilarity(a: string, b: string): number {
  const setA = bigrams(a)
  const setB = bigrams(b)
  if (setA.size === 0 || setB.size === 0) return 0

  let overlap = 0
  for (const bigram of setA) {
    if (setB.has(bigram)) overlap += 1
  }
  return (2 * overlap) / (setA.size + setB.size)
}
