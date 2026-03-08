SELECT id, executor, arguments, executionTime, isIdle, expectedDurationMs
FROM tasks
WHERE executor = ?
ORDER BY executionTime ASC, id ASC
