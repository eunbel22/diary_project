import { supabase } from '../supabaseClient'
import type { PersonaVibeTag } from './personaVibe'

// 태그에 맞는 사전 생성 이미지를 하나 무작위로 골라온다. 풀이 아직 비어 있으면(시드 스크립트를
// 아직 안 돌렸거나 해당 태그가 소진된 경우) null을 돌려주고, 호출한 쪽에서 실시간 Imagen 생성으로
// 대체한다.
export async function pickPoolImage(tag: PersonaVibeTag): Promise<string | null> {
  const { data, error } = await supabase.from('persona_image_pool').select('image_url').eq('tag', tag)
  if (error || !data || data.length === 0) return null

  const pick = data[Math.floor(Math.random() * data.length)]
  return pick.image_url as string
}
