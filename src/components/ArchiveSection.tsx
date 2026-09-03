import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { Coupon, DiaryEntry, Persona } from '../types'

interface Props {
  userId: string
  personaName: string
  personaTone: string
  onPersonaUpdated: (persona: Persona) => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function dateToISO(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function getMonthWeeks(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (Date | null)[] = []
  for (let i = 0; i < firstDay.getDay(); i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function ArchiveSection({ userId, personaName, personaTone, onPersonaUpdated }: Props) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [entries, setEntries] = useState<Record<string, DiaryEntry>>({})
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [coupon, setCoupon] = useState<Coupon | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [redeemError, setRedeemError] = useState<string | null>(null)

  const loadCoupon = async () => {
    const { data } = await supabase.from('coupon').select('*').eq('user_id', userId).maybeSingle()
    setCoupon((data as Coupon | null) ?? null)
  }

  useEffect(() => {
    loadCoupon()
  }, [])

  useEffect(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const start = dateToISO(new Date(year, month, 1))
    const end = dateToISO(new Date(year, month + 1, 0))

    supabase
      .from('diary_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end)
      .then(({ data }) => {
        const map: Record<string, DiaryEntry> = {}
        for (const row of (data as DiaryEntry[] | null) ?? []) map[row.date] = row
        setEntries(map)
        setSelectedDate(null)
      })
  }, [viewDate])

  const handleRedeem = async () => {
    setRedeeming(true)
    setRedeemError(null)
    try {
      const { data: redeemed, error: rpcError } = await supabase.rpc('redeem_coupon')
      if (rpcError) throw rpcError
      if (!redeemed) {
        setRedeemError('사용할 수 있는 쿠폰이 없어요.')
        return
      }

      const res = await fetch('/api/generate-persona-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: personaName, tone: personaTone }),
      })
      if (!res.ok) throw new Error('이미지 생성에 실패했어요.')

      const { imageBase64, mimeType } = await res.json()
      const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0))
      const path = `${userId}/character.png`
      const { error: uploadError } = await supabase.storage
        .from('persona-images')
        .upload(path, bytes, { contentType: mimeType ?? 'image/png', upsert: true })
      if (uploadError) throw uploadError

      const baseUrl = supabase.storage.from('persona-images').getPublicUrl(path).data.publicUrl
      const imageUrl = `${baseUrl}?v=${Date.now()}`

      const { data: updatedPersona, error: personaError } = await supabase
        .from('persona')
        .update({ image_url: imageUrl })
        .eq('user_id', userId)
        .select()
        .single()
      if (personaError) throw personaError

      onPersonaUpdated(updatedPersona as Persona)
      await loadCoupon()
    } catch (err) {
      setRedeemError('캐릭터를 새로 그리는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
      console.error(err)
    } finally {
      setRedeeming(false)
    }
  }

  const weeks = getMonthWeeks(viewDate.getFullYear(), viewDate.getMonth())
  const entryCount = coupon?.entry_count ?? 0
  const couponsAvailable = coupon?.coupons_available ?? 0

  return (
    <div className="mt-4 w-full max-w-lg px-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm text-stone-600">지금까지 다이어리 {entryCount}개를 남겼어요.</p>

        {couponsAvailable > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleRedeem}
              disabled={redeeming}
              className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {redeeming ? '새로 그리는 중...' : `쿠폰으로 캐릭터 새로 그리기 (${couponsAvailable}개)`}
            </button>
          </div>
        )}
        {redeemError && <p className="mt-2 text-xs text-red-500">{redeemError}</p>}
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="px-2 text-stone-400 hover:text-stone-600"
            aria-label="이전 달"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-stone-700">
            {viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월
          </span>
          <button
            type="button"
            onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="px-2 text-stone-400 hover:text-stone-600"
            aria-label="다음 달"
          >
            ›
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-stone-400">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="mt-1 grid grid-cols-7 gap-1">
            {week.map((date, dayIndex) => {
              if (!date) return <span key={dayIndex} />
              const iso = dateToISO(date)
              const hasEntry = Boolean(entries[iso])
              const isSelected = selectedDate === iso

              return (
                <button
                  key={dayIndex}
                  type="button"
                  onClick={() => hasEntry && setSelectedDate(isSelected ? null : iso)}
                  className={`rounded-full py-1 text-xs ${
                    hasEntry ? 'bg-amber-200 font-medium text-amber-800' : 'text-stone-300'
                  } ${isSelected ? 'ring-2 ring-amber-500' : ''}`}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
        ))}

        {selectedDate && entries[selectedDate] && (
          <div className="mt-3 whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-left text-sm text-stone-700">
            {entries[selectedDate].body}
          </div>
        )}
      </div>
    </div>
  )
}
