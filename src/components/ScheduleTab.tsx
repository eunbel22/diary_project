import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { RawLog } from '../types'

interface Props {
  userId: string
}

function todayISO() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function ScheduleRow({
  log,
  onDelete,
  muted,
}: {
  log: RawLog
  onDelete: (id: string) => void
  muted?: boolean
}) {
  const c = log.content
  return (
    <div
      className={`flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ${
        muted ? 'opacity-60' : ''
      }`}
    >
      <div className="text-left text-sm text-stone-700">
        <p className="font-medium">{c.title ?? '일정'}</p>
        <p className="text-xs text-stone-400">{[c.date, c.time, c.place].filter(Boolean).join(' · ')}</p>
        {c.raw_text && <p className="mt-1 text-xs text-stone-400">"{c.raw_text}"</p>}
      </div>
      <button
        type="button"
        onClick={() => onDelete(log.id)}
        className="text-xs text-stone-300 hover:text-stone-500"
      >
        삭제
      </button>
    </div>
  )
}

export function ScheduleTab({ userId }: Props) {
  const [logs, setLogs] = useState<RawLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const { data } = await supabase
      .from('raw_log')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'schedule')
      .order('created_at', { ascending: false })
    setLogs((data as RawLog[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleDelete = async (id: string) => {
    await supabase.from('raw_log').delete().eq('id', id)
    await load()
  }

  if (loading) return null

  const today = todayISO()
  const upcoming = logs
    .filter((l) => (l.content.date ?? '') >= today)
    .sort((a, b) => (a.content.date ?? '').localeCompare(b.content.date ?? ''))
  const past = logs.filter((l) => (l.content.date ?? '') < today)

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-4">
      <h2 className="mb-2 text-sm font-semibold text-stone-700">다가오는 일정</h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-stone-400">예정된 일정이 없어요.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {upcoming.map((log) => (
            <ScheduleRow key={log.id} log={log} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold text-stone-700">지난 일정</h2>
          <div className="flex flex-col gap-2">
            {past.map((log) => (
              <ScheduleRow key={log.id} log={log} onDelete={handleDelete} muted />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
