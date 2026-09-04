// 라이트 모델이 드물게 같은 글자를 반복하며 망가지는 경우를 막기 위한 공통 유틸.
// 짧고 정형화된 값(이름/말투/추출된 항목명 등)에는 stripRepetition + 길이 제한을 함께 쓰고,
// 자유롭게 쓰인 문장(다이어리 본문, 대화 응답 등)에는 stripRepetition을 쓰지 않는다 —
// "완전 좋았어~~~", "ㅋㅋㅋ" 같은 정상적인 강조 표현까지 잘라버릴 위험이 있어서다.
// 그런 자유 문장에는 capLength로 폭주 방지용 넉넉한 길이 상한만 둔다.

export function stripRepetition(value: string): string {
  const match = value.match(/(.)\1{2,}/)
  return match?.index != null ? value.slice(0, match.index).trimEnd() : value
}

export function capLength(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

export function sanitizeText(value: string, max: number): string {
  return capLength(stripRepetition(value.trim()), max)
}
