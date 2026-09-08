import { useEffect, useRef, useState } from 'react'
import type { AdhdScreeningResult } from '../types'

interface Props {
  onComplete: (result: AdhdScreeningResult | null) => void
}

// 1(전혀 없음)~5(매우 자주) 리커트 척도. handleAnswer에는 기존 채점 로직과 호환되도록
// 0~4의 인덱스 값을 그대로 넘긴다.
const SCALE_LABELS = ['전혀 없음', '거의 없음', '가끔', '자주', '매우 자주']
const ANSWER_ADVANCE_DELAY = 450

// 성인 ADHD 자가선별검사(ASRS v1.1 Part A)를 말투만 순화한 것. 문항별로 "이 정도부터는
// 눈여겨볼 만하다"고 보는 기준(shadeFrom)이 다르며, 6문항 중 4개 이상 해당하면
// 공식 채점 기준상 "추가로 살펴볼 만함"으로 본다.
const QUESTIONS: { text: string; shadeFrom: number }[] = [
  { text: '어떤 일을 거의 다 끝내놓고도, 마지막 마무리를 짓는 게 유독 어려운 편인가요?', shadeFrom: 2 },
  { text: '정리정돈이 필요한 일을 할 때, 순서를 딱 맞춰서 진행하는 게 힘든 편인가요?', shadeFrom: 2 },
  { text: '약속이나 꼭 지켜야 할 일을 깜빡 잊어버리는 편인가요?', shadeFrom: 3 },
  { text: '곰곰이 생각해야 하는 일을 시작하기 전에, 자꾸 미루게 되나요?', shadeFrom: 3 },
  { text: '오래 앉아 있어야 할 때, 손이나 발을 가만히 두지 못하고 꼼지락거리게 되나요?', shadeFrom: 4 },
  { text: '마치 엔진이라도 달린 것처럼, 가만히 있지 못하고 계속 움직이거나 뭔가를 하게 되나요?', shadeFrom: 4 },
]

export function AdhdScreening({ onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<AdhdScreeningResult | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [showToast, setShowToast] = useState(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  const handleAnswer = (value: number) => {
    if (selected !== null) return
    setSelected(value)
    setShowToast(true)
    toastTimer.current = setTimeout(() => setShowToast(false), ANSWER_ADVANCE_DELAY + 400)

    advanceTimer.current = setTimeout(() => {
      const next = [...answers, value]
      setSelected(null)
      if (next.length < QUESTIONS.length) {
        setAnswers(next)
        setStep((s) => s + 1)
        return
      }
      const shaded = next.filter((v, i) => v >= QUESTIONS[i].shadeFrom).length
      setResult(shaded >= 4 ? 'suspected' : 'not_suspected')
    }, ANSWER_ADVANCE_DELAY)
  }

  if (result) {
    const message =
      result === 'suspected'
        ? '답변을 보니 ADHD와 비슷한 특성이 꽤 여러 개 보이는 편이에요. 그렇다고 뭔가 잘못된 건 전혀 아니고, 그냥 당신이 세상을 살아가는 방식 중 하나일 뿐이에요. 이 다이어리가 조금이라도 편한 도구가 되면 좋겠어요.'
        : '답변을 보니 ADHD와 비슷한 특성은 크게 두드러지지 않는 편이에요. 그래도 이 다이어리는 누구나 편하게 쓸 수 있게 만들었으니, 편하게 써주세요.'

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-amber-50 px-4 text-center">
        <p className="max-w-xs text-sm leading-relaxed text-stone-600">{message}</p>
        <p className="max-w-xs text-xs leading-relaxed text-stone-400">
          참고로 이건 정식 진단이 아니라 그냥 참고용 자가 점검이에요. 궁금한 점이 있다면 편하게 전문가와도
          이야기 나눠보세요.
        </p>
        <button
          type="button"
          onClick={() => onComplete(result)}
          className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white"
        >
          계속하기
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-amber-50 px-4 py-8">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6">
        <div className="flex flex-col gap-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-amber-400 transition-all duration-300"
              style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span>
              {step + 1} / {QUESTIONS.length}
            </span>
            <button type="button" onClick={() => onComplete(null)} className="underline hover:text-stone-600">
              건너뛰기
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
          <p className="text-xs text-stone-400">가볍게 답해주세요, 정답은 없어요</p>
          <p className="mt-3 text-sm leading-relaxed text-stone-700">{QUESTIONS[step].text}</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            {SCALE_LABELS.map((label, value) => (
              <button
                key={label}
                type="button"
                onClick={() => handleAnswer(value)}
                disabled={selected !== null}
                aria-label={`${value + 1}점 - ${label}`}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-medium shadow-sm transition-colors disabled:cursor-default ${
                  selected === value
                    ? 'bg-amber-500 text-white'
                    : selected !== null
                      ? 'bg-white text-stone-300'
                      : 'bg-white text-stone-600 hover:bg-amber-100'
                }`}
              >
                {value + 1}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between px-1 text-xs text-stone-400">
            <span>전혀 없음</span>
            <span>매우 자주</span>
          </div>
        </div>
      </div>

      <div
        className={`pointer-events-none fixed inset-x-0 bottom-8 flex justify-center transition-opacity duration-300 ${
          showToast ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {selected !== null && (
          <span className="rounded-full bg-stone-800 px-4 py-2 text-xs text-white shadow-lg">
            '{SCALE_LABELS[selected]}'으로 답했어요
          </span>
        )}
      </div>
    </div>
  )
}
