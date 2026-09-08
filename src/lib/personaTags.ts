// Imagen 호출 비용을 줄이기 위해 캐릭터 이미지를 매번 새로 그리지 않고, 미리 만들어둔
// 이미지 풀(persona_image_pool)에서 톤·관심사와 어울리는 것을 골라 쓴다. "어울림"은 모델
// 판단에 맡기지 않고(카테고리·기념일 감지와 같은 이유로 이 방식이 훨씬 안정적이다) 키워드로
// 정한 태그로 결정한다.
//
// 이미지 하나에는 태그가 여러 개 붙을 수 있다(예: 발랄함+먹는중+토끼). 그중 무드 태그와
// 활동 태그만 사용자 입력에서 추론해 매칭에 쓰고, 캐릭터 생김새(토끼/곰/사람 등) 같은
// 자유 태그는 추론할 근거가 없어 매칭에 쓰지 않는다 — 풀을 구성하는 사람이 이미지를
// 설명해두는 용도로만 남겨둔다.

export const PERSONA_MOOD_TAGS = ['발랄함', '차분함', '따뜻함', '씩씩함', '몽글몽글함'] as const
export type PersonaMoodTag = (typeof PERSONA_MOOD_TAGS)[number]

const MOOD_KEYWORDS: Record<PersonaMoodTag, string[]> = {
  발랄함: ['발랄', '통통', '활발', '신나', '유쾌', '명랑', '경쾌', '재잘'],
  차분함: ['차분', '조용', '잔잔', '여유', '담담', '진중', '묵직'],
  따뜻함: ['따뜻', '다정', '포근', '온화', '상냥', '살갑'],
  씩씩함: ['씩씩', '당당', '힘찬', '활기', '용감', '단단'],
  몽글몽글함: ['몽글', '몽환', '말랑', '부드럽', '아기자기', '몰랑'],
}

// 어떤 키워드에도 안 걸리면 앱 전체의 "포근함" 컨셉에 맞춰 이 태그를 기본값으로 쓴다.
const DEFAULT_MOOD_TAG: PersonaMoodTag = '따뜻함'

export function inferMoodTag(tone: string, interests: string[] = []): PersonaMoodTag {
  const text = `${tone} ${interests.join(' ')}`
  for (const tag of PERSONA_MOOD_TAGS) {
    if (MOOD_KEYWORDS[tag].some((keyword) => text.includes(keyword))) return tag
  }
  return DEFAULT_MOOD_TAG
}

export const PERSONA_ACTIVITY_TAGS = ['먹는중', '책읽는중', '그림그리는중', '음악듣는중', '운동중', '게임중'] as const
export type PersonaActivityTag = (typeof PERSONA_ACTIVITY_TAGS)[number]

const ACTIVITY_KEYWORDS: Record<PersonaActivityTag, string[]> = {
  먹는중: ['음식', '먹는', '먹기', '맛집', '디저트', '카페', '빵', '라면', '떡볶이', '치킨', '피자', '요리'],
  책읽는중: ['책', '독서', '소설', '만화', '웹툰'],
  그림그리는중: ['그림', '그리기', '드로잉', '미술', '낙서'],
  음악듣는중: ['음악', '노래', '악기', '콘서트', '플레이리스트'],
  운동중: ['운동', '헬스', '러닝', '산책', '요가', '필라테스'],
  게임중: ['게임', '겜', '플스', '닌텐도', '롤'],
}

// 관심사가 여러 개일 수 있으니 활동 태그도 최대 max개까지 담는다(무드는 항상 1개뿐).
export function inferActivityTags(tone: string, interests: string[] = [], max = 2): PersonaActivityTag[] {
  const text = `${tone} ${interests.join(' ')}`
  return PERSONA_ACTIVITY_TAGS.filter((tag) => ACTIVITY_KEYWORDS[tag].some((keyword) => text.includes(keyword))).slice(
    0,
    max,
  )
}

export function inferPersonaTags(tone: string, interests: string[] = []): string[] {
  return [inferMoodTag(tone, interests), ...inferActivityTags(tone, interests)]
}
