create extension if not exists pgcrypto;

alter table public.excalidraw_rooms
  add column if not exists pin_hash text,
  add column if not exists pin_updated_at timestamptz;

alter table public.excalidraw_boards
  add column if not exists last_opened_at timestamptz not null default now();

create table if not exists public.excalidraw_room_access (
  room_id uuid not null references public.excalidraw_rooms(id) on delete cascade,
  token_hash bytea not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  primary key (room_id, token_hash)
);

alter table public.excalidraw_room_access enable row level security;

create index if not exists excalidraw_room_access_expiry_idx
  on public.excalidraw_room_access (room_id, expires_at);

create or replace function public.excalidraw_room_has_access(target_room_id uuid, access_token text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    not exists (
      select 1
        from public.excalidraw_rooms room
       where room.id = target_room_id
         and room.pin_hash is not null
    )
    or exists (
      select 1
        from public.excalidraw_room_access room_access
       where room_access.room_id = target_room_id
         and room_access.token_hash = extensions.digest(coalesce(access_token, ''), 'sha256')
         and room_access.expires_at > now()
    );
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
  access_token text;
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

  if supplied_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits.';
  end if;

  if extensions.crypt(supplied_pin, target_room.pin_hash) <> target_room.pin_hash then
    raise exception 'Incorrect room PIN.';
  end if;

  access_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.excalidraw_room_access (room_id, token_hash)
  values (target_room.id, extensions.digest(access_token, 'sha256'));

  delete from public.excalidraw_room_access
   where room_id = target_room.id
     and expires_at <= now();

  return jsonb_build_object('pinEnabled', true, 'accessToken', access_token);
end;
$$;

create or replace function public.update_excalidraw_room_pin(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_room public.excalidraw_rooms%rowtype;
  next_pin text := trim(coalesce(payload->>'pin', ''));
  access_token text;
begin
  select *
    into target_room
    from public.excalidraw_rooms
   where code = upper(payload->>'roomCode')
   for update;

  if not found then
    return null;
  end if;

  if target_room.pin_hash is not null
     and not public.excalidraw_room_has_access(target_room.id, payload->>'accessToken') then
    raise exception 'Room authorization has expired. Enter the PIN again.';
  end if;

  if next_pin = '' then
    update public.excalidraw_rooms
       set pin_hash = null,
           pin_updated_at = now(),
           updated_at = greatest(updated_at, now())
     where id = target_room.id;

    delete from public.excalidraw_room_access where room_id = target_room.id;
    return jsonb_build_object('pinEnabled', false, 'accessToken', '');
  end if;

  if next_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits.';
  end if;

  update public.excalidraw_rooms
     set pin_hash = extensions.crypt(next_pin, extensions.gen_salt('bf', 10)),
         pin_updated_at = now(),
         updated_at = greatest(updated_at, now())
   where id = target_room.id;

  delete from public.excalidraw_room_access where room_id = target_room.id;

  access_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.excalidraw_room_access (room_id, token_hash)
  values (target_room.id, extensions.digest(access_token, 'sha256'));

  return jsonb_build_object('pinEnabled', true, 'accessToken', access_token);
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
  member_email text := left(lower(trim(coalesce(payload->>'memberEmail', ''))), 254);
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
      board_created_at := to_timestamp(greatest(coalesce((board->>'createdAt')::double precision, 0), 1) / 1000);
      board_updated_at := to_timestamp(greatest(coalesce((board->>'updatedAt')::double precision, 0), 1) / 1000);
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

  insert into public.excalidraw_participants (room_id, client_id, name, email, device, last_seen_at)
  values (
    target_room.id,
    left(payload->>'clientId', 100),
    member_name,
    member_email,
    member_device,
    now()
  )
  on conflict (room_id, client_id) do update
    set name = excluded.name,
        email = excluded.email,
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
        'email', p.email,
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

create or replace function public.broadcast_excalidraw_room_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_room_id uuid;
begin
  changed_room_id := case when tg_table_name = 'excalidraw_rooms' then new.id else new.room_id end;

  begin
    perform realtime.send(
      jsonb_build_object('changedAt', floor(extract(epoch from now()) * 1000)::bigint),
      'changed',
      'room:' || changed_room_id::text,
      false
    );
  exception when undefined_function or invalid_schema_name then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists excalidraw_rooms_broadcast_change on public.excalidraw_rooms;
create trigger excalidraw_rooms_broadcast_change
after update on public.excalidraw_rooms
for each row execute function public.broadcast_excalidraw_room_change();

drop trigger if exists excalidraw_boards_broadcast_change on public.excalidraw_boards;
create trigger excalidraw_boards_broadcast_change
after insert or update on public.excalidraw_boards
for each row execute function public.broadcast_excalidraw_room_change();

revoke all on function public.excalidraw_room_has_access(uuid, text) from public, anon, authenticated;
revoke all on function public.authorize_excalidraw_room(jsonb) from public, anon, authenticated;
revoke all on function public.update_excalidraw_room_pin(jsonb) from public, anon, authenticated;
revoke all on function public.sync_excalidraw_room(jsonb) from public, anon, authenticated;
grant execute on function public.excalidraw_room_has_access(uuid, text) to service_role;
grant execute on function public.authorize_excalidraw_room(jsonb) to service_role;
grant execute on function public.update_excalidraw_room_pin(jsonb) to service_role;
grant execute on function public.sync_excalidraw_room(jsonb) to service_role;

notify pgrst, 'reload schema';
