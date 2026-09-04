import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { RawLog } from '../types'

interface Props {
  userId: string
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function todayISO() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function dateToISO(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function getMonthWeeks(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (Date | null)[] = []
  for (let i = 0; i < firstDay.getDay(); i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function ddayLabel(dateStr: string | undefined, today: string) {
  if (!dateStr) return null
  const diff = Math.round(
    (new Date(`${dateStr}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000,
  )
  if (diff === 0) return 'D-DAY'
  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`
}

function ScheduleRow({
  log,
  today,
  onDelete,
  muted,
}: {
  log: RawLog
  today: string
  onDelete: (id: string) => void
  muted?: boolean
}) {
  const c = log.content
  const dday = ddayLabel(c.date, today)
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
      <div className="flex items-center gap-3">
        {dday && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              dday === 'D-DAY' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {dday}
          </span>
        )}
        <button
          type="button"
          onClick={() => onDelete(log.id)}
          className="text-xs text-stone-300 hover:text-stone-500"
        >
          삭제
        </button>
      </div>
    </div>
  )
}

export function ScheduleTab({ userId }: Props) {
  const [logs, setLogs] = useState<RawLog[]>([])
  const [loading, setLoading] = useState(true)
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

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
  const datesWithSchedule = new Set(logs.map((l) => l.content.date).filter(Boolean) as string[])
  const weeks = getMonthWeeks(viewDate.getFullYear(), viewDate.getMonth())

  const visible = selectedDate ? logs.filter((l) => l.content.date === selectedDate) : logs
  const upcoming = visible
    .filter((l) => (l.content.date ?? '') >= today)
    .sort((a, b) => (a.content.date ?? '').localeCompare(b.content.date ?? ''))
  const past = visible
    .filter((l) => (l.content.date ?? '') < today)
    .sort((a, b) => (b.content.date ?? '').localeCompare(a.content.date ?? ''))

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
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

        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-stone-400">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="mt-1 grid grid-cols-7 gap-1">
            {week.map((date, dayIndex) => {
              if (!date) return <span key={dayIndex} />
              const iso = dateToISO(date)
              const hasSchedule = datesWithSchedule.has(iso)
              const isSelected = selectedDate === iso

              return (
                <button
                  key={dayIndex}
                  type="button"
                  onClick={() => hasSchedule && setSelectedDate(isSelected ? null : iso)}
                  className={`rounded-full py-1 text-xs ${
                    hasSchedule ? 'bg-amber-200 font-medium text-amber-800' : 'text-stone-300'
                  } ${isSelected ? 'ring-2 ring-amber-500' : ''}`}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
        ))}

        {selectedDate && (
          <button
            type="button"
            onClick={() => setSelectedDate(null)}
            className="mt-2 text-xs text-stone-400 underline hover:text-stone-600"
          >
            전체 일정 다시 보기
          </button>
        )}
      </div>

      <h2 className="mt-4 mb-2 text-sm font-semibold text-stone-700">
        {selectedDate ? `${selectedDate} 일정` : '다가오는 일정'}
      </h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-stone-400">
          {selectedDate ? '이 날짜엔 예정된 일정이 없어요.' : '예정된 일정이 없어요.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {upcoming.map((log) => (
            <ScheduleRow key={log.id} log={log} today={today} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold text-stone-700">지난 일정</h2>
          <div className="flex flex-col gap-2">
            {past.map((log) => (
              <ScheduleRow key={log.id} log={log} today={today} onDelete={handleDelete} muted />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
