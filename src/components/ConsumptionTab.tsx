import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { CONSUMPTION_CATEGORIES, type ConsumptionCategory, type RawLog } from '../types'

interface Props {
  userId: string
}

function dateToISO(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function categoryOf(log: RawLog): ConsumptionCategory {
  return log.content.category ?? '기타'
}

export function ConsumptionTab({ userId }: Props) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [logs, setLogs] = useState<RawLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const start = `${dateToISO(new Date(year, month, 1))}T00:00:00`
    const end = `${dateToISO(new Date(year, month + 1, 0))}T23:59:59.999`

    const { data } = await supabase
      .from('raw_log')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'consumption')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })

    setLogs((data as RawLog[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [viewDate])

  const handleDelete = async (id: string) => {
    await supabase.from('raw_log').delete().eq('id', id)
    await load()
  }

  if (loading) return null

  const total = logs.reduce((sum, log) => sum + (log.content.amount ?? 0), 0)

  const totalsByCategory = new Map<ConsumptionCategory, number>()
  for (const log of logs) {
    const category = categoryOf(log)
    totalsByCategory.set(category, (totalsByCategory.get(category) ?? 0) + (log.content.amount ?? 0))
  }
  const breakdown = CONSUMPTION_CATEGORIES.map((category) => ({
    category,
    amount: totalsByCategory.get(category) ?? 0,
  }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const maxAmount = breakdown[0]?.amount ?? 0

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-4">
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="px-2 text-stone-400 hover:text-stone-600"
          aria-label="이전 달"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-stone-700">
          {viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월
        </span>
        <button
          type="button"
          onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          className="px-2 text-stone-400 hover:text-stone-600"
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div className="mt-3 rounded-2xl bg-white p-4 text-center shadow-sm">
        <p className="text-xs text-stone-400">이번 달 소비 합계</p>
        <p className="mt-1 text-xl font-semibold text-stone-800">{total.toLocaleString()}원</p>
      </div>

      {breakdown.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
          {breakdown.map(({ category, amount }) => (
            <div key={category} className="flex items-center gap-2 text-xs text-stone-600">
              <span className="w-16 shrink-0 text-left">{category}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-amber-100">
                <div
                  className="h-full rounded-r-full bg-amber-400"
                  style={{ width: `${maxAmount > 0 ? (amount / maxAmount) * 100 : 0}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right tabular-nums">{amount.toLocaleString()}원</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {logs.length === 0 ? (
          <p className="text-center text-sm text-stone-400">이번 달엔 남긴 소비 기록이 없어요.</p>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-sm shadow-sm"
            >
              <div>
                <p className="font-medium text-stone-700">{log.content.item ?? '소비'}</p>
                <p className="text-xs text-stone-400">
                  {categoryOf(log)} · {new Date(log.created_at).toLocaleDateString('ko-KR')}
                  {log.content.place ? ` · ${log.content.place}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium text-stone-700">
                  {log.content.amount != null ? `${log.content.amount.toLocaleString()}원` : '-'}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(log.id)}
                  className="text-xs text-stone-300 hover:text-stone-500"
                >
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
