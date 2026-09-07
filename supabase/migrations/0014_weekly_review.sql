-- 주간(또는 격주) 회고: 캐릭터 목소리로 "이런 순간들이 있었어"를 성취 위주로 정리.
-- 놓친 일은 언급하지 않는다(원칙 3·4·6과 동일한 이유). Gemini 호출은 사용자가
-- "돌아보기"를 눌렀을 때만 발생 — 오늘의 다이어리 생성과 같은 방식.
alter table public.persona
  add column if not exists weekly_review_period text not null default 'weekly'
    check (weekly_review_period in ('weekly', 'biweekly'));

alter table public.persona
  add column if not exists weekly_review_include_emotion boolean not null default false;

comment on column public.persona.weekly_review_period is '주간 회고 생성 주기: weekly(매주) 또는 biweekly(격주).';
comment on column public.persona.weekly_review_include_emotion is '주간 회고에 감정 요약을 함께 포함할지 여부.';

create table if not exists public.weekly_review (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  body         text not null,
  created_at   timestamptz not null default now()
);

comment on table public.weekly_review is '캐릭터 목소리로 쓰는 주간(또는 격주) 회고. 성취 위주로만 쓰고 놓친 것은 언급하지 않음.';

create index if not exists weekly_review_user_id_idx
  on public.weekly_review (user_id, created_at desc);

alter table public.weekly_review enable row level security;

create policy "weekly_review_select_own" on public.weekly_review
  for select using (auth.uid() = user_id);
create policy "weekly_review_insert_own" on public.weekly_review
  for insert with check (auth.uid() = user_id);
create policy "weekly_review_delete_own" on public.weekly_review
  for delete using (auth.uid() = user_id);
