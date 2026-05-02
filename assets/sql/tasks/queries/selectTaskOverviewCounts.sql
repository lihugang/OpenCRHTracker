SELECT
    COUNT(*) AS remainingTotal,
    COALESCE(
        SUM(CASE WHEN executionTime <= ? THEN 1 ELSE 0 END),
        0
    ) AS remainingWithin10Minutes,
    COALESCE(
        SUM(CASE WHEN executionTime <= ? THEN 1 ELSE 0 END),
        0
    ) AS remainingWithin30Minutes,
    COALESCE(
        SUM(CASE WHEN executionTime <= ? THEN 1 ELSE 0 END),
        0
    ) AS remainingWithin1Hour
FROM tasks
