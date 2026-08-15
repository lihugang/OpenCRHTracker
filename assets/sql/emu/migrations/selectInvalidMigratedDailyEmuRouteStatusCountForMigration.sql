SELECT COUNT(*) AS invalid_count
FROM daily_emu_routes_migrated_status
WHERE status IS NULL
   OR typeof(status) != 'integer'
   OR status < 0
   OR status > 31;
