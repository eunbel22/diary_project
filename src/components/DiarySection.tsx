import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { DiaryEntry, RawLog } from '../types'

interface Props {
  userId: string
  personaName: string
  personaTone: string
}

function todayISO() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

// Safari 구버전은 접두사가 붙은 생성자만 지원한다.
type AudioContextConstructor = typeof AudioContext
function getAudioContextConstructor(): AudioContextConstructor | null {
  const w = window as typeof window & { webkitAudioContext?: AudioContextConstructor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

// 실제 오디오 파일 없이, 넓은 대역의 노이즈를 부드러운 엔벨로프로 감싸 연필 긁는 질감을 합성한다.
// (특정 주파수를 강조하는 bandpass + 즉각적인 시작/감쇠는 또렷한 톤의 "딸깍" 소리가 되어
// 타자기처럼 들리므로 피한다. highpass + 완만한 페이드인/아웃 + 매번 미세한 변주를 준다.)
function playScratchTick(ctx: AudioContext) {
  const duration = 0.05 + Math.random() * 0.04
  const bufferSize = Math.max(1, Math.floor(duration * ctx.sampleRate))
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

  const noise = ctx.createBufferSource()
  noise.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 700 + Math.random() * 700
  filter.Q.value = 0.4

  const now = ctx.currentTime
  const peak = 0.18 + Math.random() * 0.12
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(peak, now + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  noise.connect(filter).connect(gain).connect(ctx.destination)
  noise.start(now)
  noise.stop(now + duration)
}

export function DiarySection({ userId, personaName, personaTone }: Props) {
  const [entry, setEntry] = useState<DiaryEntry | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealedLength, setRevealedLength] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')

  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    supabase
      .from('diary_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('date', todayISO())
      .maybeSingle()
      .then(({ data }) => {
        const found = (data as DiaryEntry | null) ?? null
        setEntry(found)
        setRevealedLength(found?.body.length ?? 0)
        setLoadingInitial(false)
      })
  }, [])

  useEffect(() => {
    if (!animating || !entry) return

    let i = 0
    const interval = setInterval(() => {
      i += 1
      setRevealedLength(i)

      if (i % 2 === 0 && entry.body[i - 1]?.trim() && audioCtxRef.current) {
        try {
          playScratchTick(audioCtxRef.current)
        } catch (err) {
          console.warn('사각사각 소리 재생 실패:', err)
        }
      }

      if (i >= entry.body.length) {
        clearInterval(interval)
        setAnimating(false)
      }
    }, 35)

    return () => clearInterval(interval)
  }, [animating, entry])

  const ensureAudioContext = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = getAudioContextConstructor()
        if (!AudioContextClass) {
          console.warn('이 브라우저는 Web Audio API를 지원하지 않아요.')
          return
        }
        audioCtxRef.current = new AudioContextClass()
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch((err) => console.warn('오디오 컨텍스트 재개 실패:', err))
      }
    } catch (err) {
      console.warn('오디오 컨텍스트를 생성하지 못했어요:', err)
    }
  }

  const fetchTodayLogs = async () => {
    const { data } = await supabase
      .from('raw_log')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', `${todayISO()}T00:00:00`)
      .order('created_at', { ascending: true })
    return (data as RawLog[] | null) ?? []
  }

  const upsertDiary = async (body: string) => {
    if (entry) {
      const { data, error: updateError } = await supabase
        .from('diary_entries')
        .update({ body, version: entry.version + 1 })
        .eq('id', entry.id)
        .select()
        .single()
      if (updateError) throw updateError
      return data as DiaryEntry
    }

    const { data, error: insertError } = await supabase
      .from('diary_entries')
      .insert({ user_id: userId, date: todayISO(), body, version: 1 })
      .select()
      .single()
    if (insertError) throw insertError
    return data as DiaryEntry
  }

  const generate = async (feedback?: string) => {
    ensureAudioContext()
    setGenerating(true)
    setError(null)
    try {
      const logs = await fetchTodayLogs()
      if (logs.length === 0 && !feedback) {
        setError('아직 오늘 남긴 기록이 없어요. 소비나 일정을 먼저 남겨주세요.')
        return
      }

      const res = await fetch('/api/generate-diary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          personaName,
          personaTone,
          date: todayISO(),
          entries: logs.map((log) => ({ type: log.type, content: log.content })),
          previousBody: entry?.body,
          feedback,
        }),
      })
      if (!res.ok) throw new Error('다이어리 생성에 실패했어요.')

      const { body } = await res.json()
      const saved = await upsertDiary(body)
      setEntry(saved)
      setRevealedLength(0)
      setAnimating(true)
      setShowFeedback(false)
      setFeedbackText('')
    } catch (err) {
      setError('다이어리를 쓰는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  if (loadingInitial) return null

  return (
    <div className="mt-4 w-full max-w-lg px-4">
      {!entry && (
        <button
          type="button"
          onClick={() => generate()}
          disabled={generating}
          className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-stone-600 shadow-sm disabled:opacity-60"
        >
          {generating ? '오늘 하루를 적고 있어요...' : '오늘 하루, 다이어리로 남겨볼까요?'}
        </button>
      )}

      {entry && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
            {entry.body.slice(0, revealedLength)}
            {animating && <span className="animate-pulse">✎</span>}
          </p>

          {!animating && (
            <div className="mt-3">
              {showFeedback ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="이렇게 고쳐줬으면 좋겠다는 게 있으면 편하게 적어주세요"
                    rows={2}
                    className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => generate(feedbackText.trim() || '더 자연스럽게 다시 써줘')}
                      disabled={generating}
                      className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      다시 쓰기
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFeedback(false)}
                      className="rounded-full px-4 py-1.5 text-xs text-stone-400"
                    >
                      그만할게요
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => generate()}
                    disabled={generating}
                    className="text-xs text-stone-400 underline hover:text-stone-600"
                  >
                    새 기록 반영해서 다시 쓰기
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFeedback(true)}
                    className="text-xs text-stone-400 underline hover:text-stone-600"
                  >
                    피드백 주고 다시 쓰기
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  )
}
