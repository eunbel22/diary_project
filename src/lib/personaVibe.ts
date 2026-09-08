// Imagen 호출 비용을 줄이기 위해 캐릭터 이미지를 매번 새로 그리지 않고, 미리 만들어둔
// 이미지 풀(persona_image_pool)에서 톤·관심사와 어울리는 것 하나를 골라 쓴다. "어울림"은
// 모델 판단에 맡기지 않고(카테고리·기념일 감지와 같은 이유로 이 방식이 훨씬 안정적이다)
// 키워드로 정한 몇 가지 "느낌" 태그로 결정한다.
export const PERSONA_VIBE_TAGS = ['발랄함', '차분함', '따뜻함', '씩씩함', '몽글몽글함'] as const
export type PersonaVibeTag = (typeof PERSONA_VIBE_TAGS)[number]

const VIBE_KEYWORDS: Record<PersonaVibeTag, string[]> = {
  발랄함: ['발랄', '통통', '활발', '신나', '유쾌', '명랑', '경쾌', '재잘'],
  차분함: ['차분', '조용', '잔잔', '여유', '담담', '진중', '묵직'],
  따뜻함: ['따뜻', '다정', '포근', '온화', '상냥', '살갑'],
  씩씩함: ['씩씩', '당당', '힘찬', '활기', '용감', '단단'],
  몽글몽글함: ['몽글', '몽환', '말랑', '부드럽', '아기자기', '몰랑'],
}

// 어떤 키워드에도 안 걸리면 앱 전체의 "포근함" 컨셉에 맞춰 이 태그를 기본값으로 쓴다.
const DEFAULT_VIBE_TAG: PersonaVibeTag = '따뜻함'

export function inferVibeTag(tone: string, interests: string[] = []): PersonaVibeTag {
  const text = `${tone} ${interests.join(' ')}`
  for (const tag of PERSONA_VIBE_TAGS) {
    if (VIBE_KEYWORDS[tag].some((keyword) => text.includes(keyword))) return tag
  }
  return DEFAULT_VIBE_TAG
}
