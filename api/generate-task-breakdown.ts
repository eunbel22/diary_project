import { sanitizeText } from '../src/lib/textSanitize.js'
import type { TaskBreakdownDetail } from '../src/types'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'

const STEP_COUNT: Record<TaskBreakdownDetail, { min: number; max: number }> = {
  simple: { min: 2, max: 3 },
  detailed: { min: 4, max: 5 },
}

interface GenerateTaskBreakdownRequest {
  personaName?: string
  personaTone?: string
  title?: string
  context?: string
  detail?: TaskBreakdownDetail
}

interface ApiRequest {
  method?: string
  body: GenerateTaskBreakdownRequest
}

interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

function buildPrompt(
  personaName: string,
  personaTone: string,
  title: string,
  context: string | undefined,
  detail: TaskBreakdownDetail,
) {
  const { min, max } = STEP_COUNT[detail]
  const contextLine = context
    ? `\n사용자가 이 할일을 이렇게 말했습니다: "${context}". 여기 드러난 구체적인 내용(무엇을, 왜, 어떻게)을
최대한 활용해서 이 사람만의 상황에 맞는 단계로 나눠주세요.`
    : ''

  return `당신은 사용자의 다이어리 캐릭터 "${personaName}"입니다. 말투와 성격: ${personaTone}.
사용자가 "${title}"라는 할일을 앞두고 있습니다.${contextLine}
이 할일을 실제로 시작하기 쉽게, 순서대로 실행할 수 있는 아주 구체적인 작은 단계 ${min}~${max}개로 나눠주세요.

반드시 지킬 규칙:
- "계획 세우기", "준비하기", "검토하기", "마무리하기"처럼 어떤 할일에나 그대로 붙일 수 있는 막연하고
  일반적인 표현은 쓰지 않습니다. 오직 "${title}"이라는 이 할일에만 해당하는, 손으로 바로 옮길 수 있는
  구체적인 행동으로 적습니다(예: "발표 슬라이드 목차 3줄 적기"처럼 실제로 뭘 하는지 명확하게).
- 순서대로 하면 "${title}"이 자연스럽게 끝나도록 나눕니다.
- 재촉하거나 훈계하거나 완벽주의를 유도하는 표현을 쓰지 않습니다. 판단하거나 평가하지 않습니다.
- 각 단계는 15자 내외의 짧은 문장으로 씁니다.`
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['steps'],
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

  const { personaName, personaTone, title, context, detail } = req.body ?? {}
  if (!personaName || !personaTone || !title) {
    res.status(400).json({ error: 'personaName, personaTone and title are required' })
    return
  }

  const resolvedDetail: TaskBreakdownDetail = detail === 'detailed' ? 'detailed' : 'simple'
  const prompt = buildPrompt(personaName, personaTone, title, context, resolvedDetail)

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
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    )

    if (!geminiRes.ok) {
      const detailText = await geminiRes.text()
      res.status(502).json({ error: 'Gemini API error', detail: detailText })
      return
    }

    const data = await geminiRes.json()
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof responseText !== 'string') {
      res.status(502).json({ error: 'Gemini API returned no content' })
      return
    }

    const parsed: { steps?: unknown } = JSON.parse(responseText)
    const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : []
    const { max } = STEP_COUNT[resolvedDetail]
    const steps = rawSteps
      .filter((step): step is string => typeof step === 'string' && step.trim().length > 0)
      .map((step) => sanitizeText(step, 60))
      .slice(0, max)

    res.status(200).json({ steps })
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach Gemini API', detail: String(err) })
  }
}
