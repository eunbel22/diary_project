alter table public.persona
  add column if not exists diary_format text not null default 'paragraph'
    check (diary_format in ('paragraph', 'list'));

comment on column public.persona.diary_format is
  '다이어리 생성 형식 선호. paragraph(문단형, 기본) 또는 list(짧은 불렛 목록형).';
