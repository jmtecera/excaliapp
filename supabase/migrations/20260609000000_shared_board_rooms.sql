create extension if not exists pgcrypto;

create table if not exists public.excalidraw_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{3}-[A-Z]{3}$'),
  name text not null default 'Untitled room' check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.excalidraw_boards (
  room_id uuid not null references public.excalidraw_rooms(id) on delete cascade,
  id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  excalidraw_url text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, id)
);

create index if not exists excalidraw_boards_room_archived_updated_idx
  on public.excalidraw_boards (room_id, archived, updated_at desc);

create table if not exists public.excalidraw_participants (
  room_id uuid not null references public.excalidraw_rooms(id) on delete cascade,
  client_id text not null,
  name text not null check (char_length(name) between 1 and 60),
  email text not null default '',
  device text not null default 'desktop' check (device in ('desktop', 'tablet', 'mobile')),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, client_id)
);

alter table public.excalidraw_rooms enable row level security;
alter table public.excalidraw_boards enable row level security;
alter table public.excalidraw_participants enable row level security;

create or replace function public.create_excalidraw_room(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  generated_code text;
  created_room public.excalidraw_rooms%rowtype;
  attempt integer := 0;
  member_name text := left(trim(coalesce(payload->>'memberName', '')), 60);
  member_email text := left(lower(trim(coalesce(payload->>'memberEmail', ''))), 254);
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
      substr(alphabet, floor(random() * 26)::integer + 1, 1) ||
      substr(alphabet, floor(random() * 26)::integer + 1, 1) ||
      substr(alphabet, floor(random() * 26)::integer + 1, 1) || '-' ||
      substr(alphabet, floor(random() * 26)::integer + 1, 1) ||
      substr(alphabet, floor(random() * 26)::integer + 1, 1) ||
      substr(alphabet, floor(random() * 26)::integer + 1, 1);

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
    member_email,
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
      'email', member_email,
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
        updated_at
      )
      values (
        target_room.id,
        board_id,
        left(trim(board->>'name'), 80),
        board->>'excalidrawUrl',
        coalesce((board->>'archived')::boolean, false),
        board_created_at,
        board_updated_at
      )
      on conflict (room_id, id) do update
        set name = excluded.name,
            excalidraw_url = excluded.excalidraw_url,
            archived = excluded.archived,
            updated_at = excluded.updated_at
      where excluded.updated_at >= public.excalidraw_boards.updated_at;
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
    'boards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'excalidrawUrl', b.excalidraw_url,
        'archived', b.archived,
        'createdAt', floor(extract(epoch from b.created_at) * 1000)::bigint,
        'updatedAt', floor(extract(epoch from b.updated_at) * 1000)::bigint
      ) order by b.updated_at desc)
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

revoke all on function public.create_excalidraw_room(jsonb) from public, anon, authenticated;
revoke all on function public.sync_excalidraw_room(jsonb) from public, anon, authenticated;
grant execute on function public.create_excalidraw_room(jsonb) to service_role;
grant execute on function public.sync_excalidraw_room(jsonb) to service_role;
