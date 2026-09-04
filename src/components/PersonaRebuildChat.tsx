import { useState, type FormEvent } from 'react'
import { supabase } from '../supabaseClient'
import type { ChatMessage, OnboardingTurnResponse, Persona, PersonaDraft } from '../types'

interface Props {
  persona: Persona
  onComplete: (persona: Persona) => void
}

export function PersonaRebuildChat({ persona, onComplete }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      content: `"${persona.name}"를 다시 만들어볼까요? 이번엔 좀 더 여유 있게 얘기 나눠봐요 — 요즘 달라진 게 있거나, 새로 좋아하게 된 거 있어요?`,
    },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [stage, setStage] = useState<'chat' | 'drawing' | 'error'>('chat')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastDraft, setLastDraft] = useState<PersonaDraft | null>(null)

  const finishRebuild = async (draft: PersonaDraft) => {
    setStage('drawing')
    setErrorMessage(null)

    try {
      let imageUrl: string | null = persona.image_url

      const imageRes = await fetch('/api/generate-persona-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      })

      if (imageRes.ok) {
        const { imageBase64, mimeType } = await imageRes.json()
        const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0))
        const path = `${persona.user_id}/character.png`
        const { error: uploadError } = await supabase.storage
          .from('persona-images')
          .upload(path, bytes, { contentType: mimeType ?? 'image/png', upsert: true })

        if (!uploadError) {
          const baseUrl = supabase.storage.from('persona-images').getPublicUrl(path).data.publicUrl
          imageUrl = `${baseUrl}?v=${Date.now()}`
        }
      }
      // 이미지 생성/업로드가 실패해도 이름·말투는 계속 반영되게 진행한다.

      const { data, error } = await supabase
        .from('persona')
        .update({ name: draft.name, tone: draft.tone, image_url: imageUrl })
        .eq('user_id', persona.user_id)
        .select()
        .single()

      if (error || !data) throw error ?? new Error('페르소나 갱신에 실패했어요.')

      onComplete(data as Persona)
    } catch (err) {
      setStage('error')
      setErrorMessage('캐릭터를 다시 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
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
        body: JSON.stringify({ messages: nextMessages, mode: 'rebuild' }),
      })

      if (!res.ok) throw new Error('대화 응답을 가져오지 못했어요.')

      const turn: OnboardingTurnResponse = await res.json()
      setMessages([...nextMessages, { role: 'model', content: turn.assistantMessage }])

      if (turn.isComplete && turn.persona) {
        setLastDraft(turn.persona)
        await finishRebuild(turn.persona)
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
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
        <p className="text-sm text-stone-500">새 모습을 그리고 있어요...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <div className="flex flex-1 flex-col gap-3">
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
            <button type="button" onClick={() => finishRebuild(lastDraft)} className="text-xs text-amber-600 underline">
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
  )
}
