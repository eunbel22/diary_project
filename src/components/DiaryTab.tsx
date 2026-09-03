import { ArchiveSection } from './ArchiveSection'
import { DiarySection } from './DiarySection'
import type { Persona } from '../types'

interface Props {
  persona: Persona
  onPersonaUpdated: (persona: Persona) => void
}

export function DiaryTab({ persona, onPersonaUpdated }: Props) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <DiarySection userId={persona.user_id} personaName={persona.name} personaTone={persona.tone} />
      <ArchiveSection
        userId={persona.user_id}
        personaName={persona.name}
        personaTone={persona.tone}
        onPersonaUpdated={onPersonaUpdated}
      />
    </div>
  )
}
