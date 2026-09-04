import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { CONSUMPTION_CATEGORIES, type ConsumptionCategoryRow, type RawLogWithCategoryOverride } from '../types'

interface Props {
  userId: string
}

function dateToISO(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function categoryOf(log: RawLogWithCategoryOverride): string {
  return log.consumption_override?.category ?? log.content.category ?? '기타'
}

export function ConsumptionTab({ userId }: Props) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [logs, setLogs] = useState<RawLogWithCategoryOverride[]>([])
  const [categories, setCategories] = useState<ConsumptionCategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [managingCategories, setManagingCategories] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  // 카테고리는 사용자가 직접 정의하는 목록이다. 처음 쓰는 사용자는 아직 아무 카테고리도
  // 없을 테니, 그 경우에만 기본 7종으로 한 번 시드해둔다.
  const loadCategories = async () => {
    const { data } = await supabase
      .from('consumption_category')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
    let rows = (data as ConsumptionCategoryRow[] | null) ?? []
    if (rows.length === 0) {
      const seeded = CONSUMPTION_CATEGORIES.map((name, index) => ({ user_id: userId, name, sort_order: index }))
      const { data: inserted } = await supabase.from('consumption_category').insert(seeded).select()
      rows = (inserted as ConsumptionCategoryRow[] | null) ?? []
    }
    setCategories(rows)
  }

  const load = async () => {
    setLoading(true)
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const start = `${dateToISO(new Date(year, month, 1))}T00:00:00`
    const end = `${dateToISO(new Date(year, month + 1, 0))}T23:59:59.999`

    const { data } = await supabase
      .from('raw_log')
      .select('*, consumption_override(category)')
      .eq('user_id', userId)
      .eq('type', 'consumption')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })

    setLogs((data as RawLogWithCategoryOverride[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadCategories()
  }, [])

  useEffect(() => {
    load()
  }, [viewDate])

  const handleDelete = async (id: string) => {
    await supabase.from('raw_log').delete().eq('id', id)
    await load()
  }

  const handleReassign = async (log: RawLogWithCategoryOverride, category: string) => {
    await supabase.from('consumption_override').upsert({ raw_log_id: log.id, user_id: userId, category })
    await load()
  }

  const handleAddCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    await supabase
      .from('consumption_category')
      .insert({ user_id: userId, name, sort_order: categories.length })
    setNewCategoryName('')
    await loadCategories()
  }

  const handleRenameCategory = async (id: string, name: string) => {
    if (!name.trim()) return
    await supabase.from('consumption_category').update({ name: name.trim() }).eq('id', id)
    await loadCategories()
  }

  const handleDeleteCategory = async (id: string) => {
    await supabase.from('consumption_category').delete().eq('id', id)
    await loadCategories()
  }

  if (loading) return null

  const total = logs.reduce((sum, log) => sum + (log.content.amount ?? 0), 0)

  const totalsByCategory = new Map<string, number>()
  for (const log of logs) {
    const category = categoryOf(log)
    totalsByCategory.set(category, (totalsByCategory.get(category) ?? 0) + (log.content.amount ?? 0))
  }
  const breakdown = [...totalsByCategory.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
  const maxAmount = breakdown[0]?.amount ?? 0

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-4">
      <div className="flex items-center justify-between px-1">
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

      <div className="mt-3 rounded-2xl bg-white p-4 text-center shadow-sm">
        <p className="text-xs text-stone-400">이번 달 소비 합계</p>
        <p className="mt-1 text-xl font-semibold text-stone-800">{total.toLocaleString()}원</p>
      </div>

      {breakdown.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
          {breakdown.map(({ category, amount }) => (
            <div key={category} className="flex items-center gap-2 text-xs text-stone-600">
              <span className="w-16 shrink-0 truncate text-left">{category}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-amber-100">
                <div
                  className="h-full rounded-r-full bg-amber-400"
                  style={{ width: `${maxAmount > 0 ? (amount / maxAmount) * 100 : 0}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right tabular-nums">{amount.toLocaleString()}원</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setManagingCategories((v) => !v)}
          className="text-xs text-stone-400 underline hover:text-stone-600"
        >
          카테고리 관리 {managingCategories ? '접기' : '펼치기'}
        </button>

        {managingCategories && (
          <div className="mt-3 flex flex-col gap-2">
            {categories.map((category) => (
              <div key={category.id} className="flex items-center gap-2">
                <input
                  defaultValue={category.name}
                  onBlur={(e) => handleRenameCategory(category.id, e.target.value)}
                  className="flex-1 rounded-full border border-stone-200 px-3 py-1 text-xs outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(category.id)}
                  className="text-xs text-stone-300 hover:text-stone-500"
                >
                  삭제
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="새 카테고리 이름"
                className="flex-1 rounded-full border border-stone-200 px-3 py-1 text-xs outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                추가
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {logs.length === 0 ? (
          <p className="text-center text-sm text-stone-400">이번 달엔 남긴 소비 기록이 없어요.</p>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-sm shadow-sm"
            >
              <div>
                <p className="font-medium text-stone-700">{log.content.item ?? '소비'}</p>
                <div className="mt-1 flex items-center gap-1 text-xs text-stone-400">
                  <select
                    value={categoryOf(log)}
                    onChange={(e) => handleReassign(log, e.target.value)}
                    className="rounded-full border border-stone-200 bg-transparent px-1.5 py-0.5 text-xs text-stone-500 outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <span>· {new Date(log.created_at).toLocaleDateString('ko-KR')}</span>
                  {log.content.place && <span>· {log.content.place}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium text-stone-700">
                  {log.content.amount != null ? `${log.content.amount.toLocaleString()}원` : '-'}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(log.id)}
                  className="text-xs text-stone-300 hover:text-stone-500"
                >
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
