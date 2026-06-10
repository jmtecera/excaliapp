alter table public.excalidraw_rooms
  add column if not exists pomodoro_status text not null default 'idle'
    check (pomodoro_status in ('idle', 'running', 'paused')),
  add column if not exists pomodoro_ends_at timestamptz,
  add column if not exists pomodoro_remaining_seconds integer not null default 1500
    check (pomodoro_remaining_seconds between 0 and 1500),
  add column if not exists pomodoro_updated_at timestamptz not null default now();

create or replace function public.sync_excalidraw_room_with_timer(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  target_room public.excalidraw_rooms%rowtype;
begin
  result := public.sync_excalidraw_room(payload);

  if result is null or coalesce((result->>'pinRequired')::boolean, false) then
    return result;
  end if;

  select *
    into target_room
    from public.excalidraw_rooms
   where code = upper(payload->>'roomCode');

  return result || jsonb_build_object(
    'pomodoroStatus', target_room.pomodoro_status,
    'pomodoroEndsAt', case
      when target_room.pomodoro_ends_at is null then null
      else floor(extract(epoch from target_room.pomodoro_ends_at) * 1000)::bigint
    end,
    'pomodoroRemainingSeconds', case
      when target_room.pomodoro_status = 'running' then
        greatest(0, floor(extract(epoch from target_room.pomodoro_ends_at - now()))::integer)
      else target_room.pomodoro_remaining_seconds
    end,
    'pomodoroUpdatedAt', floor(extract(epoch from target_room.pomodoro_updated_at) * 1000)::bigint
  );
end;
$$;

create or replace function public.update_excalidraw_room_timer(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.excalidraw_rooms%rowtype;
  requested_action text := lower(trim(coalesce(payload->>'action', '')));
  remaining_seconds integer;
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

  if requested_action = 'start' then
    remaining_seconds := case
      when target_room.pomodoro_status = 'running' and target_room.pomodoro_ends_at > now() then
        greatest(1, floor(extract(epoch from target_room.pomodoro_ends_at - now()))::integer)
      when target_room.pomodoro_status = 'paused' and target_room.pomodoro_remaining_seconds > 0 then
        target_room.pomodoro_remaining_seconds
      else 1500
    end;

    update public.excalidraw_rooms
       set pomodoro_status = 'running',
           pomodoro_ends_at = now() + make_interval(secs => remaining_seconds),
           pomodoro_remaining_seconds = remaining_seconds,
           pomodoro_updated_at = now()
     where id = target_room.id
     returning * into target_room;
  elsif requested_action = 'pause' then
    remaining_seconds := case
      when target_room.pomodoro_status = 'running' and target_room.pomodoro_ends_at is not null then
        greatest(0, floor(extract(epoch from target_room.pomodoro_ends_at - now()))::integer)
      else target_room.pomodoro_remaining_seconds
    end;

    update public.excalidraw_rooms
       set pomodoro_status = case when remaining_seconds > 0 then 'paused' else 'idle' end,
           pomodoro_ends_at = null,
           pomodoro_remaining_seconds = remaining_seconds,
           pomodoro_updated_at = now()
     where id = target_room.id
     returning * into target_room;
  elsif requested_action = 'reset' then
    update public.excalidraw_rooms
       set pomodoro_status = 'idle',
           pomodoro_ends_at = null,
           pomodoro_remaining_seconds = 1500,
           pomodoro_updated_at = now()
     where id = target_room.id
     returning * into target_room;
  else
    raise exception 'Timer action must be start, pause, or reset.';
  end if;

  return jsonb_build_object(
    'roomCode', target_room.code,
    'pomodoroStatus', target_room.pomodoro_status,
    'pomodoroEndsAt', case
      when target_room.pomodoro_ends_at is null then null
      else floor(extract(epoch from target_room.pomodoro_ends_at) * 1000)::bigint
    end,
    'pomodoroRemainingSeconds', case
      when target_room.pomodoro_status = 'running' then
        greatest(0, floor(extract(epoch from target_room.pomodoro_ends_at - now()))::integer)
      else target_room.pomodoro_remaining_seconds
    end,
    'pomodoroUpdatedAt', floor(extract(epoch from target_room.pomodoro_updated_at) * 1000)::bigint
  );
end;
$$;

revoke all on function public.sync_excalidraw_room_with_timer(jsonb) from public, anon, authenticated;
revoke all on function public.update_excalidraw_room_timer(jsonb) from public, anon, authenticated;
grant execute on function public.sync_excalidraw_room_with_timer(jsonb) to service_role;
grant execute on function public.update_excalidraw_room_timer(jsonb) to service_role;

notify pgrst, 'reload schema';
