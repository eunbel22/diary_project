import { sanitizeText } from '../src/lib/textSanitize'
import type { ConsumptionCategory, RawLogContent, StructureLogResponse } from '../src/types'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'

// 라이트 모델이 타입 분류+필드 추출과 함께 카테고리 지침까지 안정적으로 따르지 못해
// (관찰됨: 대부분 '기타'로만 응답) 카테고리는 모델에 맡기지 않고 서버에서 키워드로 직접 정한다.
const CATEGORY_KEYWORDS: Record<Exclude<ConsumptionCategory, '기타'>, string[]> = {
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

function inferCategory(text: string): ConsumptionCategory {
  const lower = text.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [
    ConsumptionCategory,
    string[],
  ][]) {
    if (keywords.some((keyword) => lower.includes(keyword))) return category
  }
  return '기타'
}

// 생일/기념일처럼 매년 돌아오는 날짜는 "약속"과 성격이 달라 별도 표시가 필요하다.
// 모델에 판단을 맡기지 않고(카테고리와 같은 이유) 키워드로 감지한다.
const ANNIVERSARY_KEYWORDS = ['생일', '생신', '기념일', '결혼기념일', '기일', '제사']

function isAnniversary(text: string): boolean {
  return ANNIVERSARY_KEYWORDS.some((keyword) => text.includes(keyword))
}

// 라이트 모델이 드물게 같은 글자를 반복하며 망가지는 문제(온보딩 대화에서 관찰됨)가
// 추출된 필드에서도 똑같이 나타날 수 있다. transcript(사용자가 실제로 한 말)는
// 그대로 두고, 모델이 "추출·요약"한 값들만 정리한다.
function sanitizeContent(content: RawLogContent): RawLogContent {
  const clean = (value?: string) => (value ? sanitizeText(value, 200) : value)
  return {
    ...content,
    item: clean(content.item),
    place: clean(content.place),
    time: clean(content.time),
    title: clean(content.title),
    description: clean(content.description),
    emotion: clean(content.emotion),
  }
}

function buildSystemPrompt(today: string) {
  return `당신은 다이어리 앱의 자동 구조화 도우미입니다. 사용자가 텍스트로 적거나 음성으로 말한 내용에서
소비(consumption) / 일정(schedule) / 할일(task) / 사건(event) 항목을 추출해 entries 배열에 담습니다.

한 번의 말에 서로 구분되는 사실이 여러 개 섞여 있을 수 있습니다(예: "커피 5천원 썼고 이따 3시에 병원
예약 있어" → 소비 1건 + 일정 1건). 그런 경우 entries에 각각 별도 항목으로 나눠 담습니다. 하나의
사실을 부연 설명하는 수준(예: 커피를 마시면서 잠깐 나눈 대화)이라면 굳이 나누지 말고 하나의 항목으로
담습니다. 대부분의 경우 entries는 항목 1개입니다.

각 항목의 분류 기준 (겹치는 경우 이 순서로 우선 적용):
1. 돈을 쓴 이야기(구매, 결제, 지출)면 무조건 consumption입니다.
2. 생일, 기념일처럼 매년 돌아오는 날짜를 알려주는 말이면(예: "OO는 내 생일이야", "결혼기념일이야")
   시각·장소가 없어도 schedule입니다. content.title에 무엇의 생일/기념일인지 짧게 적습니다.
3. 정해진 시각·장소가 있는, 아직 안 일어난 약속이면 schedule입니다.
4. 시각·장소 상관없이 앞으로 처리해야 하는 일이면 task입니다 (예: "책 읽어야 해", "빨래해야 함").
5. 이미 일어난 일, 겪은 일, 감정·상태에 대한 이야기면 event입니다.

완료 보고 감지:
- 사용자가 이미 끝낸 일을 보고하는 말이면("~다 했어", "~마무리했어", "~끝냈어", "~완료했어" 등)
  그 항목의 isCompletion을 true로 하고, completionSubject에 무엇을 완료했는지 핵심 명사구만
  짧게 적습니다(예: "데미안 책읽기"). 이런 경우 type은 이미 일어난 일이므로 event로 분류합니다.
- 완료 보고가 아니면 isCompletion은 항상 false이고 completionSubject는 비웁니다.

반드시 지킬 규칙:
- 오디오가 주어지면 먼저 정확히 전사해서 transcript에 담습니다. 텍스트가 주어지면 transcript에 입력을 그대로 담습니다.
- consumption 항목의 content.amount(금액)는 유일한 필수 정보입니다. 금액이 명확히 언급되지 않았다면
  content.amount는 비워두고 그 항목의 missingRequired를 true로 설정합니다. 이 경우를 제외하면
  missingRequired는 항상 false입니다. 금액 외의 정보 때문에 missingRequired를 true로 만들지 않습니다.
- item(항목), place(장소), time(시간), emotion(감정) 등 금액 외의 정보는 언급이 없으면 맥락에 맞게
  자연스럽게 추정해서 채우고, 절대 사용자에게 되묻지 않습니다. 하나라도 추정한 값이 있으면 그 항목의
  isEstimated를 true로 설정합니다.
- schedule/task/event의 content.date는 언급이 없으면 오늘 날짜(${today})로 자동 채웁니다. 날짜를
  확인하는 질문을 하지 않습니다. task의 제목은 content.title에 적습니다.
- 판단하거나 평가하는 내용을 덧붙이지 않고, 사용자가 말한 사실만 담백하게 기록합니다.`
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcript: { type: 'STRING' },
    entries: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['consumption', 'schedule', 'task', 'event'] },
          content: {
            type: 'OBJECT',
            properties: {
              item: { type: 'STRING' },
              amount: { type: 'NUMBER' },
              place: { type: 'STRING' },
              time: { type: 'STRING' },
              date: { type: 'STRING' },
              title: { type: 'STRING' },
              description: { type: 'STRING' },
              emotion: { type: 'STRING' },
            },
          },
          isEstimated: { type: 'BOOLEAN' },
          missingRequired: { type: 'BOOLEAN' },
          isCompletion: { type: 'BOOLEAN' },
          completionSubject: { type: 'STRING' },
        },
        required: ['type', 'content', 'isEstimated', 'missingRequired'],
      },
    },
  },
  required: ['entries'],
}

interface StructureLogRequest {
  text?: string
  audioBase64?: string
  mimeType?: string
  today?: string
}

interface ApiRequest {
  method?: string
  body: StructureLogRequest
}

interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured' })
    return
  }

  const { text, audioBase64, mimeType, today } = req.body ?? {}
  if (!text && !audioBase64) {
    res.status(400).json({ error: 'text or audioBase64 is required' })
    return
  }
  if (!today) {
    res.status(400).json({ error: 'today is required' })
    return
  }

  const parts = audioBase64
    ? [
        { inlineData: { mimeType: mimeType ?? 'audio/webm', data: audioBase64 } },
        { text: '위 음성을 전사하고 규칙에 따라 구조화해주세요.' },
      ]
    : [{ text }]

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemPrompt(today) }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    )

    if (!geminiRes.ok) {
      const detail = await geminiRes.text()
      res.status(502).json({ error: 'Gemini API error', detail })
      return
    }

    const data = await geminiRes.json()
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof responseText !== 'string') {
      res.status(502).json({ error: 'Gemini API returned no content' })
      return
    }

    const parsed: StructureLogResponse = JSON.parse(responseText)
    for (const entry of parsed.entries ?? []) {
      if (!entry) continue
      if (entry.content) entry.content = sanitizeContent(entry.content)
      if (entry.completionSubject) entry.completionSubject = sanitizeText(entry.completionSubject, 100)
      // 라이트 모델이 "시각·장소 없는 약속"이라는 개념을 안정적으로 못 따라가서
      // 생일/기념일 언급을 event로 분류하는 경우가 많다(관찰됨). 분류 결과와 상관없이
      // 키워드가 있으면 무조건 schedule + recurring으로 강제한다.
      if (entry.content) {
        const anniversaryText = `${entry.content.title ?? ''} ${entry.content.description ?? ''} ${entry.content.item ?? ''} ${parsed.transcript ?? ''}`
        if (isAnniversary(anniversaryText)) {
          entry.type = 'schedule'
          entry.content.recurring = 'yearly'
          if (!entry.content.title) {
            entry.content.title = entry.content.description || entry.content.item || '생일/기념일'
          }
        }
      }
      if (entry.type === 'consumption' && entry.content) {
        entry.content.category = inferCategory(`${entry.content.item ?? ''} ${parsed.transcript ?? ''}`)
      }
    }

    res.status(200).json(parsed)
  } catch (err) {
    console.error('structure-log failed:', err)
    res.status(500).json({ error: 'Failed to structure the log', detail: String(err) })
  }
}
