import { useState, type FormEvent } from 'react'
import { supabase } from '../supabaseClient'
import type { ChatMessage, OnboardingTurnResponse, Persona, PersonaDraft } from '../types'

const OPENING_MESSAGE =
  '안녕하세요! 저는 아직 이름이 없어요. 당신과 대화하면서 저의 성격과 말투를 정하고 싶어요. 정답은 없으니 편하게 얘기해주세요 — 요즘 어떤 걸 하면 기분이 좋아지나요?'

interface Props {
  userId: string
  onComplete: (persona: Persona) => void
}

export function OnboardingChat({ userId, onComplete }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', content: OPENING_MESSAGE },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [stage, setStage] = useState<'chat' | 'drawing' | 'error'>('chat')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastDraft, setLastDraft] = useState<PersonaDraft | null>(null)

  const finishOnboarding = async (draft: PersonaDraft) => {
    setStage('drawing')
    setErrorMessage(null)

    try {
      let imageUrl: string | null = null

      // 이미지 생성은 온보딩 완료 시 최초 1회만 호출한다 (비용 관리).
      const imageRes = await fetch('/api/generate-persona-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      })

      if (imageRes.ok) {
        const { imageBase64, mimeType } = await imageRes.json()
        const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0))
        const path = `${userId}/character.png`
        const { error: uploadError } = await supabase.storage
          .from('persona-images')
          .upload(path, bytes, { contentType: mimeType ?? 'image/png', upsert: true })

        if (!uploadError) {
          imageUrl = supabase.storage.from('persona-images').getPublicUrl(path).data.publicUrl
        }
      }
      // 이미지 생성/업로드가 실패해도 캐릭터 자체는 계속 만들어질 수 있도록 진행한다.

      const { data, error } = await supabase
        .from('persona')
        .insert({ user_id: userId, name: draft.name, tone: draft.tone, image_url: imageUrl })
        .select()
        .single()

      if (error || !data) throw error ?? new Error('페르소나 저장에 실패했어요.')

      onComplete(data as Persona)
    } catch (err) {
      setStage('error')
      setErrorMessage('캐릭터를 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      console.error(err)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sending) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: input.trim() }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    setErrorMessage(null)

    try {
      const res = await fetch('/api/onboarding-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      })

      if (!res.ok) throw new Error('온보딩 응답을 가져오지 못했어요.')

      const turn: OnboardingTurnResponse = await res.json()
      setMessages([...nextMessages, { role: 'model', content: turn.assistantMessage }])

      if (turn.isComplete && turn.persona) {
        setLastDraft(turn.persona)
        await finishOnboarding(turn.persona)
      }
    } catch (err) {
      setStage('error')
      setErrorMessage('대화를 이어가는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  if (stage === 'drawing') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-amber-50 px-4 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
        <p className="text-sm text-stone-500">캐릭터를 그리고 있어요...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-amber-50">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-8">
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'model'
                  ? 'max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-white px-4 py-2 text-sm text-stone-700 shadow-sm'
                  : 'max-w-[85%] self-end rounded-2xl rounded-br-sm bg-amber-400 px-4 py-2 text-sm text-white'
              }
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-white px-4 py-2 text-sm text-stone-400 shadow-sm">
              ...
            </div>
          )}
        </div>

        {stage === 'error' && errorMessage && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-center text-sm text-red-500">{errorMessage}</p>
            {lastDraft && (
              <button
                type="button"
                onClick={() => finishOnboarding(lastDraft)}
                className="text-xs text-amber-600 underline"
              >
                다시 시도하기
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="편하게 답해주세요"
            disabled={sending}
            className="flex-1 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            보내기
          </button>
        </form>
      </div>
    </div>
  )
}
