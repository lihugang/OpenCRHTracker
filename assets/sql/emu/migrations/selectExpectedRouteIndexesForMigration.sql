SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND tbl_name = 'daily_emu_routes'
  AND name IN (
      'idx_daily_emu_routes_train_emu_service_timetable_resolved',
      'idx_daily_emu_routes_train_emu_service_unresolved',
      'idx_daily_emu_routes_train_service',
      'idx_daily_emu_routes_emu_service',
      'idx_daily_emu_routes_service_id',
      'idx_daily_emu_routes_timetable_id'
  )
ORDER BY name ASC;
