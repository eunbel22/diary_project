import { useState, type FormEvent } from 'react'
import { supabase } from '../supabaseClient'

export function AuthScreen() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const { error } =
      mode === 'signUp'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
    } else if (mode === 'signUp') {
      setMessage('가입 확인 메일을 보냈어요. 메일함을 확인해 주세요.')
    }

    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-amber-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-stone-800">
          {mode === 'signUp' ? '다이어리 시작하기' : '다시 만나서 반가워요'}
        </h1>
        <p className="mb-6 text-sm text-stone-500">이메일과 비밀번호만 있으면 돼요.</p>

        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <input
            type="email"
            required
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}
          {message && <p className="text-sm text-emerald-600">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-60"
          >
            {loading ? '처리 중...' : mode === 'signUp' ? '가입하기' : '로그인'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signUp' ? 'signIn' : 'signUp')
            setError(null)
            setMessage(null)
          }}
          className="mt-4 w-full text-center text-xs text-stone-400 hover:text-stone-600"
        >
          {mode === 'signUp' ? '이미 계정이 있어요' : '계정이 없어요, 새로 만들게요'}
        </button>
      </div>
    </div>
  )
}
