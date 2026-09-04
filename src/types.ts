export interface Persona {
  user_id: string
  name: string
  tone: string
  image_url: string | null
  reminder_opt_in: boolean
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

export type RawLogType = 'consumption' | 'schedule' | 'event'

export const CONSUMPTION_CATEGORIES = ['식비', '카페/간식', '교통', '쇼핑', '문화/여가', '생활', '기타'] as const
export type ConsumptionCategory = (typeof CONSUMPTION_CATEGORIES)[number]

export interface RawLogContent {
  item?: string
  amount?: number
  category?: ConsumptionCategory
  place?: string
  time?: string
  date?: string
  title?: string
  description?: string
  emotion?: string
  raw_text?: string
}

export interface RawLog {
  id: string
  user_id: string
  type: RawLogType
  content: RawLogContent
  is_estimated: boolean
  created_at: string
}

export interface StructuredEntry {
  type: RawLogType
  content: RawLogContent
  isEstimated: boolean
  missingRequired: boolean
}

export interface StructureLogResponse {
  transcript?: string
  entries: StructuredEntry[]
}

export interface DiaryEntry {
  id: string
  user_id: string
  date: string
  body: string
  version: number
  created_at: string
  updated_at: string
}

export interface Coupon {
  user_id: string
  entry_count: number
  milestone_reached: number
  coupons_available: number
  used_at: string | null
  updated_at: string
}
