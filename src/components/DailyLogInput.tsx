import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../supabaseClient'
import type { RawLog, RawLogContent, RawLogType, StructureLogResponse } from '../types'

interface Props {
  userId: string
}

const TYPE_LABEL: Record<RawLogType, string> = {
  consumption: '소비',
  schedule: '일정',
  event: '사건',
}

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
  if (type === 'schedule') {
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
  const [pending, setPending] = useState<StructureLogResponse | null>(null)
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

  const saveLog = async (result: StructureLogResponse) => {
    const { error: insertError } = await supabase.from('raw_log').insert({
      user_id: userId,
      type: result.type,
      content: result.content,
      is_estimated: result.isEstimated,
    })
    if (insertError) throw insertError
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
      if (result.missingRequired) {
        setPending(result)
      } else {
        await saveLog(result)
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
    if (!pending || !amountInput.trim()) return
    const amount = Number(amountInput.replace(/[^0-9.]/g, ''))
    if (Number.isNaN(amount)) return

    try {
      await saveLog({ ...pending, content: { ...pending.content, amount }, missingRequired: false })
      setPending(null)
      setAmountInput('')
      setInput('')
    } catch (err) {
      setError('저장하는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      console.error(err)
    }
  }

  return (
    <div className="w-full max-w-lg px-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        {pending ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-stone-600">얼마 정도 썼는지만 알려줄래요?</p>
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
              className="rounded-xl bg-white/70 px-4 py-2 text-left text-sm text-stone-600 shadow-sm"
            >
              <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                {TYPE_LABEL[log.type]}
              </span>
              {summarize(log.type, log.content)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
