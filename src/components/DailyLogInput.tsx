import { useEffect, useRef, useState, type FormEvent } from 'react'
import { diceSimilarity } from '../lib/textSimilarity'
import { supabase } from '../supabaseClient'
import type {
  QuickEntryMode,
  QuickPhrase,
  RawLog,
  RawLogContent,
  RawLogType,
  RawLogWithStatus,
  StructuredEntry,
  StructureLogResponse,
} from '../types'

interface Props {
  userId: string
  autoQuickEntry?: boolean
  quickEntryMode?: QuickEntryMode
  onQuickEntryHandled?: () => void
}

interface CompletionCandidate {
  id: string
  content: RawLogContent
  // raw_log_id가 task_status의 기본키라 PostgREST가 1:1로 인식해 객체(또는 null)로 내려준다.
  task_status?: { completed: boolean } | null
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

export function DailyLogInput({ userId, autoQuickEntry, quickEntryMode, onQuickEntryHandled }: Props) {
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingQueue, setPendingQueue] = useState<StructuredEntry[]>([])
  const [amountInput, setAmountInput] = useState('')
  const [logs, setLogs] = useState<RawLog[]>([])
  const [overdueLogs, setOverdueLogs] = useState<RawLogWithStatus[]>([])
  const [migrating, setMigrating] = useState(false)
  const [migratePromptDismissed, setMigratePromptDismissed] = useState(false)
  const [quickPhrases, setQuickPhrases] = useState<QuickPhrase[]>([])
  const [editingPhrases, setEditingPhrases] = useState(false)
  const [newPhraseText, setNewPhraseText] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const textInputRef = useRef<HTMLInputElement>(null)

  const loadTodayLogs = async () => {
    const { data } = await supabase
      .from('raw_log')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', `${todayISO()}T00:00:00`)
      .order('created_at', { ascending: false })
    setLogs((data as RawLog[] | null) ?? [])
  }

  // 며칠 만에 돌아와도 "빠진 기간"을 언급하지 않고, 밀린 일정·할일만 조용히 발견해서
  // 오늘로 옮길지 한 번 제안한다(불렛저널의 "이관" 개념). 생일/기념일처럼 매년 반복되는
  // 항목은 raw_log상 날짜가 지나 보여도 실제로는 밀린 게 아니라서 제외한다.
  const loadOverdueLogs = async () => {
    const today = todayISO()
    const { data } = await supabase
      .from('raw_log')
      .select('*, task_status(completed)')
      .eq('user_id', userId)
      .in('type', ['schedule', 'task'])
    const rows = (data as RawLogWithStatus[] | null) ?? []
    const overdue = rows.filter((row) => {
      if (row.content.recurring === 'yearly') return false
      if (!row.content.date || row.content.date >= today) return false
      return !(row.task_status?.completed ?? false)
    })
    setOverdueLogs(overdue)
  }

  const loadQuickPhrases = async () => {
    const { data } = await supabase
      .from('quick_phrase')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
    setQuickPhrases((data as QuickPhrase[] | null) ?? [])
  }

  useEffect(() => {
    loadTodayLogs()
    loadOverdueLogs()
    loadQuickPhrases()
  }, [])

  // 매번 같은 말을 새로 타이핑/녹음하는 부담을 줄이기 위해, 저장해둔 문구를 그대로
  // 구조화 파이프라인에 태워 기록한다(직접 말한 것과 동일하게 처리됨).
  const handleQuickPhraseTap = async (text: string) => {
    if (submitting || recording) return
    await runStructuring({ text })
  }

  const handleAddQuickPhrase = async () => {
    const text = newPhraseText.trim()
    if (!text) return
    await supabase.from('quick_phrase').insert({ user_id: userId, text, sort_order: quickPhrases.length })
    setNewPhraseText('')
    await loadQuickPhrases()
  }

  const handleDeleteQuickPhrase = async (id: string) => {
    await supabase.from('quick_phrase').delete().eq('id', id)
    await loadQuickPhrases()
  }

  // raw_log는 불변이라 날짜만 바꿔치기할 수 없으므로, 오늘 날짜로 새로 저장하고
  // 기존 항목은 지운다.
  const handleMigrateOverdue = async () => {
    setMigrating(true)
    try {
      const today = todayISO()
      for (const row of overdueLogs) {
        const { error: insertError } = await supabase.from('raw_log').insert({
          user_id: userId,
          type: row.type,
          content: { ...row.content, date: today },
          is_estimated: row.is_estimated,
        })
        if (insertError) throw insertError

        const { error: deleteError } = await supabase.from('raw_log').delete().eq('id', row.id)
        if (deleteError) throw deleteError
      }
      setOverdueLogs([])
      setMigratePromptDismissed(true)
      await loadTodayLogs()
    } catch (err) {
      setError('밀린 일정을 옮기는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      console.error(err)
    } finally {
      setMigrating(false)
    }
  }

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
        if (row.task_status?.completed) continue
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

  // 홈 화면 바로가기(딥링크)로 들어온 경우, 저장해둔 기본 진입 모드에 따라
  // 바로 녹음을 시작하거나 입력창에 포커스를 줘서 캡처 마찰을 줄인다.
  useEffect(() => {
    if (!autoQuickEntry) return
    if (quickEntryMode === 'voice') {
      startRecording()
    } else {
      textInputRef.current?.focus()
    }
    onQuickEntryHandled?.()
  }, [autoQuickEntry])

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
      {overdueLogs.length > 0 && !migratePromptDismissed && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-amber-100 px-4 py-3 text-sm text-amber-800">
          <span>밀린 게 {overdueLogs.length}개 있어요. 오늘로 옮길까요?</span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={handleMigrateOverdue}
              disabled={migrating}
              className="rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {migrating ? '옮기는 중...' : '오늘로 옮기기'}
            </button>
            <button
              type="button"
              onClick={() => setMigratePromptDismissed(true)}
              disabled={migrating}
              className="rounded-full bg-white px-3 py-1 text-xs text-amber-700"
            >
              괜찮아요
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {quickPhrases.map((phrase) => (
          <div
            key={phrase.id}
            className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs shadow-sm"
          >
            <button
              type="button"
              onClick={() => handleQuickPhraseTap(phrase.text)}
              disabled={submitting || recording}
              className="text-stone-600 disabled:opacity-50"
            >
              {phrase.text}
            </button>
            {editingPhrases && (
              <button
                type="button"
                onClick={() => handleDeleteQuickPhrase(phrase.id)}
                className="text-stone-300 hover:text-stone-500"
                aria-label="문구 삭제"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setEditingPhrases((v) => !v)}
          className="rounded-full px-3 py-1.5 text-xs text-stone-400 underline"
        >
          {editingPhrases ? '완료' : '자주 쓰는 말 편집'}
        </button>
      </div>

      {editingPhrases && (
        <div className="mb-3 flex gap-2">
          <input
            value={newPhraseText}
            onChange={(e) => setNewPhraseText(e.target.value)}
            placeholder="자주 쓰는 말 추가 (예: 약 먹었어)"
            className="flex-1 rounded-full border border-stone-200 px-4 py-2 text-sm outline-none focus:border-amber-400"
          />
          <button
            type="button"
            onClick={handleAddQuickPhrase}
            disabled={!newPhraseText.trim()}
            className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            추가
          </button>
        </div>
      )}

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
              ref={textInputRef}
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
