import { capLength } from '../src/lib/textSanitize.js'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'

interface GenerateWeeklyReviewRequest {
  personaName?: string
  personaTone?: string
  periodLabel?: string
  diaryBodies?: string[]
  emotions?: string[]
}

interface ApiRequest {
  method?: string
  body: GenerateWeeklyReviewRequest
}

interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

function buildPrompt(
  personaName: string,
  personaTone: string,
  periodLabel: string,
  diaryBodies: string[],
  emotions: string[],
) {
  const bodiesText =
    diaryBodies.length > 0 ? diaryBodies.map((body, i) => `(${i + 1}) ${body}`).join('\n\n') : '(이 기간에 남긴 다이어리 없음)'
  const emotionLine = emotions.length > 0 ? `이 기간에 자주 등장한 감정: ${emotions.join(', ')}` : ''

  return `당신은 사용자의 다이어리 캐릭터 "${personaName}"입니다. 말투와 성격: ${personaTone}.
아래는 사용자가 ${periodLabel} 동안 쓴 다이어리들입니다. 이 내용을 바탕으로, 이 기간을 돌아보는
짧은 회고를 캐릭터의 말투로 하나 써주세요.

${periodLabel} 동안의 다이어리:
${bodiesText}
${emotionLine}

반드시 지킬 규칙:
- 있었던 좋은 순간, 기억할 만한 순간, 이룬 것 위주로 씁니다. "이런 순간들이 있었어" 같은 느낌으로.
- 놓친 일, 못 한 일, 미완료된 것은 절대 언급하지 않습니다. 부족함을 지적하거나 아쉬움을 표현하지 않습니다.
- 재촉하거나 훈계하거나 완벽주의를 유도하는 표현을 쓰지 않습니다. 판단하거나 평가하지 않습니다.
${emotionLine ? '- 감정의 흐름도 짧게 자연스럽게 녹여서 씁니다.' : ''}
- 150~300자 정도의 짧은 문단 하나로 씁니다.
- 회고 텍스트만 출력합니다. 다른 설명이나 따옴표를 덧붙이지 않습니다.`
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

  const { personaName, personaTone, periodLabel, diaryBodies, emotions } = req.body ?? {}
  if (!personaName || !personaTone || !periodLabel) {
    res.status(400).json({ error: 'personaName, personaTone and periodLabel are required' })
    return
  }

  const prompt = buildPrompt(personaName, personaTone, periodLabel, diaryBodies ?? [], emotions ?? [])

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

    // generate-diary.ts와 같은 이유로 반복 감지는 하지 않고 길이 상한만 둔다.
    res.status(200).json({ body: capLength(text, 600) })
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach Gemini API', detail: String(err) })
  }
}
