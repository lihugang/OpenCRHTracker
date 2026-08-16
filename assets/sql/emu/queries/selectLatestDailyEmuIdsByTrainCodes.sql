WITH requested_train_codes AS (
    SELECT
        CAST(key AS INTEGER) AS request_index,
        json_extract(value, '$.prefix') AS train_prefix,
        CAST(json_extract(value, '$.number') AS INTEGER) AS train_number
    FROM json_each(?)
),
latest_route_ids AS (
    SELECT
        requested.request_index,
        0 AS record_rank,
        (
            SELECT route.id
            FROM daily_emu_routes AS route
            WHERE route.train_prefix = requested.train_prefix
              AND route.train_number = requested.train_number
            ORDER BY route.service_date DESC, route.id DESC
            LIMIT 1
        ) AS route_id
    FROM requested_train_codes AS requested

    UNION ALL

    SELECT
        requested.request_index,
        1 AS record_rank,
        (
            SELECT route.id
            FROM daily_emu_routes AS route
            WHERE route.train_prefix = requested.train_prefix
              AND route.train_number = requested.train_number
            ORDER BY route.service_date DESC, route.id DESC
            LIMIT 1 OFFSET 1
        ) AS route_id
    FROM requested_train_codes AS requested
)
SELECT route.train_prefix, route.train_number, route.emu_id
FROM latest_route_ids AS latest
INNER JOIN daily_emu_routes AS route ON route.id = latest.route_id
ORDER BY latest.request_index ASC, latest.record_rank ASC;
