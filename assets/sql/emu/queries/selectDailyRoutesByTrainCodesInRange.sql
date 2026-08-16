WITH requested_train_codes AS (
    SELECT
        json_extract(value, '$.prefix') AS train_prefix,
        CAST(json_extract(value, '$.number') AS INTEGER) AS train_number
    FROM json_each(?)
)
SELECT
    route.id,
    route.train_prefix,
    route.train_number,
    route.emu_id,
    route.service_date,
    route.timetable_id,
    route.status
FROM daily_emu_routes AS route
INNER JOIN requested_train_codes AS requested
    ON requested.train_prefix = route.train_prefix
    AND requested.train_number = route.train_number
WHERE route.service_date >= ?
  AND route.service_date <= ?
ORDER BY route.service_date ASC, route.id ASC;
