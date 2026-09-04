import { useEffect, useState, type ChangeEvent } from 'react'
import { AdhdScreening } from './AdhdScreening'
import { supabase } from '../supabaseClient'
import type { AdhdScreeningResult, InsightPeriod, Persona } from '../types'

interface Props {
  persona: Persona
  onPersonaUpdated: (persona: Persona) => void
  onSignOut: () => void
}

const EXPORT_TABLES = [
  'persona',
  'raw_log',
  'diary_entries',
  'coupon',
  'task_status',
  'consumption_category',
  'consumption_override',
  'quick_phrase',
] as const

const SCREENING_LABEL: Record<AdhdScreeningResult, string> = {
  suspected: 'ADHD와 비슷한 특성이 꽤 여러 개 보이는 편으로 나왔어요.',
  not_suspected: 'ADHD와 비슷한 특성은 크게 두드러지지 않는 편으로 나왔어요.',
}

function todayISO() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function SettingsTab({ persona, onPersonaUpdated, onSignOut }: Props) {
  const [retakingScreening, setRetakingScreening] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [emotionOptions, setEmotionOptions] = useState<string[]>([])

  // 우선 관찰 감정 선택지는 이 사용자가 실제로 써온 감정 단어 중 자주 나온 순으로 채운다.
  useEffect(() => {
    supabase
      .from('raw_log')
      .select('content')
      .eq('user_id', persona.user_id)
      .then(({ data }) => {
        const rows = (data as { content: { emotion?: string } }[] | null) ?? []
        const counts = new Map<string, number>()
        for (const row of rows) {
          const emotion = row.content?.emotion?.trim()
          if (emotion) counts.set(emotion, (counts.get(emotion) ?? 0) + 1)
        }
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([emotion]) => emotion)
        setEmotionOptions(sorted.slice(0, 8))
      })
  }, [persona.user_id])

  const toggleReminder = async () => {
    const { data } = await supabase
      .from('persona')
      .update({ reminder_opt_in: !persona.reminder_opt_in })
      .eq('user_id', persona.user_id)
      .select()
      .single()
    if (data) onPersonaUpdated(data as Persona)
  }

  const toggleDiaryFormat = async () => {
    const { data } = await supabase
      .from('persona')
      .update({ diary_format: persona.diary_format === 'list' ? 'paragraph' : 'list' })
      .eq('user_id', persona.user_id)
      .select()
      .single()
    if (data) onPersonaUpdated(data as Persona)
  }

  const toggleInsightEnabled = async () => {
    const { data } = await supabase
      .from('persona')
      .update({ insight_enabled: !persona.insight_enabled })
      .eq('user_id', persona.user_id)
      .select()
      .single()
    if (data) onPersonaUpdated(data as Persona)
  }

  const handleInsightPeriodChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const { data } = await supabase
      .from('persona')
      .update({ insight_period: e.target.value as InsightPeriod })
      .eq('user_id', persona.user_id)
      .select()
      .single()
    if (data) onPersonaUpdated(data as Persona)
  }

  const handleEmotionFocusChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const { data } = await supabase
      .from('persona')
      .update({ insight_emotion_focus: e.target.value || null })
      .eq('user_id', persona.user_id)
      .select()
      .single()
    if (data) onPersonaUpdated(data as Persona)
  }

  // 다시 하기를 선택했을 때만 결과를 반영한다. 건너뛰면(result === null) 기존 결과를 그대로 둔다.
  const handleScreeningComplete = async (result: AdhdScreeningResult | null) => {
    if (result) {
      const { data } = await supabase
        .from('persona')
        .update({ adhd_screening_result: result, adhd_screening_completed_at: new Date().toISOString() })
        .eq('user_id', persona.user_id)
        .select()
        .single()
      if (data) onPersonaUpdated(data as Persona)
    }
    setRetakingScreening(false)
  }

  const handleExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const data: Record<string, unknown> = {}
      for (const table of EXPORT_TABLES) {
        const { data: rows, error } = await supabase.from(table).select('*').eq('user_id', persona.user_id)
        if (error) throw error
        data[table] = rows ?? []
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ai-diary-export-${todayISO()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError('데이터를 내보내는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      console.error(err)
    } finally {
      setExporting(false)
    }
  }

  if (retakingScreening) {
    return <AdhdScreening onComplete={handleScreeningComplete} />
  }

  // 저장된 값이 자주 나온 감정 순위 밖이어도 선택창에서 사라지지 않게 포함시킨다.
  const emotionSelectOptions =
    persona.insight_emotion_focus && !emotionOptions.includes(persona.insight_emotion_focus)
      ? [persona.insight_emotion_focus, ...emotionOptions]
      : emotionOptions

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 py-4">
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-medium text-stone-700">저녁 리마인더</p>
          <p className="mt-0.5 text-xs text-stone-400">켜져 있어도 재촉하는 문구 없이 부드럽게만 알려드려요.</p>
        </div>
        <button
          type="button"
          onClick={toggleReminder}
          className="shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600"
        >
          {persona.reminder_opt_in ? '켜짐' : '꺼짐'}
        </button>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-medium text-stone-700">다이어리 형식</p>
          <p className="mt-0.5 text-xs text-stone-400">문단형 또는 짧은 목록형 중에서 골라주세요.</p>
        </div>
        <button
          type="button"
          onClick={toggleDiaryFormat}
          className="shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600"
        >
          {persona.diary_format === 'list' ? '목록형' : '문단형'}
        </button>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-stone-700">ADHD 자가 문항</p>
        <p className="text-xs text-stone-400">
          {persona.adhd_screening_result ? SCREENING_LABEL[persona.adhd_screening_result] : '아직 답한 적이 없어요.'}
        </p>
        <button
          type="button"
          onClick={() => setRetakingScreening(true)}
          className="self-start text-xs text-amber-600 underline"
        >
          {persona.adhd_screening_result ? '다시 해보기' : '해보기'}
        </button>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-stone-700">내 데이터 내보내기</p>
        <p className="text-xs text-stone-400">지금까지 남긴 모든 기록을 JSON 파일 하나로 받아요.</p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="self-start rounded-full bg-amber-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {exporting ? '내보내는 중...' : '내보내기'}
        </button>
        {exportError && <p className="text-xs text-red-500">{exportError}</p>}
      </div>

      <h2 className="mt-2 px-1 text-xs font-semibold tracking-wide text-stone-400 uppercase">나만의 설정</h2>

      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-stone-700">감정-소비 인사이트</p>
            <p className="mt-0.5 text-xs text-stone-400">
              판단 없이, 어떤 감정이 있던 날의 소비 패턴만 관찰해서 보여줘요.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleInsightEnabled}
            className="shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600"
          >
            {persona.insight_enabled ? '켜짐' : '꺼짐'}
          </button>
        </div>

        {persona.insight_enabled && (
          <div className="flex flex-col gap-2 border-t border-stone-100 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-stone-500">관찰 주기</p>
              <select
                value={persona.insight_period}
                onChange={handleInsightPeriodChange}
                className="rounded-full border border-stone-200 bg-transparent px-2 py-1 text-xs text-stone-600 outline-none"
              >
                <option value="week">주간</option>
                <option value="month">월간</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-stone-500">우선 관찰 감정</p>
              <select
                value={persona.insight_emotion_focus ?? ''}
                onChange={handleEmotionFocusChange}
                className="rounded-full border border-stone-200 bg-transparent px-2 py-1 text-xs text-stone-600 outline-none"
              >
                <option value="">자동(가장 많이 나온 감정)</option>
                {emotionSelectOptions.map((emotion) => (
                  <option key={emotion} value={emotion}>
                    {emotion}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-3 w-full text-center text-xs text-stone-400 underline hover:text-stone-600"
      >
        로그아웃
      </button>
    </div>
  )
}
