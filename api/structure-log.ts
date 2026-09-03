const GEMINI_MODEL = 'gemini-3.5-flash-lite'

function buildSystemPrompt(today: string) {
  return `당신은 다이어리 앱의 자동 구조화 도우미입니다. 사용자가 텍스트로 적거나 음성으로 말한 내용을
소비(consumption) / 일정(schedule) / 사건(event) 중 하나로 분류하고 핵심 정보를 추출합니다.

반드시 지킬 규칙:
- 오디오가 주어지면 먼저 정확히 전사해서 transcript에 담습니다. 텍스트가 주어지면 transcript에 입력을 그대로 담습니다.
- consumption일 때 content.amount(금액)는 유일한 필수 정보입니다. 금액이 명확히 언급되지 않았다면
  content.amount는 비워두고 missingRequired를 true로 설정합니다. 이 경우를 제외하면 missingRequired는
  항상 false입니다. 금액 외의 정보 때문에 missingRequired를 true로 만들지 않습니다.
- item(항목), place(장소), time(시간), emotion(감정) 등 금액 외의 정보는 언급이 없으면 맥락에 맞게
  자연스럽게 추정해서 채우고, 절대 사용자에게 되묻지 않습니다. 하나라도 추정한 값이 있으면
  isEstimated를 true로 설정합니다.
- schedule/event의 content.date는 언급이 없으면 오늘 날짜(${today})로 자동 채웁니다. 날짜를 확인하는
  질문을 하지 않습니다.
- 판단하거나 평가하는 내용을 덧붙이지 않고, 사용자가 말한 사실만 담백하게 기록합니다.`
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcript: { type: 'STRING' },
    type: { type: 'STRING', enum: ['consumption', 'schedule', 'event'] },
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
  },
  required: ['type', 'content', 'isEstimated', 'missingRequired'],
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

    const parsed = JSON.parse(responseText)
    res.status(200).json(parsed)
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach Gemini API', detail: String(err) })
  }
}
