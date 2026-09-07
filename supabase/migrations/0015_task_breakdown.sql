-- 작업 마이크로 분해(옵트인): 크고 막연한 할일을 캐릭터가 잘게 나눠 제안한다.
-- raw_log는 불변이라 세부 단계는 task_status/consumption_override와 같은 패턴으로
-- 별도 테이블에 저장한다. raw_log_id가 기본키라 PostgREST가 1:1 관계로 인식해
-- 조회 시 배열이 아니라 객체(또는 null)로 embed된다.
alter table public.persona
  add column if not exists task_breakdown_enabled boolean not null default false;

alter table public.persona
  add column if not exists task_breakdown_detail text not null default 'simple'
    check (task_breakdown_detail in ('simple', 'detailed'));

comment on column public.persona.task_breakdown_enabled is '큰 할일을 감지했을 때 잘게 나눠 제안하는 기능 사용 여부(기본 꺼짐).';
comment on column public.persona.task_breakdown_detail is '분해 단계 수: simple(2~3단계) 또는 detailed(4~5단계).';

create table if not exists public.task_breakdown (
  raw_log_id uuid primary key references public.raw_log (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  steps      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.task_breakdown is '할일 하나를 잘게 나눈 단계들. steps는 {text, completed} 객체 배열.';

alter table public.task_breakdown enable row level security;

create policy "task_breakdown_select_own" on public.task_breakdown
  for select using (auth.uid() = user_id);
create policy "task_breakdown_insert_own" on public.task_breakdown
  for insert with check (auth.uid() = user_id);
create policy "task_breakdown_update_own" on public.task_breakdown
  for update using (auth.uid() = user_id);
create policy "task_breakdown_delete_own" on public.task_breakdown
  for delete using (auth.uid() = user_id);
