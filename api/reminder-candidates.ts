import { createClient } from '@supabase/supabase-js'

interface ApiRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
}

interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

function kstTodayISO() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // Vercel은 CRON_SECRET 환경변수가 설정되어 있으면 크론이 호출할 때
  // Authorization: Bearer <CRON_SECRET> 헤더를 자동으로 붙여준다. 이를 검증해
  // 외부에서 이 엔드포인트를 함부로 호출하지 못하게 막는다.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' })
    return
  }

  // RLS를 우회해 모든 사용자의 옵트인 상태를 확인해야 하므로 anon key가 아닌
  // service_role 키로 클라이언트를 만든다. 이 키는 절대 클라이언트로 내려가면 안 된다.
  const admin = createClient(supabaseUrl, serviceRoleKey)

  try {
    const { data: optedIn, error: personaError } = await admin
      .from('persona')
      .select('user_id, name')
      .eq('reminder_opt_in', true)

    if (personaError) throw personaError
    if (!optedIn || optedIn.length === 0) {
      res.status(200).json({ candidates: [], count: 0 })
      return
    }

    const today = kstTodayISO()
    const rangeStart = `${today}T00:00:00+09:00`
    const rangeEnd = `${today}T23:59:59.999+09:00`

    const { data: loggedToday, error: logError } = await admin
      .from('raw_log')
      .select('user_id')
      .in(
        'user_id',
        optedIn.map((p) => p.user_id),
      )
      .gte('created_at', rangeStart)
      .lte('created_at', rangeEnd)

    if (logError) throw logError

    const loggedUserIds = new Set((loggedToday ?? []).map((row) => row.user_id))
    const candidates = optedIn.filter((p) => !loggedUserIds.has(p.user_id))

    // TODO: 실제 이메일 발송은 아직 연결되어 있지 않다. Resend 같은 이메일 서비스 계정이
    // 준비되면, 여기서 candidates 각각에게 재촉·죄책감 유발 문구 없이 부드러운 리마인더
    // 메일을 보낸다 (원칙 6·7 참고). 지금은 대상 목록만 계산해서 로그로 남긴다.
    console.log(`오늘(${today}) 리마인더 대상: ${candidates.length}명`)

    res.status(200).json({ candidates, count: candidates.length, date: today })
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute reminder candidates', detail: String(err) })
  }
}
