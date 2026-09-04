-- 감정↔지출 연결 인사이트: 판단 없이 관찰만 하는 카드이므로 기본 켜짐이지만,
-- 원치 않으면 끌 수 있고 관찰 주기·우선 관찰 감정도 사용자가 고를 수 있게 한다.
alter table public.persona
  add column if not exists insight_enabled boolean not null default true;

alter table public.persona
  add column if not exists insight_period text not null default 'week'
    check (insight_period in ('week', 'month'));

alter table public.persona
  add column if not exists insight_emotion_focus text;

comment on column public.persona.insight_enabled is '감정-소비 연결 인사이트 카드 표시 여부(기본 켜짐).';
comment on column public.persona.insight_period is '인사이트 관찰 주기: week(최근 7일) 또는 month(이번 달).';
comment on column public.persona.insight_emotion_focus is
  '우선적으로 관찰할 감정 키워드. null이면 해당 기간에 가장 많이 나온 감정을 자동으로 씀.';
