import { useEffect, useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { OnboardingChat } from './components/OnboardingChat'
import { PersonaAvatar } from './components/PersonaAvatar'
import { useSession } from './hooks/useSession'
import { supabase } from './supabaseClient'
import type { Persona } from './types'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-amber-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
    </div>
  )
}

function Home({ persona, onSignOut }: { persona: Persona; onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center gap-4 bg-amber-50 px-4 py-16 text-center">
      <PersonaAvatar name={persona.name} imageUrl={persona.image_url} />
      <h1 className="text-xl font-semibold text-stone-800">{persona.name}</h1>
      <p className="max-w-xs text-sm break-words text-stone-500">{persona.tone}</p>
      <p className="mt-6 text-xs text-stone-400">일일 기록 입력 기능은 곧 만나요.</p>
      <button
        type="button"
        onClick={onSignOut}
        className="mt-8 text-xs text-stone-400 underline hover:text-stone-600"
      >
        로그아웃
      </button>
    </div>
  )
}

function App() {
  const { session, loading } = useSession()
  const [persona, setPersona] = useState<Persona | null | undefined>(undefined)

  useEffect(() => {
    if (!session) {
      setPersona(undefined)
      return
    }

    let cancelled = false
    supabase
      .from('persona')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setPersona((data as Persona | null) ?? null)
      })

    return () => {
      cancelled = true
    }
  }, [session])

  if (loading) return <LoadingScreen />
  if (!session) return <AuthScreen />
  if (persona === undefined) return <LoadingScreen />
  if (!persona) return <OnboardingChat userId={session.user.id} onComplete={setPersona} />

  return <Home persona={persona} onSignOut={() => supabase.auth.signOut()} />
}

export default App
