import type { ChatMessage, OnboardingTurnResponse, PersonaDraft } from '../src/types'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'

const SYSTEM_PROMPT = `당신은 다이어리 앱의 캐릭터를 만들기 위해 사용자와 대화하는 온보딩 도우미입니다.
목표: 몇 번의 짧은 대화로 사용자의 성격, 말투 취향, 관심사를 파악해 캐릭터(페르소나)의 이름·말투·관심사를 정합니다.

반드시 지킬 규칙:
- 재촉하거나 훈계하거나 완벽주의를 유도하는 표현을 절대 쓰지 않습니다.
- 판단하거나 평가하는 말투를 쓰지 않습니다. 항상 다정하고 편안한 톤을 유지합니다.
- 꼭 필요한 것만 묻고, 사용자가 짧게 대답해도 그 안에서 자연스럽게 추정해 이어갑니다.
- 대화는 4~6번 정도의 주고받음 안에 마무리합니다. 정보가 충분하면 굳이 더 캐묻지 않습니다.
- 사용자가 캐릭터 이름을 정하지 않았다면, 대화 내용을 바탕으로 부드러운 이름을 제안합니다.
- 마지막 턴에는 isComplete를 true로 하고 persona 필드(name, tone, interests)를 반드시 채웁니다.
- isComplete가 false인 동안에는 persona 필드를 생략합니다.
- assistantMessage는 항상 캐릭터가 사용자에게 직접 말하듯 자연스러운 대화체로 작성합니다.
- persona.name은 2~6자의 짧은 이름 하나만 적습니다 (숫자나 특수문자 없이).
- persona.tone은 한 문장, 40자 이내로 간결하게 적습니다.
- persona.interests는 최대 3개, 각 항목은 10자 이내의 짧은 단어로 적습니다.
- 위 글자 수 제한을 넘기거나 같은 문자를 반복하는 등 비정상적인 출력을 만들지 않습니다.`

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    assistantMessage: { type: 'STRING' },
    isComplete: { type: 'BOOLEAN' },
    persona: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        tone: { type: 'STRING' },
        interests: { type: 'ARRAY', items: { type: 'STRING' } },
      },
    },
  },
  required: ['assistantMessage', 'isComplete'],
}

function truncate(value: string, max: number) {
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

// 모델이 드물게 반복 루프에 빠져 글자 수 지침을 무시할 수 있으므로,
// 화면이 깨지지 않도록 서버에서 한 번 더 길이를 강제한다.
function sanitizePersona(persona: PersonaDraft): PersonaDraft {
  return {
    name: truncate(persona.name ?? '', 12),
    tone: truncate(persona.tone ?? '', 60),
    interests: (persona.interests ?? []).slice(0, 5).map((interest) => truncate(interest, 20)),
  }
}

interface ApiRequest {
  method?: string
  body: { messages?: ChatMessage[] }
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

  const messages = req.body?.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages is required' })
    return
  }

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
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
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
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof text !== 'string') {
      res.status(502).json({ error: 'Gemini API returned no content' })
      return
    }

    const parsed: OnboardingTurnResponse = JSON.parse(text)
    if (parsed.isComplete && parsed.persona) {
      parsed.persona = sanitizePersona(parsed.persona)
    }
    res.status(200).json(parsed)
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach Gemini API', detail: String(err) })
  }
}
