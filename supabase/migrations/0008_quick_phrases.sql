-- 자주 쓰는 말을 저장해두고 탭 한 번으로 그대로 기록할 수 있게 한다(매번 새로 말하거나
-- 타이핑하는 부담을 줄임).

create table if not exists public.quick_phrase (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  text       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.quick_phrase is '오늘 탭에서 한 번에 기록할 수 있게 저장해두는 자주 쓰는 문구.';

create index if not exists quick_phrase_user_id_idx
  on public.quick_phrase (user_id, sort_order);

alter table public.quick_phrase enable row level security;

create policy "quick_phrase_select_own" on public.quick_phrase
  for select using (auth.uid() = user_id);
create policy "quick_phrase_insert_own" on public.quick_phrase
  for insert with check (auth.uid() = user_id);
create policy "quick_phrase_update_own" on public.quick_phrase
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "quick_phrase_delete_own" on public.quick_phrase
  for delete using (auth.uid() = user_id);
