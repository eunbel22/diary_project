import { sanitizeText } from '../src/lib/textSanitize.js'
import type { ChatMessage, OnboardingTurnResponse, PersonaDraft } from '../src/types'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'

const COMMON_RULES = `- 한 턴(assistantMessage)에는 질문을 하나만 합니다. 여러 개를 한꺼번에 묻지 않습니다 —
  사용자가 그중 하나만 답하면 나머지 질문은 그냥 흘러가 버려서 대화가 꼬입니다.
  더 물어보고 싶은 게 있어도 다음 턴으로 미룹니다.
- 재촉하거나 훈계하거나 완벽주의를 유도하는 표현을 절대 쓰지 않습니다.
- 판단하거나 평가하는 말투를 쓰지 않습니다. 항상 다정하고 편안한 톤을 유지합니다.
- 사용자가 캐릭터 이름을 정하지 않았다면, 대화 내용을 바탕으로 부드러운 이름을 제안합니다.
- 마지막 턴에는 isComplete를 true로 하고 persona 필드(name, tone, interests)를 반드시 채웁니다.
- isComplete가 false인 동안에는 persona 필드를 생략합니다.
- assistantMessage는 항상 캐릭터가 사용자에게 직접 말하듯 자연스러운 대화체로 작성합니다.
- persona.name은 2~6자의 짧은 이름 하나만 적습니다 (숫자나 특수문자 없이). 이 이름은 나중에
  그림으로도 그려지므로, "토끼"·"구름"처럼 흔한 사물이나 동물을 그대로 가리키는 일반명사는
  이름으로 쓰지 않습니다(그 사물·동물이 그대로 그려져 버립니다). 뜻보다는 소리가 예쁜, 고유한
  이름(예: 모모, 두리, 소소)을 짓습니다.
- persona.interests는 대화에서 사용자가 실제로 언급한 것 위주로 뽑습니다. 사용자가 구체적인
  음식·취미·활동 등을 언급했다면 최소 1개는 반드시 interests에 그대로 담습니다. 최대 3개,
  각 항목은 10자 이내의 짧은 단어로 적습니다.
- persona.tone에는 성격·말투뿐 아니라, 가능하면 위 interests의 느낌이 은근히 묻어나게 적습니다.
- 위 글자 수 제한을 넘기거나 같은 문자를 반복하는 등 비정상적인 출력을 만들지 않습니다.`

const INITIAL_SYSTEM_PROMPT = `당신은 다이어리 앱의 캐릭터를 만들기 위해 사용자와 대화하는 온보딩 도우미입니다.
목표: 몇 번의 짧은 대화로 사용자의 성격, 말투 취향, 관심사를 파악해 캐릭터(페르소나)의 이름·말투·관심사를 정합니다.

반드시 지킬 규칙:
- 꼭 필요한 것만 묻고, 사용자가 짧게 대답해도 그 안에서 자연스럽게 추정해 이어갑니다.
- 대화는 4~6번 정도의 주고받음 안에 마무리합니다. 정보가 충분하면 굳이 더 캐묻지 않습니다.
${COMMON_RULES}`

// 쿠폰으로 캐릭터를 다시 만드는 경우: 처음 온보딩과 달리 사용자가 이미 앱을 써봤고
// 정성껏 모은 쿠폰을 쓰는 특별한 순간이므로, 대화를 서두르지 않고 좀 더 깊게 나눈다.
const REBUILD_SYSTEM_PROMPT = `당신은 다이어리 앱의 캐릭터를 새로 만들기 위해 사용자와 대화하는 도우미입니다.
사용자는 이미 캐릭터를 써봤고, 쿠폰을 모아 정성껏 다시 만들고 싶어하는 것이니 서두르지 않고
평소보다 깊게 대화해도 됩니다. 요즘 달라진 점, 좋아하게 된 것, 원하는 말투의 결 등을 여유 있게 물어봅니다.

반드시 지킬 규칙:
- 대화는 8~12번 정도의 주고받음 정도로, 여유 있게 진행합니다. 성급하게 마무리짓지 않습니다.
- 그렇다고 같은 질문을 반복하거나 억지로 말을 늘리지 않습니다. 자연스럽게 대화가 이어지게 합니다.
${COMMON_RULES}`

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

// 모델이 드물게 반복 루프에 빠져 글자 수 지침을 무시할 수 있으므로,
// 화면이 깨지지 않도록 서버에서 한 번 더 길이·반복을 강제한다.
function sanitizePersona(persona: PersonaDraft): PersonaDraft {
  return {
    name: sanitizeText(persona.name ?? '', 12),
    tone: sanitizeText(persona.tone ?? '', 60),
    interests: (persona.interests ?? []).slice(0, 5).map((interest) => sanitizeText(interest, 20)),
  }
}

interface ApiRequest {
  method?: string
  body: { messages?: ChatMessage[]; mode?: 'initial' | 'rebuild' }
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
  const systemPrompt = req.body?.mode === 'rebuild' ? REBUILD_SYSTEM_PROMPT : INITIAL_SYSTEM_PROMPT

  // 온보딩 대화가 왜 느린지(모델 자체 지연인지, 그 외 처리인지) 나중에 Vercel 로그에서
  // 바로 구분할 수 있도록 Gemini 호출 구간과 핸들러 전체 구간의 소요 시간을 남긴다.
  const handlerStart = Date.now()
  const turnLabel = `mode=${req.body?.mode ?? 'initial'} turn=${messages.length}`

  try {
    const geminiStart = Date.now()
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    )
    const geminiMs = Date.now() - geminiStart

    if (!geminiRes.ok) {
      const detail = await geminiRes.text()
      console.error(`[onboarding-chat] ${turnLabel} gemini error after ${geminiMs}ms:`, detail)
      res.status(502).json({ error: 'Gemini API error', detail })
      return
    }

    const data = await geminiRes.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof text !== 'string') {
      console.error(`[onboarding-chat] ${turnLabel} gemini returned no content after ${geminiMs}ms`)
      res.status(502).json({ error: 'Gemini API returned no content' })
      return
    }

    const parsed: OnboardingTurnResponse = JSON.parse(text)
    if (parsed.isComplete && parsed.persona) {
      parsed.persona = sanitizePersona(parsed.persona)
    }
    console.log(`[onboarding-chat] ${turnLabel} gemini=${geminiMs}ms total=${Date.now() - handlerStart}ms`)
    res.status(200).json(parsed)
  } catch (err) {
    console.error(`[onboarding-chat] ${turnLabel} failed after ${Date.now() - handlerStart}ms:`, err)
    res.status(500).json({ error: 'Failed to reach Gemini API', detail: String(err) })
  }
}
