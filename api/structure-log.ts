import { inferConsumptionCategory } from '../src/lib/consumptionCategory'
import type { StructureLogResponse } from '../src/types'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'

function buildSystemPrompt(today: string) {
  return `당신은 다이어리 앱의 자동 구조화 도우미입니다. 사용자가 텍스트로 적거나 음성으로 말한 내용에서
소비(consumption) / 일정(schedule) / 사건(event) 항목을 추출해 entries 배열에 담습니다.

한 번의 말에 서로 구분되는 사실이 여러 개 섞여 있을 수 있습니다(예: "커피 5천원 썼고 이따 3시에 병원
예약 있어" → 소비 1건 + 일정 1건). 그런 경우 entries에 각각 별도 항목으로 나눠 담습니다. 하나의
사실을 부연 설명하는 수준(예: 커피를 마시면서 잠깐 나눈 대화)이라면 굳이 나누지 말고 하나의 항목으로
담습니다. 대부분의 경우 entries는 항목 1개입니다.

각 항목의 분류 기준 (겹치는 경우 이 순서로 우선 적용):
1. 돈을 쓴 이야기(구매, 결제, 지출)면 무조건 consumption입니다.
2. 아직 일어나지 않은, 앞으로 예정된 약속·할 일이면 schedule입니다.
3. 이미 일어난 일, 겪은 일, 감정·상태에 대한 이야기면 event입니다.

반드시 지킬 규칙:
- 오디오가 주어지면 먼저 정확히 전사해서 transcript에 담습니다. 텍스트가 주어지면 transcript에 입력을 그대로 담습니다.
- consumption 항목의 content.amount(금액)는 유일한 필수 정보입니다. 금액이 명확히 언급되지 않았다면
  content.amount는 비워두고 그 항목의 missingRequired를 true로 설정합니다. 이 경우를 제외하면
  missingRequired는 항상 false입니다. 금액 외의 정보 때문에 missingRequired를 true로 만들지 않습니다.
- item(항목), place(장소), time(시간), emotion(감정) 등 금액 외의 정보는 언급이 없으면 맥락에 맞게
  자연스럽게 추정해서 채우고, 절대 사용자에게 되묻지 않습니다. 하나라도 추정한 값이 있으면 그 항목의
  isEstimated를 true로 설정합니다.
- schedule/event의 content.date는 언급이 없으면 오늘 날짜(${today})로 자동 채웁니다. 날짜를 확인하는
  질문을 하지 않습니다.
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
      if (entry.type === 'consumption' && entry.content) {
        entry.content.category = inferConsumptionCategory(
          `${entry.content.item ?? ''} ${parsed.transcript ?? ''}`,
        )
      }
    }

    res.status(200).json(parsed)
  } catch (err) {
    console.error('structure-log failed:', err)
    res.status(500).json({ error: 'Failed to structure the log', detail: String(err) })
  }
}
