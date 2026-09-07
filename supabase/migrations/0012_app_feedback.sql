-- 다이어리 컨텐츠와는 무관하게, 앱 자체에 대한 사용자 피드백(별점 + 선택적 코멘트)을
-- 남길 수 있게 한다. 개발자가 나중에 Supabase에서 직접 모아본다.
create table if not exists public.app_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now()
);

comment on table public.app_feedback is '앱 자체에 대한 사용자 피드백(별점 1~5 + 선택적 코멘트).';

create index if not exists app_feedback_user_id_idx
  on public.app_feedback (user_id, created_at desc);

alter table public.app_feedback enable row level security;

create policy "app_feedback_select_own" on public.app_feedback
  for select using (auth.uid() = user_id);
create policy "app_feedback_insert_own" on public.app_feedback
  for insert with check (auth.uid() = user_id);
create policy "app_feedback_delete_own" on public.app_feedback
  for delete using (auth.uid() = user_id);
