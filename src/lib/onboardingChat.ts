import type { ChatMessage, OnboardingTurnResponse } from '../types'

// 온보딩/캐릭터 재구성 대화에서 응답이 유독 오래 걸리는 경우가 있어(모델 자체 지연,
// 콜드 스타트 등 원인은 다양할 수 있음), 무한정 기다리게 두지 않고 일정 시간 후엔
// "오래 걸리고 있다"는 걸 분명히 알려주고 다시 시도할 수 있게 한다.
const REQUEST_TIMEOUT_MS = 20000

export type OnboardingTurnResult =
  | { ok: true; turn: OnboardingTurnResponse }
  | { ok: false; timedOut: boolean }

export async function sendOnboardingTurn(
  messages: ChatMessage[],
  mode?: 'initial' | 'rebuild',
): Promise<OnboardingTurnResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch('/api/onboarding-chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mode ? { messages, mode } : { messages }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error('온보딩 응답을 가져오지 못했어요.')

    const turn: OnboardingTurnResponse = await res.json()
    return { ok: true, turn }
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError'
    if (!timedOut) console.error(err)
    return { ok: false, timedOut }
  } finally {
    clearTimeout(timer)
  }
}
