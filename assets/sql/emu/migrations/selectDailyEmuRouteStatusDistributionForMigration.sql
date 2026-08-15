SELECT status, COUNT(*) AS row_count
FROM daily_emu_routes
GROUP BY status
ORDER BY status ASC;
