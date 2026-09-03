export interface Persona {
  user_id: string
  name: string
  tone: string
  image_url: string | null
  created_at: string
}

export interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

export interface PersonaDraft {
  name: string
  tone: string
  interests: string[]
}

export interface OnboardingTurnResponse {
  assistantMessage: string
  isComplete: boolean
  persona?: PersonaDraft
}
