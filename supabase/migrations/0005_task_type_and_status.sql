-- 할일(task) 타입 추가: 시각·장소가 정해지지 않은, 그냥 해야 하는 일.
-- '일정'은 시각·장소가 있는 약속, '할일'은 그런 게 없는 액션 아이템으로 구분한다.
alter type public.raw_log_type add value if not exists 'task';

-- 완료 상태는 raw_log와 분리해서 저장한다. raw_log는 원본 발화를 그대로 보존하기 위해
-- 의도적으로 수정을 막아뒀으므로(0001 마이그레이션), "완료" 같은 앱 상태는 별도 테이블에서
-- 관리하고 본인 소유 행에 대해서는 완전한 CRUD를 허용한다.
create table public.task_status (
  raw_log_id   uuid primary key references public.raw_log (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  completed    boolean not null default false,
  completed_at timestamptz,
  updated_at   timestamptz not null default now()
);

comment on table public.task_status is '일정/할일(raw_log)의 완료 여부. raw_log 자체는 불변, 완료 상태만 여기서 갱신한다.';

alter table public.task_status enable row level security;

create policy "task_status_select_own" on public.task_status
  for select using (auth.uid() = user_id);
create policy "task_status_insert_own" on public.task_status
  for insert with check (auth.uid() = user_id);
create policy "task_status_update_own" on public.task_status
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "task_status_delete_own" on public.task_status
  for delete using (auth.uid() = user_id);

drop trigger if exists task_status_set_updated_at on public.task_status;
create trigger task_status_set_updated_at
  before update on public.task_status
  for each row
  execute function public.set_updated_at();
