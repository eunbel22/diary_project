import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { RawLog } from '../types'

interface Props {
  userId: string
}

type Period = 'recent' | 'month'

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

export function EmotionSummary({ userId }: Props) {
  const [period, setPeriod] = useState<Period>('recent')
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
  const start = period === 'recent' ? daysAgoISO(6) : monthStartISO()

  const counts = new Map<string, number>()
  for (const log of logs) {
    const emotion = log.content.emotion?.trim()
    const date = log.content.date ?? ''
    if (!emotion || date < start || date > today) continue
    counts.set(emotion, (counts.get(emotion) ?? 0) + 1)
  }
  const breakdown = [...counts.entries()]
    .map(([emotion, count]) => ({ emotion, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
  const maxCount = breakdown[0]?.count ?? 0

  return (
    <div className="mx-auto w-full max-w-lg px-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-stone-700">요즘 마음</p>
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setPeriod('recent')}
              className={`rounded-full px-2 py-1 ${
                period === 'recent' ? 'bg-amber-500 text-white' : 'text-stone-400'
              }`}
            >
              최근 7일
            </button>
            <button
              type="button"
              onClick={() => setPeriod('month')}
              className={`rounded-full px-2 py-1 ${
                period === 'month' ? 'bg-amber-500 text-white' : 'text-stone-400'
              }`}
            >
              이번 달
            </button>
          </div>
        </div>

        {breakdown.length === 0 ? (
          <p className="mt-3 text-xs text-stone-400">아직 감정이 담긴 기록이 없어요.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {breakdown.map(({ emotion, count }) => (
              <div key={emotion} className="flex items-center gap-2 text-xs text-stone-600">
                <span className="w-16 shrink-0 truncate text-left">{emotion}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-amber-100">
                  <div
                    className="h-full rounded-r-full bg-amber-400"
                    style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
