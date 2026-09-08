import { supabase } from '../supabaseClient'

interface PoolRow {
  image_url: string
  tags: string[] | null
}

// targetTags(무드/활동 태그)와 가장 많이 겹치는 이미지를 하나 골라온다. 완전히 안 겹쳐도
// (예: 아직 그 조합의 이미지가 없는 경우) 풀에 이미지가 하나라도 있으면 그중 아무거나
// 돌려준다 — 매번 새로 그리는 것보다 태그가 좀 안 맞는 기존 이미지를 쓰는 편이 비용 면에서
// 낫다고 보기 때문이다. 풀 자체가 비어 있으면(시드 전) null을 돌려주고, 그때만 호출한 쪽에서
// 실시간 Imagen 생성으로 대체한다.
export async function pickPoolImage(targetTags: string[]): Promise<string | null> {
  const { data, error } = await supabase.from('persona_image_pool').select('image_url, tags')
  if (error || !data || data.length === 0) return null

  const rows = data as PoolRow[]
  let bestScore = -1
  let bestRows: PoolRow[] = []

  for (const row of rows) {
    const score = (row.tags ?? []).filter((tag) => targetTags.includes(tag)).length
    if (score > bestScore) {
      bestScore = score
      bestRows = [row]
    } else if (score === bestScore) {
      bestRows.push(row)
    }
  }

  const pick = bestRows[Math.floor(Math.random() * bestRows.length)]
  return pick?.image_url ?? null
}
