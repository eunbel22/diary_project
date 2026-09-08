import { useState } from 'react'
import { ArchiveSection } from './ArchiveSection'
import { DiarySection } from './DiarySection'
import { EmotionSpendingInsight } from './EmotionSpendingInsight'
import { EmotionSummary } from './EmotionSummary'
import { PersonaRebuildChat } from './PersonaRebuildChat'
import { WeeklyReview } from './WeeklyReview'
import type { Persona } from '../types'

interface Props {
  persona: Persona
  onPersonaUpdated: (persona: Persona) => void
}

export function DiaryTab({ persona, onPersonaUpdated }: Props) {
  const [rebuilding, setRebuilding] = useState(false)
  // ArchiveSection은 마운트될 때 딱 한 번만 개수·캘린더를 불러오는데, 다이어리를 새로 쓴다고
  // 자동으로 다시 불러오지 않는다. 새로 쓸 때마다 key를 바꿔서 강제로 다시 마운트시킨다.
  const [archiveKey, setArchiveKey] = useState(0)

  if (rebuilding) {
    return (
      <PersonaRebuildChat
        persona={persona}
        onComplete={(updated) => {
          onPersonaUpdated(updated)
          setRebuilding(false)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <DiarySection
        userId={persona.user_id}
        personaName={persona.name}
        personaTone={persona.tone}
        diaryFormat={persona.diary_format}
        onDiarySaved={() => setArchiveKey((k) => k + 1)}
      />
      <EmotionSummary userId={persona.user_id} />
      {persona.insight_enabled && (
        <EmotionSpendingInsight
          userId={persona.user_id}
          period={persona.insight_period}
          emotionFocus={persona.insight_emotion_focus}
        />
      )}
      <WeeklyReview
        userId={persona.user_id}
        personaName={persona.name}
        personaTone={persona.tone}
        period={persona.weekly_review_period}
        includeEmotion={persona.weekly_review_include_emotion}
      />
      <ArchiveSection key={archiveKey} userId={persona.user_id} onStartRebuild={() => setRebuilding(true)} />
    </div>
  )
}
