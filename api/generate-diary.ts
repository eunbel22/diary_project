import type { RawLogContent, RawLogType } from '../src/types'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'

interface DiaryEntryInput {
  type: RawLogType
  content: RawLogContent
}

interface GenerateDiaryRequest {
  personaName?: string
  personaTone?: string
  date?: string
  entries?: DiaryEntryInput[]
  previousBody?: string
  feedback?: string
}

interface ApiRequest {
  method?: string
  body: GenerateDiaryRequest
}

interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

function describeEntry(entry: DiaryEntryInput) {
  const c = entry.content ?? {}
  if (entry.type === 'consumption') {
    const amount = c.amount != null ? `${c.amount.toLocaleString()}원` : ''
    return `[소비] ${c.item ?? '어떤 소비'}${amount ? ` ${amount}` : ''}${c.place ? ` (${c.place})` : ''}`
  }
  if (entry.type === 'schedule') {
    return `[일정] ${c.title ?? '일정'}${c.time ? ` ${c.time}` : ''}${c.place ? ` @${c.place}` : ''}`
  }
  return `[사건] ${c.description ?? '있었던 일'}${c.emotion ? ` (감정: ${c.emotion})` : ''}`
}

function buildPrompt(
  personaName: string,
  personaTone: string,
  date: string,
  entries: DiaryEntryInput[],
  previousBody?: string,
  feedback?: string,
) {
  const lines = entries.length > 0 ? entries.map(describeEntry).join('\n') : '(오늘 남긴 기록 없음)'

  let prompt = `당신은 사용자의 다이어리 캐릭터 "${personaName}"입니다. 말투와 성격: ${personaTone}.
아래는 사용자가 오늘(${date}) 남긴 기록입니다. 이 사실만 바탕으로, 위 캐릭터의 말투를 살려서
다이어리 문단을 하나 써주세요.

오늘의 기록:
${lines}

반드시 지킬 규칙:
- 기록에 없는 사실을 새로 지어내지 않습니다.
- 재촉하거나 훈계하거나 완벽주의를 유도하는 표현을 쓰지 않습니다. 판단하거나 평가하지 않습니다.
- 200~400자 정도의 자연스러운 문단 하나로 씁니다. 목록이나 번호를 매기지 않습니다.
- 다이어리 본문 텍스트만 출력합니다. 다른 설명이나 따옴표를 덧붙이지 않습니다.`

  if (previousBody) {
    prompt += `\n\n이전에 쓴 글:\n${previousBody}`
  }
  if (feedback) {
    prompt += `\n\n사용자가 이 글에 대해 이런 피드백을 줬습니다: "${feedback}". 이를 반영해서 다시 써주세요.`
  }

  return prompt
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

  const { personaName, personaTone, date, entries, previousBody, feedback } = req.body ?? {}
  if (!personaName || !personaTone || !date) {
    res.status(400).json({ error: 'personaName, personaTone and date are required' })
    return
  }

  const prompt = buildPrompt(personaName, personaTone, date, entries ?? [], previousBody, feedback)

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

    res.status(200).json({ body: text.trim() })
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach Gemini API', detail: String(err) })
  }
}
