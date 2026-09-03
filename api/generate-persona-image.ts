const IMAGEN_MODEL = 'imagen-3.0-generate-002'

interface ApiRequest {
  method?: string
  body: { name?: string; tone?: string; interests?: string[] }
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

  const { name, tone, interests } = req.body ?? {}
  if (!name || !tone) {
    res.status(400).json({ error: 'name and tone are required' })
    return
  }

  const prompt = [
    '따뜻하고 부드러운 색연필 느낌의 다이어리 캐릭터 초상화.',
    `이름: ${name}.`,
    `성격과 말투: ${tone}.`,
    interests?.length ? `관심사: ${interests.join(', ')}.` : '',
    '배경은 단순하고, 얼굴과 상반신이 보이는 정면 초상. 텍스트 없음.',
  ]
    .filter(Boolean)
    .join(' ')

  try {
    const imagenRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1 },
        }),
      },
    )

    if (!imagenRes.ok) {
      const detail = await imagenRes.text()
      res.status(502).json({ error: 'Imagen API error', detail })
      return
    }

    const data = await imagenRes.json()
    const base64 = data?.predictions?.[0]?.bytesBase64Encoded
    if (typeof base64 !== 'string') {
      res.status(502).json({ error: 'Imagen API returned no image' })
      return
    }

    res.status(200).json({ imageBase64: base64, mimeType: 'image/png' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach Imagen API', detail: String(err) })
  }
}
