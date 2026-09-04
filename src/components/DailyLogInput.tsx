import { useEffect, useRef, useState, type FormEvent } from 'react'
import { diceSimilarity } from '../lib/textSimilarity'
import { supabase } from '../supabaseClient'
import type { RawLog, RawLogContent, RawLogType, StructuredEntry, StructureLogResponse } from '../types'

interface Props {
  userId: string
}

interface CompletionCandidate {
  id: string
  content: RawLogContent
  task_status?: { completed: boolean }[]
}

const TYPE_LABEL: Record<RawLogType, string> = {
  consumption: '소비',
  schedule: '일정',
  task: '할일',
  event: '사건',
}

const AUTO_COMPLETE_THRESHOLD = 0.3

function todayISO() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function summarize(type: RawLogType, content: RawLogContent) {
  if (type === 'consumption') {
    const amount = content.amount != null ? `${content.amount.toLocaleString()}원` : ''
    return [content.item ?? '소비', amount].filter(Boolean).join(' · ')
  }
  if (type === 'schedule' || type === 'task') {
    return [content.title, content.date, content.time].filter(Boolean).join(' · ')
  }
  return content.description ?? ''
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function DailyLogInput({ userId }: Props) {
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingQueue, setPendingQueue] = useState<StructuredEntry[]>([])
  const [amountInput, setAmountInput] = useState('')
  const [logs, setLogs] = useState<RawLog[]>([])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const loadTodayLogs = async () => {
    const { data } = await supabase
      .from('raw_log')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', `${todayISO()}T00:00:00`)
      .order('created_at', { ascending: false })
    setLogs((data as RawLog[] | null) ?? [])
  }

  useEffect(() => {
    loadTodayLogs()
  }, [])

  const saveEntry = async (entry: StructuredEntry) => {
    const { error: insertError } = await supabase.from('raw_log').insert({
      user_id: userId,
      type: entry.type,
      content: entry.content,
      is_estimated: entry.isEstimated,
    })
    if (insertError) throw insertError
  }

  // "데미안 다 읽었어" 같은 완료 보고가 감지되면, 아직 완료 안 된 일정/할일 중
  // 가장 비슷한 항목을 찾아 자동으로 완료 처리한다. 확실한 매치가 없으면 조용히 넘어간다
  // (엉뚱한 항목을 억지로 체크하지 않는다).
  const tryAutoComplete = async (subject: string) => {
    try {
      const { data } = await supabase
        .from('raw_log')
        .select('id, content, task_status(completed)')
        .eq('user_id', userId)
        .in('type', ['task', 'schedule'])

      const candidates = (data as CompletionCandidate[] | null) ?? []
      let best: { id: string; score: number } | null = null

      for (const row of candidates) {
        if (row.task_status?.[0]?.completed) continue
        const title = row.content?.title
        if (!title) continue
        const score = diceSimilarity(subject, title)
        if (score > AUTO_COMPLETE_THRESHOLD && (!best || score > best.score)) {
          best = { id: row.id, score }
        }
      }

      if (!best) return
      await supabase.from('task_status').upsert({
        raw_log_id: best.id,
        user_id: userId,
        completed: true,
        completed_at: new Date().toISOString(),
      })
    } catch (err) {
      console.warn('완료 자동 매칭 실패:', err)
    }
  }

  const handleDelete = async (id: string) => {
    const { error: deleteError } = await supabase.from('raw_log').delete().eq('id', id)
    if (deleteError) {
      setError('삭제하는 중 문제가 생겼어요.')
      console.error(deleteError)
      return
    }
    await loadTodayLogs()
  }

  const runStructuring = async (payload: { text?: string; audioBase64?: string; mimeType?: string }) => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/structure-log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, today: todayISO() }),
      })
      if (!res.ok) throw new Error('구조화 요청이 실패했어요.')

      const result: StructureLogResponse = await res.json()
      const entries = result.entries.map((entry) =>
        result.transcript
          ? { ...entry, content: { ...entry.content, raw_text: result.transcript } }
          : entry,
      )

      const ready = entries.filter((entry) => !entry.missingRequired)
      const needsAmount = entries.filter((entry) => entry.missingRequired)

      for (const entry of ready) {
        await saveEntry(entry)
        if (entry.isCompletion && entry.completionSubject) {
          await tryAutoComplete(entry.completionSubject)
        }
      }
      if (ready.length > 0) await loadTodayLogs()

      if (needsAmount.length > 0) {
        setPendingQueue(needsAmount)
      } else {
        setInput('')
      }
    } catch (err) {
      setError('기록하는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitText = async (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || submitting) return
    await runStructuring({ text: input.trim() })
  }

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const audioBase64 = await blobToBase64(blob)
        await runStructuring({ audioBase64, mimeType })
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch (err) {
      setError('마이크를 사용할 수 없어요. 텍스트로 남겨주세요.')
      console.error(err)
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const handleConfirmAmount = async () => {
    const [current, ...rest] = pendingQueue
    if (!current || !amountInput.trim()) return
    const amount = Number(amountInput.replace(/[^0-9.]/g, ''))
    if (Number.isNaN(amount)) return

    try {
      await saveEntry({ ...current, content: { ...current.content, amount }, missingRequired: false })
      await loadTodayLogs()
      setAmountInput('')
      setPendingQueue(rest)
      if (rest.length === 0) setInput('')
    } catch (err) {
      setError('저장하는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      console.error(err)
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        {pendingQueue.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-stone-600">
              {pendingQueue[0].content.item ? `'${pendingQueue[0].content.item}' ` : ''}
              얼마 정도 썼는지만 알려줄래요?
            </p>
            {pendingQueue.length > 1 && (
              <p className="text-xs text-stone-400">확인할 소비가 아직 {pendingQueue.length}개 있어요</p>
            )}
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="금액(원)"
                className="flex-1 rounded-full border border-stone-200 px-4 py-2 text-sm outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={handleConfirmAmount}
                disabled={!amountInput.trim()}
                className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                확인
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmitText} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="오늘 쓴 것, 잡힌 약속, 있었던 일을 편하게 말해주세요"
              disabled={submitting || recording}
              className="flex-1 rounded-full border border-stone-200 px-4 py-2 text-sm outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={submitting}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                recording ? 'bg-rose-500 text-white' : 'bg-stone-100 text-stone-600'
              }`}
            >
              {recording ? '중지' : '🎙'}
            </button>
            <button
              type="submit"
              disabled={submitting || recording || !input.trim()}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? '기록 중...' : '기록하기'}
            </button>
          </form>
        )}
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>

      {logs.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-xl bg-white/70 px-4 py-3 text-left text-sm text-stone-600 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                    {TYPE_LABEL[log.type]}
                  </span>
                  {log.is_estimated && <span className="text-xs text-stone-400">일부 추정 포함</span>}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(log.id)}
                  className="text-xs text-stone-300 hover:text-stone-500"
                  aria-label="기록 삭제"
                >
                  삭제
                </button>
              </div>
              {log.content.raw_text && (
                <p className="mt-1 break-words text-stone-700">{log.content.raw_text}</p>
              )}
              <p className="mt-0.5 break-words text-xs text-stone-400">
                {summarize(log.type, log.content)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
