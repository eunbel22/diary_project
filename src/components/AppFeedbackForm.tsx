import { useState } from 'react'
import { supabase } from '../supabaseClient'

interface Props {
  userId: string
}

const STARS = [1, 2, 3, 4, 5]

export function AppFeedbackForm({ userId }: Props) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (rating === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: insertError } = await supabase
        .from('app_feedback')
        .insert({ user_id: userId, rating, comment: comment.trim() || null })
      if (insertError) throw insertError
      setSubmitted(true)
      setRating(0)
      setComment('')
    } catch (err) {
      setError('의견을 보내는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-stone-700">앱에 대한 의견</p>
        <p className="text-xs text-stone-400">소중한 의견 감사해요. 다음에 또 남겨주셔도 좋아요.</p>
        <button type="button" onClick={() => setSubmitted(false)} className="text-xs text-amber-600 underline">
          다시 남기기
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-stone-700">앱에 대한 의견</p>
      <p className="text-xs text-stone-400">
        이 앱 어땠는지 편하게 남겨주세요. 평가받는 게 아니라 다듬어가는 데 참고할게요.
      </p>
      <div className="flex gap-1">
        {STARS.map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            aria-label={`별점 ${star}점`}
            className={`text-xl leading-none ${star <= rating ? 'text-amber-500' : 'text-stone-200'}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="더 하고 싶은 말이 있다면 (선택)"
        rows={2}
        className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={rating === 0 || submitting}
        className="self-start rounded-full bg-amber-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {submitting ? '보내는 중...' : '보내기'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
