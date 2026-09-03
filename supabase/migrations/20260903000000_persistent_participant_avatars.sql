alter table public.excalidraw_participants
  add column if not exists avatar_hash text;

alter table public.excalidraw_participants
  drop constraint if exists excalidraw_participants_avatar_hash_check;

alter table public.excalidraw_participants
  add constraint excalidraw_participants_avatar_hash_check
  check (avatar_hash is null or avatar_hash ~ '^[a-f0-9]{32}$');

create index if not exists excalidraw_participants_room_seen_idx
  on public.excalidraw_participants (room_id, last_seen_at desc);

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
  member_avatar_hash text := nullif(lower(trim(coalesce(payload->>'avatarHash', ''))), '');
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

  insert into public.excalidraw_participants (
    room_id,
    client_id,
    name,
    email,
    avatar_hash,
    device
  )
  values (
    created_room.id,
    left(payload->>'clientId', 100),
    member_name,
    '',
    member_avatar_hash,
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
      'avatarHash', member_avatar_hash,
      'device', member_device,
      'lastSeenAt', floor(extract(epoch from now()) * 1000)::bigint
    ))
  );
end;
$$;

create or replace function public.sync_excalidraw_room(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.excalidraw_rooms%rowtype;
  board jsonb;
  board_id uuid;
  board_created_at timestamptz;
  board_updated_at timestamptz;
  board_last_opened_at timestamptz;
  incoming_name_updated_at timestamptz;
  member_name text := left(trim(coalesce(payload->>'memberName', '')), 60);
  member_avatar_hash text := nullif(lower(trim(coalesce(payload->>'avatarHash', ''))), '');
  member_device text := coalesce(nullif(payload->>'device', ''), 'desktop');
begin
  select *
    into target_room
    from public.excalidraw_rooms
   where code = upper(payload->>'roomCode')
   for update;

  if not found then
    return null;
  end if;

  if not public.excalidraw_room_has_access(target_room.id, payload->>'accessToken') then
    return jsonb_build_object(
      'roomCode', target_room.code,
      'pinEnabled', true,
      'pinRequired', true
    );
  end if;

  if member_name = '' then
    raise exception 'A participant name is required.';
  end if;

  if member_device not in ('desktop', 'tablet', 'mobile') then
    member_device := 'desktop';
  end if;

  incoming_name_updated_at := to_timestamp(
    greatest(coalesce((payload->>'roomNameUpdatedAt')::double precision, 0), 0) / 1000
  );

  if nullif(trim(payload->>'roomName'), '') is not null
     and incoming_name_updated_at > target_room.updated_at then
    update public.excalidraw_rooms
       set name = left(trim(payload->>'roomName'), 80),
           updated_at = incoming_name_updated_at
     where id = target_room.id
     returning * into target_room;
  end if;

  for board in
    select value from jsonb_array_elements(coalesce(payload->'boards', '[]'::jsonb))
  loop
    begin
      board_id := (board->>'id')::uuid;
      board_created_at := to_timestamp(greatest(coalesce((board->>'createdAt')::double precision, 1), 1) / 1000);
      board_updated_at := to_timestamp(greatest(coalesce((board->>'updatedAt')::double precision, 1), 1) / 1000);
      board_last_opened_at := to_timestamp(
        greatest(coalesce((board->>'lastOpenedAt')::double precision, (board->>'updatedAt')::double precision, 0), 1) / 1000
      );

      if nullif(trim(board->>'name'), '') is null
         or nullif(trim(board->>'excalidrawUrl'), '') is null then
        continue;
      end if;

      insert into public.excalidraw_boards (
        room_id,
        id,
        name,
        excalidraw_url,
        archived,
        created_at,
        updated_at,
        last_opened_at
      )
      values (
        target_room.id,
        board_id,
        left(trim(board->>'name'), 80),
        board->>'excalidrawUrl',
        coalesce((board->>'archived')::boolean, false),
        board_created_at,
        board_updated_at,
        board_last_opened_at
      )
      on conflict (room_id, id) do update
        set name = excluded.name,
            excalidraw_url = excluded.excalidraw_url,
            archived = excluded.archived,
            updated_at = excluded.updated_at,
            last_opened_at = greatest(excluded.last_opened_at, public.excalidraw_boards.last_opened_at)
      where excluded.updated_at > public.excalidraw_boards.updated_at
         or excluded.last_opened_at > public.excalidraw_boards.last_opened_at;
    exception when others then
      continue;
    end;
  end loop;

  insert into public.excalidraw_participants (
    room_id,
    client_id,
    name,
    email,
    avatar_hash,
    device,
    last_seen_at
  )
  values (
    target_room.id,
    left(payload->>'clientId', 100),
    member_name,
    '',
    member_avatar_hash,
    member_device,
    now()
  )
  on conflict (room_id, client_id) do update
    set name = excluded.name,
        email = excluded.email,
        avatar_hash = coalesce(excluded.avatar_hash, public.excalidraw_participants.avatar_hash),
        device = excluded.device,
        last_seen_at = excluded.last_seen_at;

  delete from public.excalidraw_participants
   where room_id = target_room.id
     and last_seen_at < now() - interval '1 day';

  select * into target_room from public.excalidraw_rooms where id = target_room.id;

  return jsonb_build_object(
    'roomId', target_room.id,
    'roomCode', target_room.code,
    'roomName', target_room.name,
    'roomNameUpdatedAt', floor(extract(epoch from target_room.updated_at) * 1000)::bigint,
    'pinEnabled', target_room.pin_hash is not null,
    'boards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'excalidrawUrl', b.excalidraw_url,
        'archived', b.archived,
        'createdAt', floor(extract(epoch from b.created_at) * 1000)::bigint,
        'updatedAt', floor(extract(epoch from b.updated_at) * 1000)::bigint,
        'lastOpenedAt', floor(extract(epoch from b.last_opened_at) * 1000)::bigint
      ) order by b.last_opened_at desc, b.updated_at desc)
      from public.excalidraw_boards b
      where b.room_id = target_room.id
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clientId', p.client_id,
        'name', p.name,
        'avatarHash', p.avatar_hash,
        'device', p.device,
        'lastSeenAt', floor(extract(epoch from p.last_seen_at) * 1000)::bigint
      ) order by p.last_seen_at desc)
      from public.excalidraw_participants p
      where p.room_id = target_room.id
        and p.last_seen_at >= now() - interval '90 seconds'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_excalidraw_room(jsonb) from public, anon, authenticated;
revoke all on function public.sync_excalidraw_room(jsonb) from public, anon, authenticated;
grant execute on function public.create_excalidraw_room(jsonb) to service_role;
grant execute on function public.sync_excalidraw_room(jsonb) to service_role;

notify pgrst, 'reload schema';

create or replace function public.join_excalidraw_room(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.excalidraw_rooms%rowtype;
  member_name text := left(trim(coalesce(payload->>'memberName', '')), 60);
  member_avatar_hash text := nullif(lower(trim(coalesce(payload->>'avatarHash', ''))), '');
  member_device text := coalesce(nullif(payload->>'device', ''), 'desktop');
begin
  select *
    into target_room
    from public.excalidraw_rooms
   where code = upper(payload->>'roomCode');

  if not found then
    return null;
  end if;

  if not public.excalidraw_room_has_access(target_room.id, payload->>'accessToken') then
    return jsonb_build_object(
      'roomCode', target_room.code,
      'pinEnabled', true,
      'pinRequired', true
    );
  end if;

  if member_name = '' then
    raise exception 'A participant name is required.';
  end if;

  if member_device not in ('desktop', 'tablet', 'mobile') then
    member_device := 'desktop';
  end if;

  insert into public.excalidraw_participants (
    room_id,
    client_id,
    name,
    email,
    avatar_hash,
    device,
    last_seen_at
  )
  values (
    target_room.id,
    left(payload->>'clientId', 100),
    member_name,
    '',
    member_avatar_hash,
    member_device,
    now()
  )
  on conflict (room_id, client_id) do update
    set name = excluded.name,
        email = excluded.email,
        avatar_hash = coalesce(excluded.avatar_hash, public.excalidraw_participants.avatar_hash),
        device = excluded.device,
        last_seen_at = excluded.last_seen_at;

  return jsonb_build_object(
    'roomId', target_room.id,
    'roomCode', target_room.code,
    'roomName', target_room.name,
    'roomNameUpdatedAt', floor(extract(epoch from target_room.updated_at) * 1000)::bigint,
    'pinEnabled', target_room.pin_hash is not null,
    'boards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'excalidrawUrl', b.excalidraw_url,
        'archived', b.archived,
        'createdAt', floor(extract(epoch from b.created_at) * 1000)::bigint,
        'updatedAt', floor(extract(epoch from b.updated_at) * 1000)::bigint,
        'lastOpenedAt', floor(extract(epoch from b.last_opened_at) * 1000)::bigint
      ) order by b.last_opened_at desc, b.updated_at desc)
      from public.excalidraw_boards b
      where b.room_id = target_room.id
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clientId', p.client_id,
        'name', p.name,
        'avatarHash', p.avatar_hash,
        'device', p.device,
        'lastSeenAt', floor(extract(epoch from p.last_seen_at) * 1000)::bigint
      ) order by p.last_seen_at desc)
      from public.excalidraw_participants p
      where p.room_id = target_room.id
        and p.last_seen_at >= now() - interval '90 seconds'
    ), '[]'::jsonb),
    'pomodoroStatus', target_room.pomodoro_status,
    'pomodoroDurationSeconds', target_room.pomodoro_duration_seconds,
    'pomodoroEndsAt', case
      when target_room.pomodoro_ends_at is null then null
      else floor(extract(epoch from target_room.pomodoro_ends_at) * 1000)::bigint
    end,
    'pomodoroStartedAt', case
      when target_room.pomodoro_started_at is null then null
      else floor(extract(epoch from target_room.pomodoro_started_at) * 1000)::bigint
    end,
    'pomodoroRemainingSeconds', case
      when target_room.pomodoro_status = 'running' then
        greatest(0, ceil(extract(epoch from target_room.pomodoro_ends_at - now()))::integer)
      else target_room.pomodoro_remaining_seconds
    end,
    'pomodoroAccumulatedSeconds', target_room.pomodoro_accumulated_seconds,
    'pomodoroUpdatedAt', floor(extract(epoch from target_room.pomodoro_updated_at) * 1000)::bigint
  );
end;
$$;

revoke all on function public.join_excalidraw_room(jsonb) from public, anon, authenticated;
grant execute on function public.join_excalidraw_room(jsonb) to service_role;

notify pgrst, 'reload schema';
