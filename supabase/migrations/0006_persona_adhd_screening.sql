alter table public.persona
  add column if not exists adhd_screening_result text
    check (adhd_screening_result in ('suspected', 'not_suspected'));

alter table public.persona
  add column if not exists adhd_screening_completed_at timestamptz;

comment on column public.persona.adhd_screening_result is
  '온보딩 때 자가 문항(ASRS 기반)에 답한 결과. 건너뛰면 null. 정식 진단이 아닌 참고용 자가 점검.';
