create or replace function public.consume_excalidraw_room_creation_rate_limit(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_bucket_key text := lower(trim(coalesce(payload->>'bucketKey', '')));
  limit_count integer := case
    when coalesce(payload->>'limit', '') ~ '^[0-9]+$'
      then least((payload->>'limit')::numeric, 100)::integer
    else 5
  end;
  window_seconds integer := case
    when coalesce(payload->>'windowSeconds', '') ~ '^[0-9]+$'
      then least((payload->>'windowSeconds')::numeric, 86400)::integer
    else 3600
  end;
  rate_limit_record public.excalidraw_rate_limits%rowtype;
  retry_after_seconds integer := 0;
begin
  if request_bucket_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid rate limit bucket.';
  end if;

  limit_count := greatest(1, limit_count);
  window_seconds := greatest(60, window_seconds);

  insert into public.excalidraw_rate_limits (bucket_key, attempts, window_started_at)
  values (request_bucket_key, 1, now())
  on conflict (bucket_key) do update
    set attempts = case
          when public.excalidraw_rate_limits.window_started_at < now() - make_interval(secs => window_seconds)
            then 1
          else public.excalidraw_rate_limits.attempts + 1
        end,
        window_started_at = case
          when public.excalidraw_rate_limits.window_started_at < now() - make_interval(secs => window_seconds)
            then now()
          else public.excalidraw_rate_limits.window_started_at
        end
  returning * into rate_limit_record;

  if rate_limit_record.attempts > limit_count then
    retry_after_seconds := greatest(
      1,
      ceil(
        extract(
          epoch from rate_limit_record.window_started_at + make_interval(secs => window_seconds) - now()
        )
      )::integer
    );
  end if;

  delete from public.excalidraw_rate_limits
   where window_started_at < now() - interval '2 days';

  return jsonb_build_object(
    'allowed', rate_limit_record.attempts <= limit_count,
    'retryAfterSeconds', retry_after_seconds
  );
end;
$$;

revoke all on function public.consume_excalidraw_room_creation_rate_limit(jsonb)
  from public, anon, authenticated;
grant execute on function public.consume_excalidraw_room_creation_rate_limit(jsonb) to service_role;

notify pgrst, 'reload schema';
