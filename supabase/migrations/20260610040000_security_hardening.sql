alter table public.excalidraw_rooms
  drop constraint if exists excalidraw_rooms_code_check;

alter table public.excalidraw_rooms
  add constraint excalidraw_rooms_code_check
  check (code ~ '^[A-Z0-9]{3}-[A-Z0-9]{3}$');

update public.excalidraw_participants
   set email = ''
 where email <> '';

create table if not exists public.excalidraw_pin_attempts (
  room_id uuid not null references public.excalidraw_rooms(id) on delete cascade,
  attempt_key text not null check (attempt_key ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  primary key (room_id, attempt_key)
);

alter table public.excalidraw_pin_attempts enable row level security;

create index if not exists excalidraw_pin_attempts_cleanup_idx
  on public.excalidraw_pin_attempts (window_started_at);

create or replace function public.create_excalidraw_room(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  generated_code text;
  created_room public.excalidraw_rooms%rowtype;
  attempt integer := 0;
  member_name text := left(trim(coalesce(payload->>'memberName', '')), 60);
  member_device text := coalesce(nullif(payload->>'device', ''), 'desktop');
begin
  if member_name = '' then
    raise exception 'A participant name is required.';
  end if;

  if member_device not in ('desktop', 'tablet', 'mobile') then
    member_device := 'desktop';
  end if;

  loop
    attempt := attempt + 1;
    generated_code :=
      substr(alphabet, floor(random() * char_length(alphabet))::integer + 1, 1) ||
      substr(alphabet, floor(random() * char_length(alphabet))::integer + 1, 1) ||
      substr(alphabet, floor(random() * char_length(alphabet))::integer + 1, 1) || '-' ||
      substr(alphabet, floor(random() * char_length(alphabet))::integer + 1, 1) ||
      substr(alphabet, floor(random() * char_length(alphabet))::integer + 1, 1) ||
      substr(alphabet, floor(random() * char_length(alphabet))::integer + 1, 1);

    begin
      insert into public.excalidraw_rooms (code, name)
      values (
        generated_code,
        left(coalesce(nullif(trim(payload->>'roomName'), ''), 'Untitled room'), 80)
      )
      returning * into created_room;
      exit;
    exception when unique_violation then
      if attempt >= 32 then
        raise exception 'Could not allocate a unique room code.';
      end if;
    end;
  end loop;

  insert into public.excalidraw_participants (room_id, client_id, name, email, device)
  values (
    created_room.id,
    left(payload->>'clientId', 100),
    member_name,
    '',
    member_device
  );

  return jsonb_build_object(
    'roomId', created_room.id,
    'roomCode', created_room.code,
    'roomName', created_room.name,
    'roomNameUpdatedAt', floor(extract(epoch from created_room.updated_at) * 1000)::bigint,
    'boards', '[]'::jsonb,
    'members', jsonb_build_array(jsonb_build_object(
      'clientId', payload->>'clientId',
      'name', member_name,
      'device', member_device,
      'lastSeenAt', floor(extract(epoch from now()) * 1000)::bigint
    ))
  );
end;
$$;

create or replace function public.authorize_excalidraw_room(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_room public.excalidraw_rooms%rowtype;
  supplied_pin text := trim(coalesce(payload->>'pin', ''));
  supplied_attempt_key text := lower(trim(coalesce(payload->>'attemptKey', '')));
  access_token text;
  attempt_record public.excalidraw_pin_attempts%rowtype;
  retry_after_seconds integer;
begin
  select *
    into target_room
    from public.excalidraw_rooms
   where code = upper(payload->>'roomCode');

  if not found then
    return null;
  end if;

  if target_room.pin_hash is null then
    return jsonb_build_object('pinEnabled', false, 'accessToken', '');
  end if;

  if supplied_pin !~ '^[0-9]{4}$' or supplied_attempt_key !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('authorizationFailed', true);
  end if;

  select *
    into attempt_record
    from public.excalidraw_pin_attempts
   where room_id = target_room.id
     and attempt_key = supplied_attempt_key
   for update;

  if found and attempt_record.blocked_until > now() then
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from attempt_record.blocked_until - now()))::integer
    );
    return jsonb_build_object(
      'authorizationFailed', true,
      'retryAfterSeconds', retry_after_seconds
    );
  end if;

  if extensions.crypt(supplied_pin, target_room.pin_hash) <> target_room.pin_hash then
    insert into public.excalidraw_pin_attempts (
      room_id,
      attempt_key,
      attempts,
      window_started_at,
      blocked_until
    )
    values (
      target_room.id,
      supplied_attempt_key,
      1,
      now(),
      null
    )
    on conflict (room_id, attempt_key) do update
      set attempts = case
            when public.excalidraw_pin_attempts.window_started_at < now() - interval '15 minutes'
              then 1
            else public.excalidraw_pin_attempts.attempts + 1
          end,
          window_started_at = case
            when public.excalidraw_pin_attempts.window_started_at < now() - interval '15 minutes'
              then now()
            else public.excalidraw_pin_attempts.window_started_at
          end,
          blocked_until = case
            when (
              case
                when public.excalidraw_pin_attempts.window_started_at < now() - interval '15 minutes'
                  then 1
                else public.excalidraw_pin_attempts.attempts + 1
              end
            ) >= 5
              then now() + interval '15 minutes'
            else null
          end
    returning * into attempt_record;

    if attempt_record.blocked_until > now() then
      retry_after_seconds := greatest(
        1,
        ceil(extract(epoch from attempt_record.blocked_until - now()))::integer
      );
      return jsonb_build_object(
        'authorizationFailed', true,
        'retryAfterSeconds', retry_after_seconds
      );
    end if;

    return jsonb_build_object('authorizationFailed', true);
  end if;

  delete from public.excalidraw_pin_attempts
   where room_id = target_room.id
     and attempt_key = supplied_attempt_key;

  delete from public.excalidraw_pin_attempts
   where window_started_at < now() - interval '1 day';

  access_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.excalidraw_room_access (room_id, token_hash)
  values (target_room.id, extensions.digest(access_token, 'sha256'));

  delete from public.excalidraw_room_access
   where room_id = target_room.id
     and expires_at <= now();

  return jsonb_build_object('pinEnabled', true, 'accessToken', access_token);
end;
$$;

revoke all on table public.excalidraw_pin_attempts from public, anon, authenticated;
revoke all on function public.create_excalidraw_room(jsonb) from public, anon, authenticated;
revoke all on function public.authorize_excalidraw_room(jsonb) from public, anon, authenticated;
grant execute on function public.create_excalidraw_room(jsonb) to service_role;
grant execute on function public.authorize_excalidraw_room(jsonb) to service_role;

notify pgrst, 'reload schema';
