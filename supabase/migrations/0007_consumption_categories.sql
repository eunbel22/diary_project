-- 소비 카테고리 커스터마이징: 고정 7종 대신 사용자가 추가/이름변경/삭제할 수 있게 한다.
-- 자동 분류(구조화 파이프라인)는 그대로 기존 7종 키워드 매칭을 쓰되(raw_log는 불변이라
-- 자동 분류 결과 자체는 바꿀 수 없음), 사용자가 특정 기록의 카테고리를 다르게 지정하고
-- 싶으면 별도 override 테이블에 기록해 표시할 때만 우선 적용한다.

create table if not exists public.consumption_category (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.consumption_category is '사용자가 직접 정의하는 소비 카테고리 목록. 처음 사용 시 기본 7종으로 시드됨.';

create index if not exists consumption_category_user_id_idx
  on public.consumption_category (user_id, sort_order);

create table if not exists public.consumption_override (
  raw_log_id uuid primary key references public.raw_log (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  category   text not null,
  updated_at timestamptz not null default now()
);

comment on table public.consumption_override is
  '자동 분류된 소비 카테고리를 사용자가 직접 다시 지정한 값. raw_log 자체는 불변이라 여기에 override로 기록한다.';

drop trigger if exists consumption_override_set_updated_at on public.consumption_override;
create trigger consumption_override_set_updated_at
  before update on public.consumption_override
  for each row
  execute function public.set_updated_at();

alter table public.consumption_category enable row level security;
alter table public.consumption_override enable row level security;

create policy "consumption_category_select_own" on public.consumption_category
  for select using (auth.uid() = user_id);
create policy "consumption_category_insert_own" on public.consumption_category
  for insert with check (auth.uid() = user_id);
create policy "consumption_category_update_own" on public.consumption_category
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "consumption_category_delete_own" on public.consumption_category
  for delete using (auth.uid() = user_id);

create policy "consumption_override_select_own" on public.consumption_override
  for select using (auth.uid() = user_id);
create policy "consumption_override_insert_own" on public.consumption_override
  for insert with check (auth.uid() = user_id);
create policy "consumption_override_update_own" on public.consumption_override
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "consumption_override_delete_own" on public.consumption_override
  for delete using (auth.uid() = user_id);
