-- 캐릭터 이미지를 사용자마다 실시간으로 Imagen 호출해 그리는 대신, 미리 몇 가지 "느낌"
-- 태그별로 생성해둔 이미지 풀에서 골라 쓰기 위한 테이블. 매칭은 톤/관심사를 키워드로 분류한
-- 태그(src/lib/personaVibe.ts의 PERSONA_VIBE_TAGS) 기준이며, 실제 이미지 생성·업로드는
-- scripts/seed-persona-image-pool.mjs를 수동으로 한 번 돌려서 채운다(비용이 드는 작업이라
-- 자동 실행하지 않음).
create table if not exists public.persona_image_pool (
  id         uuid primary key default gen_random_uuid(),
  tag        text not null,
  image_url  text not null,
  created_at timestamptz not null default now()
);

comment on table public.persona_image_pool is '태그별 사전 생성 캐릭터 이미지 풀. 사용자별 데이터가 아니라 앱 전체가 공유하는 자산.';

create index if not exists persona_image_pool_tag_idx on public.persona_image_pool (tag);

alter table public.persona_image_pool enable row level security;

-- 로그인한 사용자라면 누구나 풀에서 이미지를 골라 쓸 수 있어야 하므로 select만 열어둔다.
-- 쓰기는 seed 스크립트가 service_role 키로(RLS 우회) 직접 넣으므로 별도 정책이 필요 없다.
create policy "persona_image_pool_select_authenticated" on public.persona_image_pool
  for select using (auth.role() = 'authenticated');
