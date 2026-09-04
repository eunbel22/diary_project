import { useState } from 'react'
import { ArchiveSection } from './ArchiveSection'
import { DiarySection } from './DiarySection'
import { EmotionSummary } from './EmotionSummary'
import { PersonaRebuildChat } from './PersonaRebuildChat'
import type { Persona } from '../types'

interface Props {
  persona: Persona
  onPersonaUpdated: (persona: Persona) => void
}

export function DiaryTab({ persona, onPersonaUpdated }: Props) {
  const [rebuilding, setRebuilding] = useState(false)

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
      />
      <EmotionSummary userId={persona.user_id} />
      <ArchiveSection userId={persona.user_id} onStartRebuild={() => setRebuilding(true)} />
    </div>
  )
}
