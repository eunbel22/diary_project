-- 캐릭터 이미지를 사용자마다 실시간으로 Imagen 호출해 그리는 대신, 미리 생성해둔 이미지
-- 풀에서 골라 쓰기 위한 테이블. 이미지 하나에는 태그가 여러 개 붙을 수 있다 — 무드
-- (발랄함 등, src/lib/personaTags.ts의 PERSONA_MOOD_TAGS)와 활동(먹는중 등, 같은 파일의
-- PERSONA_ACTIVITY_TAGS)은 톤·관심사에서 추론해 매칭에 쓰이고, 캐릭터 생김새(토끼/곰/사람 등)
-- 같은 자유 태그는 매칭에는 안 쓰이고 풀을 구성하는 사람을 위한 설명 정보로만 남는다.
-- 실제 이미지 생성·업로드는 scripts/seed-persona-image-pool.mjs(Imagen 자동 생성) 또는
-- scripts/upload-persona-image-pool.mjs(사람이 직접 만든 이미지 업로드)를 수동으로 돌려서
-- 채운다(비용/수작업이 드는 일회성 작업이라 자동 실행하지 않음).
create table if not exists public.persona_image_pool (
  id         uuid primary key default gen_random_uuid(),
  tags       text[] not null default '{}',
  image_url  text not null,
  created_at timestamptz not null default now()
);

comment on table public.persona_image_pool is '태그별 사전 생성 캐릭터 이미지 풀. 사용자별 데이터가 아니라 앱 전체가 공유하는 자산. tags는 무드/활동/생김새 태그를 섞어서 담는다.';

alter table public.persona_image_pool enable row level security;

-- 로그인한 사용자라면 누구나 풀에서 이미지를 골라 쓸 수 있어야 하므로 select만 열어둔다.
-- 쓰기는 시드/업로드 스크립트가 service_role 키로(RLS 우회) 직접 넣으므로 별도 정책이 필요 없다.
create policy "persona_image_pool_select_authenticated" on public.persona_image_pool
  for select using (auth.role() = 'authenticated');
