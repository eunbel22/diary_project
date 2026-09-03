-- AI 다이어리 앱 — 초기 스키마
-- CLAUDE.md의 "Supabase 스키마" 섹션 기준. Supabase SQL Editor 또는 `supabase db push`로 적용.

-- ============================================================
-- 확장
-- ============================================================
create extension if not exists "pgcrypto"; -- gen_random_uuid() 용

-- ============================================================
-- persona: 온보딩 시 1회 생성되는 캐릭터 프로필
-- ============================================================
create table if not exists public.persona (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  tone       text,
  image_url  text,
  created_at timestamptz not null default now()
);

comment on table public.persona is '온보딩 대화로 생성되는 사용자별 캐릭터(페르소나). 사용자당 1행.';

-- ============================================================
-- raw_log: 원본 발화(텍스트/음성 전사) + 추출된 구조화 값
-- ============================================================
create type public.raw_log_type as enum ('consumption', 'schedule', 'event'); -- 소비 / 일정 / 사건

create table if not exists public.raw_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  type         public.raw_log_type not null,
  content      jsonb not null, -- 추출된 구조화 데이터(항목/금액/날짜 등). 필수 필드 외 값은 is_estimated로 표시.
  is_estimated boolean not null default false,
  created_at   timestamptz not null default now()
);

comment on table public.raw_log is '사용자의 원본 발화(STT 전사 포함)에서 추출한 구조화 로그. 다이어리 생성의 입력 데이터.';

create index if not exists raw_log_user_id_created_at_idx
  on public.raw_log (user_id, created_at desc);

-- ============================================================
-- diary_entries: 날짜별 다이어리 본문 (재작성 시 version 증가)
-- ============================================================
create table if not exists public.diary_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  body       text not null,
  version    integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

comment on table public.diary_entries is '날짜별 생성된 다이어리 본문. 검토·재작성 시 version 증가, 페널티 없는 선택적 수정.';

create index if not exists diary_entries_user_id_date_idx
  on public.diary_entries (user_id, date desc);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists diary_entries_set_updated_at on public.diary_entries;
create trigger diary_entries_set_updated_at
  before update on public.diary_entries
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- coupon: 누적 작성 횟수 및 캐릭터 교체 쿠폰 상태 (서버 계산 전용)
-- ============================================================
create table if not exists public.coupon (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  entry_count       integer not null default 0, -- 누적 다이어리 작성 수 (diary_entries 신규 생성 기준)
  milestone_reached integer not null default 0, -- 마지막으로 쿠폰을 지급한 entry_count 값 (중복 지급 방지)
  coupons_available integer not null default 0, -- 아직 사용하지 않은 캐릭터 교체 쿠폰 수
  used_at           timestamptz,                -- 가장 최근 쿠폰 사용 시각
  updated_at        timestamptz not null default now()
);

comment on table public.coupon is '누적 마일스톤·쿠폰 상태. 클라이언트가 직접 쓰지 않고 트리거로만 갱신되는 파생 테이블.';

drop trigger if exists coupon_set_updated_at on public.coupon;
create trigger coupon_set_updated_at
  before update on public.coupon
  for each row
  execute function public.set_updated_at();

-- 마일스톤 간격(며칠에 한 번 쿠폰을 줄지). 필요 시 값만 조정.
create or replace function public.milestone_interval()
returns integer
language sql
immutable
as $$
  select 10;
$$;

-- diary_entries에 새 항목이 생길 때마다 coupon.entry_count 증가시키고
-- 마일스톤(10, 20, 30...) 도달 시 쿠폰 1개 지급. 클라이언트 값을 신뢰하지 않기 위해
-- SECURITY DEFINER로 실행하여 coupon 테이블의 RLS 제약과 무관하게 서버가 직접 계산.
create or replace function public.handle_new_diary_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count integer;
  v_interval  integer := public.milestone_interval();
  v_milestones_crossed integer;
begin
  insert into public.coupon (user_id, entry_count, milestone_reached, coupons_available)
  values (new.user_id, 1, 0, 0)
  on conflict (user_id) do update
    set entry_count = public.coupon.entry_count + 1
  returning entry_count into v_new_count;

  v_milestones_crossed :=
    (v_new_count / v_interval) - (coalesce((select milestone_reached from public.coupon where user_id = new.user_id), 0) / v_interval);

  if v_milestones_crossed > 0 then
    update public.coupon
    set milestone_reached = (v_new_count / v_interval) * v_interval,
        coupons_available = coupons_available + v_milestones_crossed
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists diary_entries_after_insert on public.diary_entries;
create trigger diary_entries_after_insert
  after insert on public.diary_entries
  for each row
  execute function public.handle_new_diary_entry();

-- ============================================================
-- Row Level Security: 모든 테이블에서 본인 데이터만 접근 가능
-- ============================================================
alter table public.persona enable row level security;
alter table public.raw_log enable row level security;
alter table public.diary_entries enable row level security;
alter table public.coupon enable row level security;

-- persona: 본인 행 전체 CRUD
create policy "persona_select_own" on public.persona
  for select using (auth.uid() = user_id);
create policy "persona_insert_own" on public.persona
  for insert with check (auth.uid() = user_id);
create policy "persona_update_own" on public.persona
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "persona_delete_own" on public.persona
  for delete using (auth.uid() = user_id);

-- raw_log: 본인 행 조회/추가 (원본 로그는 수정하지 않음, 삭제만 허용)
create policy "raw_log_select_own" on public.raw_log
  for select using (auth.uid() = user_id);
create policy "raw_log_insert_own" on public.raw_log
  for insert with check (auth.uid() = user_id);
create policy "raw_log_delete_own" on public.raw_log
  for delete using (auth.uid() = user_id);

-- diary_entries: 본인 행 전체 CRUD (검토·재작성 지원)
create policy "diary_entries_select_own" on public.diary_entries
  for select using (auth.uid() = user_id);
create policy "diary_entries_insert_own" on public.diary_entries
  for insert with check (auth.uid() = user_id);
create policy "diary_entries_update_own" on public.diary_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "diary_entries_delete_own" on public.diary_entries
  for delete using (auth.uid() = user_id);

-- coupon: 조회만 허용, 값 변경은 handle_new_diary_entry 트리거(SECURITY DEFINER)를 통해서만 발생
create policy "coupon_select_own" on public.coupon
  for select using (auth.uid() = user_id);
