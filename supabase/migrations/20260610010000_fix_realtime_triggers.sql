create or replace function public.broadcast_excalidraw_room_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('changedAt', floor(extract(epoch from now()) * 1000)::bigint),
      'changed',
      'room:' || new.id::text,
      false
    );
  exception when undefined_function or invalid_schema_name then
    null;
  end;

  return new;
end;
$$;

create or replace function public.broadcast_excalidraw_board_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('changedAt', floor(extract(epoch from now()) * 1000)::bigint),
      'changed',
      'room:' || new.room_id::text,
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
for each row execute function public.broadcast_excalidraw_board_change();
