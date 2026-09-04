import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { InsightPeriod, RawLog } from '../types'

interface Props {
  userId: string
  period: InsightPeriod
  emotionFocus: string | null
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

function monthStartISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-stone-700">감정과 소비</p>
        <p className="mt-1 text-xs text-stone-400">{message}</p>
      </div>
    </div>
  )
}

// 판단 없이 관찰만 한다: "어떤 감정이 있던 날엔 소비가 더/덜 많았다"는 사실만 보여주고,
// 좋다/나쁘다 평가는 하지 않는다. Gemini 호출 없이 기존 raw_log를 조인해서 계산한다.
export function EmotionSpendingInsight({ userId, period, emotionFocus }: Props) {
  const [logs, setLogs] = useState<RawLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('raw_log')
      .select('*')
      .eq('user_id', userId)
      .then(({ data }) => {
        setLogs((data as RawLog[] | null) ?? [])
        setLoading(false)
      })
  }, [userId])

  if (loading) return null

  const today = todayISO()
  const start = period === 'week' ? daysAgoISO(6) : monthStartISO()
  const inRange = (date: string) => date >= start && date <= today

  const emotionsByDate = new Map<string, Set<string>>()
  for (const log of logs) {
    const emotion = log.content.emotion?.trim()
    const date = log.content.date
    if (!emotion || !date || !inRange(date)) continue
    const set = emotionsByDate.get(date) ?? new Set<string>()
    set.add(emotion)
    emotionsByDate.set(date, set)
  }

  // 우선 관찰할 감정을 지정하지 않았으면, 이 기간에 가장 자주 나온 감정을 자동으로 쓴다.
  let focusEmotion = emotionFocus
  if (!focusEmotion) {
    const counts = new Map<string, number>()
    for (const emotions of emotionsByDate.values()) {
      for (const emotion of emotions) counts.set(emotion, (counts.get(emotion) ?? 0) + 1)
    }
    focusEmotion = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }

  if (!focusEmotion) return <EmptyCard message="아직 관찰할 만큼 감정이 담긴 기록이 없어요." />

  const focusDates = new Set(
    [...emotionsByDate.entries()].filter(([, emotions]) => emotions.has(focusEmotion as string)).map(([date]) => date),
  )

  const spendByDate = new Map<string, number>()
  for (const log of logs) {
    const date = log.content.date
    if (log.type !== 'consumption' || !date || !inRange(date)) continue
    spendByDate.set(date, (spendByDate.get(date) ?? 0) + (log.content.amount ?? 0))
  }

  let focusTotal = 0
  let focusCount = 0
  let otherTotal = 0
  let otherCount = 0
  for (const [date, amount] of spendByDate.entries()) {
    if (focusDates.has(date)) {
      focusTotal += amount
      focusCount += 1
    } else {
      otherTotal += amount
      otherCount += 1
    }
  }

  if (focusCount === 0 || otherCount === 0) return <EmptyCard message="비교할 만큼 데이터가 아직 부족해요." />

  const focusAvg = focusTotal / focusCount
  const otherAvg = otherTotal / otherCount
  const diffPercent = otherAvg > 0 ? Math.round(((focusAvg - otherAvg) / otherAvg) * 100) : 0
  const maxAvg = Math.max(focusAvg, otherAvg)

  const message =
    Math.abs(diffPercent) < 5
      ? `'${focusEmotion}' 감정이 있던 날과 그 외 날의 소비는 비슷했어요.`
      : diffPercent > 0
        ? `'${focusEmotion}' 감정이 있던 날은 그 외 날보다 소비가 약 ${diffPercent}% 많았어요.`
        : `'${focusEmotion}' 감정이 있던 날은 그 외 날보다 소비가 약 ${Math.abs(diffPercent)}% 적었어요.`

  return (
    <div className="mx-auto w-full max-w-lg px-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-stone-700">감정과 소비</p>
        <p className="mt-1 text-xs text-stone-500">{message}</p>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-stone-600">
            <span className="w-24 shrink-0 truncate text-left">'{focusEmotion}' 있던 날</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-amber-100">
              <div
                className="h-full rounded-r-full bg-amber-400"
                style={{ width: `${maxAvg > 0 ? (focusAvg / maxAvg) * 100 : 0}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right tabular-nums">{Math.round(focusAvg).toLocaleString()}원</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-stone-600">
            <span className="w-24 shrink-0 truncate text-left">그 외 날</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-amber-100">
              <div
                className="h-full rounded-r-full bg-amber-400"
                style={{ width: `${maxAvg > 0 ? (otherAvg / maxAvg) * 100 : 0}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right tabular-nums">{Math.round(otherAvg).toLocaleString()}원</span>
          </div>
        </div>
      </div>
    </div>
  )
}
