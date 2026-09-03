-- 캐릭터 이미지 저장용 Storage 버킷 및 정책.
-- 경로 규칙: persona-images/<user_id>/character.png

insert into storage.buckets (id, name, public)
values ('persona-images', 'persona-images', true)
on conflict (id) do nothing;

create policy "persona_images_public_read" on storage.objects
  for select using (bucket_id = 'persona-images');

create policy "persona_images_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'persona-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "persona_images_owner_update" on storage.objects
  for update using (
    bucket_id = 'persona-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "persona_images_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'persona-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
