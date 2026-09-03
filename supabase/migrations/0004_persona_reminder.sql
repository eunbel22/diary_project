-- 리마인더 옵트인 상태. 기본값 false(꺼짐) — 온보딩 마지막에 1회만 부드럽게 제안하고,
-- 이후에도 사용자가 언제든 다시 켜고 끌 수 있다 (persona_update_own 정책으로 이미 허용됨).
alter table public.persona
  add column if not exists reminder_opt_in boolean not null default false;
