DELETE FROM schedule_route_refresh_queue
WHERE service_date = ?
AND train_code = ?;
