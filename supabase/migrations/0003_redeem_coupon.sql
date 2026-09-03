-- 쿠폰 사용(redeem) 함수.
-- coupon 테이블은 클라이언트가 직접 쓰지 못하도록 SELECT 정책만 있으므로(0001 마이그레이션),
-- 캐릭터 교체 쿠폰을 "사용"하는 행위도 클라이언트가 UPDATE로 직접 값을 조작하지 못하게 하고,
-- 본인 소유 행에 사용 가능한 쿠폰이 있을 때만 원자적으로 1개 차감하는 이 함수를 통해서만 허용한다.
create or replace function public.redeem_coupon()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_count integer;
begin
  update public.coupon
  set coupons_available = coupons_available - 1,
      used_at = now()
  where user_id = auth.uid()
    and coupons_available > 0;

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

grant execute on function public.redeem_coupon() to authenticated;
