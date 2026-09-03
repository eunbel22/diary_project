import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { RawLog } from '../types'

interface Props {
  userId: string
}

export function ConsumptionTab({ userId }: Props) {
  const [logs, setLogs] = useState<RawLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const { data } = await supabase
      .from('raw_log')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'consumption')
      .order('created_at', { ascending: false })
    setLogs((data as RawLog[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleDelete = async (id: string) => {
    await supabase.from('raw_log').delete().eq('id', id)
    await load()
  }

  if (loading) return null

  const total = logs.reduce((sum, log) => sum + (log.content.amount ?? 0), 0)

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-4">
      <div className="mb-4 rounded-2xl bg-white p-4 text-center shadow-sm">
        <p className="text-xs text-stone-400">지금까지 남긴 소비 합계</p>
        <p className="mt-1 text-xl font-semibold text-stone-800">{total.toLocaleString()}원</p>
      </div>

      {logs.length === 0 ? (
        <p className="text-center text-sm text-stone-400">아직 남긴 소비 기록이 없어요.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-sm shadow-sm"
            >
              <div>
                <p className="font-medium text-stone-700">{log.content.item ?? '소비'}</p>
                <p className="text-xs text-stone-400">
                  {new Date(log.created_at).toLocaleDateString('ko-KR')}
                  {log.content.place ? ` · ${log.content.place}` : ''}
                </p>
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
          ))}
        </div>
      )}
    </div>
  )
}
