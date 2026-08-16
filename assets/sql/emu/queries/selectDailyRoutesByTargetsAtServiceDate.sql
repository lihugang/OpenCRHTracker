WITH requested_train_codes AS (
    SELECT
        json_extract(value, '$.prefix') AS train_prefix,
        CAST(json_extract(value, '$.number') AS INTEGER) AS train_number
    FROM json_each(?)
),
requested_emu_ids AS (
    SELECT CAST(value AS INTEGER) AS emu_id
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
WHERE route.service_date = ?

UNION

SELECT
    route.id,
    route.train_prefix,
    route.train_number,
    route.emu_id,
    route.service_date,
    route.timetable_id,
    route.status
FROM daily_emu_routes AS route
INNER JOIN requested_emu_ids AS requested
    ON requested.emu_id = route.emu_id
WHERE route.service_date = ?
ORDER BY route.id ASC;
