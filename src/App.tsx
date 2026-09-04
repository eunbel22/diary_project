import { useEffect, useState } from 'react'
import { AdhdScreening } from './components/AdhdScreening'
import { AuthScreen } from './components/AuthScreen'
import { ConsumptionTab } from './components/ConsumptionTab'
import { DailyLogInput } from './components/DailyLogInput'
import { DiaryTab } from './components/DiaryTab'
import { OnboardingChat } from './components/OnboardingChat'
import { PersonaAvatar } from './components/PersonaAvatar'
import { ScheduleTab } from './components/ScheduleTab'
import { TabBar } from './components/TabBar'
import { useSession } from './hooks/useSession'
import { supabase } from './supabaseClient'
import type { AdhdScreeningResult, Persona } from './types'

const TABS = [
  { key: 'today', label: '오늘', icon: '💬' },
  { key: 'schedule', label: '일정', icon: '📅' },
  { key: 'consumption', label: '소비', icon: '💳' },
  { key: 'diary', label: '다이어리', icon: '📔' },
] as const

type TabKey = (typeof TABS)[number]['key']

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-amber-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
    </div>
  )
}

function Home({
  persona,
  onPersonaUpdated,
  onSignOut,
}: {
  persona: Persona
  onPersonaUpdated: (persona: Persona) => void
  onSignOut: () => void
}) {
  const [tab, setTab] = useState<TabKey>('today')

  const toggleReminder = async () => {
    const { data } = await supabase
      .from('persona')
      .update({ reminder_opt_in: !persona.reminder_opt_in })
      .eq('user_id', persona.user_id)
      .select()
      .single()
    if (data) onPersonaUpdated(data as Persona)
  }

  return (
    <div className="flex min-h-screen flex-col bg-amber-50 pb-16">
      <header className="flex flex-col items-center gap-1 px-4 py-6 text-center">
        <PersonaAvatar name={persona.name} imageUrl={persona.image_url} size={72} />
        <h1 className="mt-1 text-lg font-semibold text-stone-800">{persona.name}</h1>
        <p className="max-w-xs text-xs break-words text-stone-500">{persona.tone}</p>
        <div className="mt-2 flex gap-3">
          <button type="button" onClick={toggleReminder} className="text-xs text-stone-400 underline hover:text-stone-600">
            저녁 리마인더 {persona.reminder_opt_in ? '끄기' : '켜기'}
          </button>
          <button type="button" onClick={onSignOut} className="text-xs text-stone-400 underline hover:text-stone-600">
            로그아웃
          </button>
        </div>
      </header>

      <main className="flex-1">
        {tab === 'today' && <DailyLogInput userId={persona.user_id} />}
        {tab === 'schedule' && <ScheduleTab userId={persona.user_id} />}
        {tab === 'consumption' && <ConsumptionTab userId={persona.user_id} />}
        {tab === 'diary' && <DiaryTab persona={persona} onPersonaUpdated={onPersonaUpdated} />}
      </main>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />
    </div>
  )
}

function App() {
  const { session, loading } = useSession()
  const [persona, setPersona] = useState<Persona | null | undefined>(undefined)
  const [screeningDone, setScreeningDone] = useState(false)
  const [screeningResult, setScreeningResult] = useState<AdhdScreeningResult | null>(null)

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
  if (!persona) {
    if (!screeningDone) {
      return (
        <AdhdScreening
          onComplete={(result) => {
            setScreeningResult(result)
            setScreeningDone(true)
          }}
        />
      )
    }
    return <OnboardingChat userId={session.user.id} screeningResult={screeningResult} onComplete={setPersona} />
  }

  return <Home persona={persona} onPersonaUpdated={setPersona} onSignOut={() => supabase.auth.signOut()} />
}

export default App
