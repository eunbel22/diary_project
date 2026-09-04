import { useEffect, useState } from 'react'
import { AdhdScreening } from './components/AdhdScreening'
import { AuthScreen } from './components/AuthScreen'
import { ConsumptionTab } from './components/ConsumptionTab'
import { DailyLogInput } from './components/DailyLogInput'
import { DiaryTab } from './components/DiaryTab'
import { OnboardingChat } from './components/OnboardingChat'
import { PersonaAvatar } from './components/PersonaAvatar'
import { ScheduleTab } from './components/ScheduleTab'
import { SettingsTab } from './components/SettingsTab'
import { TabBar } from './components/TabBar'
import { useSession } from './hooks/useSession'
import { supabase } from './supabaseClient'
import type { AdhdScreeningResult, Persona } from './types'

const TABS = [
  { key: 'today', label: '오늘', icon: '💬' },
  { key: 'schedule', label: '일정', icon: '📅' },
  { key: 'consumption', label: '소비', icon: '💳' },
  { key: 'diary', label: '다이어리', icon: '📔' },
  { key: 'settings', label: '설정', icon: '⚙️' },
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
  const [quickEntryRequested, setQuickEntryRequested] = useState(false)

  // 홈 화면 바로가기(딥링크, /?quick=1)로 들어온 경우 오늘 탭으로 이동해
  // 바로 입력 모드로 진입한다. 한 번만 처리되도록 URL의 쿼리를 바로 지운다.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('quick')) {
      setTab('today')
      setQuickEntryRequested(true)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-amber-50 pb-16">
      <header className="flex flex-col items-center gap-1 px-4 py-6 text-center">
        <PersonaAvatar name={persona.name} imageUrl={persona.image_url} size={72} />
        <h1 className="mt-1 text-lg font-semibold text-stone-800">{persona.name}</h1>
        <p className="max-w-xs text-xs break-words text-stone-500">{persona.tone}</p>
      </header>

      <main className="flex-1">
        {tab === 'today' && (
          <DailyLogInput
            userId={persona.user_id}
            autoQuickEntry={quickEntryRequested}
            quickEntryMode={persona.quick_entry_mode}
            onQuickEntryHandled={() => setQuickEntryRequested(false)}
          />
        )}
        {tab === 'schedule' && <ScheduleTab userId={persona.user_id} />}
        {tab === 'consumption' && <ConsumptionTab userId={persona.user_id} />}
        {tab === 'diary' && <DiaryTab persona={persona} onPersonaUpdated={onPersonaUpdated} />}
        {tab === 'settings' && (
          <SettingsTab persona={persona} onPersonaUpdated={onPersonaUpdated} onSignOut={onSignOut} />
        )}
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
