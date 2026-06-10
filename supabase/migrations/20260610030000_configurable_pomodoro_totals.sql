alter table public.excalidraw_rooms
  add column if not exists pomodoro_duration_seconds integer not null default 1500
    check (pomodoro_duration_seconds between 60 and 7200),
  add column if not exists pomodoro_started_at timestamptz,
  add column if not exists pomodoro_accumulated_seconds bigint not null default 0
    check (pomodoro_accumulated_seconds >= 0);

update public.excalidraw_rooms
   set pomodoro_started_at =
     pomodoro_ends_at - make_interval(secs => pomodoro_remaining_seconds)
 where pomodoro_status = 'running'
   and pomodoro_ends_at is not null
   and pomodoro_started_at is null;

alter table public.excalidraw_rooms
  drop constraint if exists excalidraw_rooms_pomodoro_remaining_seconds_check;

alter table public.excalidraw_rooms
  add constraint excalidraw_rooms_pomodoro_remaining_seconds_check
  check (pomodoro_remaining_seconds between 0 and 7200);

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

create or replace function public.update_excalidraw_room_timer(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.excalidraw_rooms%rowtype;
  requested_action text := lower(trim(coalesce(payload->>'action', '')));
  elapsed_seconds integer := 0;
  remaining_seconds integer;
  duration_seconds integer;
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

  if (
    target_room.pomodoro_status = 'running'
    and target_room.pomodoro_started_at is not null
  ) then
    elapsed_seconds := greatest(
      0,
      least(
        target_room.pomodoro_remaining_seconds,
        floor(
          extract(
            epoch from least(coalesce(target_room.pomodoro_ends_at, now()), now())
              - target_room.pomodoro_started_at
          )
        )::integer
      )
    );
  end if;

  remaining_seconds := greatest(0, target_room.pomodoro_remaining_seconds - elapsed_seconds);

  if requested_action = 'start' then
    if target_room.pomodoro_status = 'running' and target_room.pomodoro_ends_at > now() then
      null;
    else
      if target_room.pomodoro_status = 'paused' and target_room.pomodoro_remaining_seconds > 0 then
        remaining_seconds := target_room.pomodoro_remaining_seconds;
      else
        remaining_seconds := target_room.pomodoro_duration_seconds;
      end if;

      update public.excalidraw_rooms
         set pomodoro_status = 'running',
             pomodoro_ends_at = now() + make_interval(secs => remaining_seconds),
             pomodoro_started_at = now(),
             pomodoro_remaining_seconds = remaining_seconds,
             pomodoro_accumulated_seconds =
               target_room.pomodoro_accumulated_seconds + elapsed_seconds,
             pomodoro_updated_at = now()
       where id = target_room.id
       returning * into target_room;
    end if;
  elsif requested_action = 'pause' then
    update public.excalidraw_rooms
       set pomodoro_status = case when remaining_seconds > 0 then 'paused' else 'idle' end,
           pomodoro_ends_at = null,
           pomodoro_started_at = null,
           pomodoro_remaining_seconds = remaining_seconds,
           pomodoro_accumulated_seconds =
             target_room.pomodoro_accumulated_seconds + elapsed_seconds,
           pomodoro_updated_at = now()
     where id = target_room.id
     returning * into target_room;
  elsif requested_action = 'reset' then
    update public.excalidraw_rooms
       set pomodoro_status = 'idle',
           pomodoro_ends_at = null,
           pomodoro_started_at = null,
           pomodoro_remaining_seconds = target_room.pomodoro_duration_seconds,
           pomodoro_accumulated_seconds =
             target_room.pomodoro_accumulated_seconds + elapsed_seconds,
           pomodoro_updated_at = now()
     where id = target_room.id
     returning * into target_room;
  elsif requested_action = 'reset-total' then
    if target_room.pomodoro_status = 'running' and remaining_seconds > 0 then
      update public.excalidraw_rooms
         set pomodoro_ends_at = now() + make_interval(secs => remaining_seconds),
             pomodoro_started_at = now(),
             pomodoro_remaining_seconds = remaining_seconds,
             pomodoro_accumulated_seconds = 0,
             pomodoro_updated_at = now()
       where id = target_room.id
       returning * into target_room;
    elsif target_room.pomodoro_status = 'running' then
      update public.excalidraw_rooms
         set pomodoro_status = 'idle',
             pomodoro_ends_at = null,
             pomodoro_started_at = null,
             pomodoro_remaining_seconds = 0,
             pomodoro_accumulated_seconds = 0,
             pomodoro_updated_at = now()
       where id = target_room.id
       returning * into target_room;
    else
      update public.excalidraw_rooms
         set pomodoro_accumulated_seconds = 0,
             pomodoro_updated_at = now()
       where id = target_room.id
       returning * into target_room;
    end if;
  elsif requested_action = 'set-duration' then
    if coalesce(payload->>'durationMinutes', '') !~ '^[0-9]+$' then
      raise exception 'Timer duration must be a whole number of minutes.';
    end if;

    duration_seconds := (payload->>'durationMinutes')::integer * 60;

    if duration_seconds < 60 or duration_seconds > 7200 then
      raise exception 'Timer duration must be between 1 and 120 minutes.';
    end if;

    update public.excalidraw_rooms
       set pomodoro_status = 'idle',
           pomodoro_duration_seconds = duration_seconds,
           pomodoro_ends_at = null,
           pomodoro_started_at = null,
           pomodoro_remaining_seconds = duration_seconds,
           pomodoro_accumulated_seconds =
             target_room.pomodoro_accumulated_seconds + elapsed_seconds,
           pomodoro_updated_at = now()
     where id = target_room.id
     returning * into target_room;
  else
    raise exception 'Timer action must be start, pause, reset, reset-total, or set-duration.';
  end if;

  return jsonb_build_object(
    'roomCode', target_room.code,
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

revoke all on function public.sync_excalidraw_room_with_timer(jsonb) from public, anon, authenticated;
revoke all on function public.update_excalidraw_room_timer(jsonb) from public, anon, authenticated;
grant execute on function public.sync_excalidraw_room_with_timer(jsonb) to service_role;
grant execute on function public.update_excalidraw_room_timer(jsonb) to service_role;

notify pgrst, 'reload schema';
