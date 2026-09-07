import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { RawLog, WeeklyReview as WeeklyReviewRow, WeeklyReviewPeriod } from '../types'

interface Props {
  userId: string
  personaName: string
  personaTone: string
  period: WeeklyReviewPeriod
  includeEmotion: boolean
}

function todayISO() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function daysAgoISO(days: number) {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  local.setDate(local.getDate() - days)
  return local.toISOString().slice(0, 10)
}

function daysSince(iso: string) {
  const then = new Date(iso).getTime()
  const now = Date.now()
  return (now - then) / (1000 * 60 * 60 * 24)
}

// 놓친 것은 언급하지 않고 좋았던 순간 위주로만 쓰는 캐릭터 목소리 회고.
// "돌아보기"는 오늘의 다이어리 생성과 같이 사용자가 직접 눌러서만 만들어지고,
// 앱은 그럴 때가 됐다는 것만 조용히 알려준다(밀린 일정 이관 배너와 같은 패턴).
export function WeeklyReview({ userId, personaName, personaTone, period, includeEmotion }: Props) {
  const [latest, setLatest] = useState<WeeklyReviewRow | null>(null)
  const [hasRecentDiary, setHasRecentDiary] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const periodDays = period === 'biweekly' ? 14 : 7
  const periodLabel = period === 'biweekly' ? '지난 2주' : '지난 1주'
  const periodStart = daysAgoISO(periodDays - 1)
  const today = todayISO()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase
        .from('weekly_review')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('diary_entries')
        .select('id')
        .eq('user_id', userId)
        .gte('date', periodStart)
        .lte('date', today),
    ]).then(([latestRes, diaryRes]) => {
      if (cancelled) return
      setLatest((latestRes.data as WeeklyReviewRow | null) ?? null)
      setHasRecentDiary(((diaryRes.data as { id: string }[] | null) ?? []).length > 0)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [userId, periodStart, today])

  if (loading) return null

  const due = !latest || daysSince(latest.created_at) >= periodDays

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const { data: diaryRows } = await supabase
        .from('diary_entries')
        .select('body')
        .eq('user_id', userId)
        .gte('date', periodStart)
        .lte('date', today)
        .order('date', { ascending: true })
      const diaryBodies = ((diaryRows as { body: string }[] | null) ?? []).map((row) => row.body)

      let emotions: string[] = []
      if (includeEmotion) {
        const { data: logRows } = await supabase
          .from('raw_log')
          .select('content')
          .eq('user_id', userId)
          .gte('created_at', `${periodStart}T00:00:00`)
        const counts = new Map<string, number>()
        for (const row of (logRows as { content: RawLog['content'] }[] | null) ?? []) {
          const emotion = row.content?.emotion?.trim()
          if (emotion) counts.set(emotion, (counts.get(emotion) ?? 0) + 1)
        }
        emotions = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([emotion]) => emotion)
      }

      const res = await fetch('/api/generate-weekly-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personaName, personaTone, periodLabel, diaryBodies, emotions }),
      })
      if (!res.ok) throw new Error('generate-weekly-review failed')
      const { body } = (await res.json()) as { body: string }

      const { data: inserted, error: insertError } = await supabase
        .from('weekly_review')
        .insert({ user_id: userId, period_start: periodStart, period_end: today, body })
        .select()
        .single()
      if (insertError) throw insertError

      setLatest(inserted as WeeklyReviewRow)
    } catch (err) {
      setError('회고를 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  if (due && hasRecentDiary) {
    return (
      <div className="mx-auto w-full max-w-lg px-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-stone-700">{periodLabel}을 돌아볼까요?</p>
          <p className="mt-1 text-xs text-stone-400">{personaName}가 그동안의 순간들을 정리해줘요.</p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="mt-3 self-start rounded-full bg-amber-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {generating ? '돌아보는 중...' : '돌아보기'}
          </button>
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
      </div>
    )
  }

  if (latest) {
    return (
      <div className="mx-auto w-full max-w-lg px-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-stone-700">
            {latest.period_start} ~ {latest.period_end} 회고
          </p>
          <p className="mt-2 text-sm whitespace-pre-wrap text-stone-600">{latest.body}</p>
        </div>
      </div>
    )
  }

  return null
}
