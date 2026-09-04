export type AdhdScreeningResult = 'suspected' | 'not_suspected'
export type DiaryFormat = 'paragraph' | 'list'
export type InsightPeriod = 'week' | 'month'
export type QuickEntryMode = 'text' | 'voice'

export interface Persona {
  user_id: string
  name: string
  tone: string
  image_url: string | null
  reminder_opt_in: boolean
  adhd_screening_result: AdhdScreeningResult | null
  adhd_screening_completed_at: string | null
  diary_format: DiaryFormat
  insight_enabled: boolean
  insight_period: InsightPeriod
  insight_emotion_focus: string | null
  quick_entry_mode: QuickEntryMode
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

export type RawLogType = 'consumption' | 'schedule' | 'task' | 'event'

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
  recurring?: 'yearly'
}

export interface RawLog {
  id: string
  user_id: string
  type: RawLogType
  content: RawLogContent
  is_estimated: boolean
  created_at: string
}

export interface TaskStatus {
  raw_log_id: string
  user_id: string
  completed: boolean
  completed_at: string | null
  updated_at: string
}

// schedule/task 조회 시 task_status를 함께 embed해서 받아올 때 쓰는 형태.
// raw_log_id가 task_status의 기본키라 PostgREST가 1:1 관계로 인식해 배열이 아니라
// 객체 하나(또는 null)로 내려준다.
export interface RawLogWithStatus extends RawLog {
  task_status?: { completed: boolean } | null
}

export interface ConsumptionCategoryRow {
  id: string
  user_id: string
  name: string
  sort_order: number
  created_at: string
}

// consumption 조회 시 consumption_override를 함께 embed해서 받아올 때 쓰는 형태.
// raw_log_id가 consumption_override의 기본키라 PostgREST가 1:1로 인식해
// 객체 하나(또는 null)로 내려준다(task_status와 동일한 이유).
export interface RawLogWithCategoryOverride extends RawLog {
  consumption_override?: { category: string } | null
}

export interface QuickPhrase {
  id: string
  user_id: string
  text: string
  sort_order: number
  created_at: string
}

export interface StructuredEntry {
  type: RawLogType
  content: RawLogContent
  isEstimated: boolean
  missingRequired: boolean
  isCompletion?: boolean
  completionSubject?: string
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
