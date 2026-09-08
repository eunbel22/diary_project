-- 지출 충동 일시정지: 가격이 없어도 "왜 사고 싶은지" 이유를 같이 말했다면 그 이유만으로도
-- 대기열에 넣을 수 있게 이유 컬럼을 추가한다. (가격도 이유도 없으면 여전히 반응하지 않는다.)
alter table public.purchase_pause
  add column if not exists reason text;

comment on column public.purchase_pause.reason is '가격 대신(또는 함께) 반응 조건이 되는, 사용자가 말한 구매 이유.';
