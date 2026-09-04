import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { RawLogType, RawLogWithStatus } from '../types'

interface Props {
  userId: string
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const TYPE_LABEL: Partial<Record<RawLogType, string>> = {
  schedule: '일정',
  task: '할일',
}

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

// 생일/기념일처럼 매년 반복되는 일정은 raw_log에 처음 말한 연도의 날짜가 그대로 남아있으므로,
// 그 날짜가 지났으면 올해가 아니라 다음 번 돌아오는 날짜를 기준으로 다가오는 일정인지 판단한다.
function nextOccurrence(dateStr: string | undefined, recurring: string | undefined, today: string) {
  if (!dateStr || recurring !== 'yearly') return dateStr
  const [, month, day] = dateStr.split('-')
  const todayYear = Number(today.slice(0, 4))
  const thisYear = `${todayYear}-${month}-${day}`
  return thisYear >= today ? thisYear : `${todayYear + 1}-${month}-${day}`
}

function isCompleted(log: RawLogWithStatus) {
  return log.task_status?.completed ?? false
}

function ScheduleRow({
  log,
  today,
  onDelete,
  onToggle,
  muted,
}: {
  log: RawLogWithStatus
  today: string
  onDelete: (id: string) => void
  onToggle: (log: RawLogWithStatus) => void
  muted?: boolean
}) {
  const c = log.content
  const effectiveDate = nextOccurrence(c.date, c.recurring, today)
  const dday = ddayLabel(effectiveDate, today)
  const done = isCompleted(log)

  return (
    <div
      className={`flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ${muted ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        onClick={() => onToggle(log)}
        aria-label={done ? '완료 취소' : '완료 표시'}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
          done ? 'border-amber-500 bg-amber-500 text-white' : 'border-stone-300 text-transparent'
        }`}
      >
        ✓
      </button>

      <div className="flex flex-1 items-center justify-between gap-2">
        <div className="text-left text-sm text-stone-700">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              {TYPE_LABEL[log.type]}
            </span>
            {c.recurring === 'yearly' && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-600">🎂 매년 반복</span>
            )}
            <p className={`font-medium ${done ? 'line-through' : ''}`}>{c.title ?? '항목'}</p>
          </div>
          <p className="mt-1 text-xs text-stone-400">
            {[effectiveDate, c.time, c.place].filter(Boolean).join(' · ')}
          </p>
          {c.raw_text && <p className="mt-1 text-xs text-stone-400">"{c.raw_text}"</p>}
        </div>
        <div className="flex items-center gap-3">
          {dday && !done && (
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
    </div>
  )
}

export function ScheduleTab({ userId }: Props) {
  const [logs, setLogs] = useState<RawLogWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const load = async () => {
    const { data } = await supabase
      .from('raw_log')
      .select('*, task_status(completed)')
      .eq('user_id', userId)
      .in('type', ['schedule', 'task'])
      .order('created_at', { ascending: false })
    setLogs((data as RawLogWithStatus[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleDelete = async (id: string) => {
    await supabase.from('raw_log').delete().eq('id', id)
    await load()
  }

  const handleToggle = async (log: RawLogWithStatus) => {
    const done = isCompleted(log)
    await supabase.from('task_status').upsert({
      raw_log_id: log.id,
      user_id: userId,
      completed: !done,
      completed_at: done ? null : new Date().toISOString(),
    })
    await load()
  }

  if (loading) return null

  const today = todayISO()
  const notCompleted = logs.filter((l) => !isCompleted(l))
  const completed = logs.filter(isCompleted)

  const datesWithItems = new Set(
    notCompleted
      .map((l) => nextOccurrence(l.content.date, l.content.recurring, today))
      .filter(Boolean) as string[],
  )
  const weeks = getMonthWeeks(viewDate.getFullYear(), viewDate.getMonth())

  const dateOf = (l: RawLogWithStatus) => nextOccurrence(l.content.date, l.content.recurring, today) ?? ''
  const visible = selectedDate ? notCompleted.filter((l) => dateOf(l) === selectedDate) : notCompleted
  const upcoming = visible
    .filter((l) => dateOf(l) >= today)
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)))
  const past = visible
    .filter((l) => dateOf(l) < today)
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)))

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
              const hasItem = datesWithItems.has(iso)
              const isSelected = selectedDate === iso

              return (
                <button
                  key={dayIndex}
                  type="button"
                  onClick={() => hasItem && setSelectedDate(isSelected ? null : iso)}
                  className={`rounded-full py-1 text-xs ${
                    hasItem ? 'bg-amber-200 font-medium text-amber-800' : 'text-stone-300'
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
            전체 다시 보기
          </button>
        )}
      </div>

      <h2 className="mt-4 mb-2 text-sm font-semibold text-stone-700">
        {selectedDate ? `${selectedDate} 일정·할일` : '다가오는 일정·할일'}
      </h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-stone-400">
          {selectedDate ? '이 날짜엔 남은 항목이 없어요.' : '예정된 일정이나 할일이 없어요.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {upcoming.map((log) => (
            <ScheduleRow key={log.id} log={log} today={today} onDelete={handleDelete} onToggle={handleToggle} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold text-stone-700">지난 일정·할일</h2>
          <div className="flex flex-col gap-2">
            {past.map((log) => (
              <ScheduleRow
                key={log.id}
                log={log}
                today={today}
                onDelete={handleDelete}
                onToggle={handleToggle}
                muted
              />
            ))}
          </div>
        </>
      )}

      {completed.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className="text-xs text-stone-400 underline hover:text-stone-600"
          >
            완료한 것 {completed.length}개 {showCompleted ? '접기' : '보기'}
          </button>
          {showCompleted && (
            <div className="mt-2 flex flex-col gap-2">
              {completed.map((log) => (
                <ScheduleRow
                  key={log.id}
                  log={log}
                  today={today}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                  muted
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
