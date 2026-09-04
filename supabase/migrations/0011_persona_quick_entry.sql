-- 홈 화면 바로가기(딥링크)로 들어왔을 때 텍스트/음성 중 어떤 모드로 바로 진입할지
-- 사용자가 고를 수 있게 한다. 바로가기 자체의 라벨 문구 커스터마이징은
-- PWA manifest가 모든 사용자가 공유하는 정적 파일이라 보류(대기 항목).
alter table public.persona
  add column if not exists quick_entry_mode text not null default 'text'
    check (quick_entry_mode in ('text', 'voice'));

comment on column public.persona.quick_entry_mode is
  '홈 화면 바로가기로 진입했을 때 기본으로 열릴 입력 모드(text 또는 voice).';
