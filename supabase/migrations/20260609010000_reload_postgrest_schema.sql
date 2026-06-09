-- PostgREST caches function signatures. Reload after creating or changing RPCs.
notify pgrst, 'reload schema';
