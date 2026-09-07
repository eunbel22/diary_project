-- 지출 충동 "일시정지"(옵트인): 구매 욕구를 표현하는 말을 감지해도 바로 판단하지 않고,
-- 설정한 시간 뒤에 캐릭터가 한 번 더 살짝 물어본다. 실제 알림 발송은 하지 않고(이 앱의
-- 기존 방침과 동일), 앱을 다시 열었을 때 조용히 보여준다.
alter table public.persona
  add column if not exists purchase_pause_enabled boolean not null default false;

alter table public.persona
  add column if not exists purchase_pause_wait_hours integer not null default 24
    check (purchase_pause_wait_hours in (12, 24, 72));

alter table public.persona
  add column if not exists purchase_pause_min_amount integer not null default 30000;

comment on column public.persona.purchase_pause_enabled is '지출 충동 일시정지 기능 사용 여부(기본 꺼짐, 옵트인).';
comment on column public.persona.purchase_pause_wait_hours is '구매 욕구 감지 후 다시 물어볼 때까지 대기 시간(12/24/72시간).';
comment on column public.persona.purchase_pause_min_amount is '이 금액 이상 언급된 구매 욕구에만 반응.';

create table if not exists public.purchase_pause (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  item       text not null,
  amount     numeric,
  created_at timestamptz not null default now(),
  remind_at  timestamptz not null,
  resolved   boolean not null default false
);

comment on table public.purchase_pause is '지출 충동 일시정지: 구매 욕구 발화를 감지해 나중에 한 번 더 물어보기 위한 대기열.';

create index if not exists purchase_pause_user_id_idx
  on public.purchase_pause (user_id, resolved, remind_at);

alter table public.purchase_pause enable row level security;

create policy "purchase_pause_select_own" on public.purchase_pause
  for select using (auth.uid() = user_id);
create policy "purchase_pause_insert_own" on public.purchase_pause
  for insert with check (auth.uid() = user_id);
create policy "purchase_pause_update_own" on public.purchase_pause
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "purchase_pause_delete_own" on public.purchase_pause
  for delete using (auth.uid() = user_id);
