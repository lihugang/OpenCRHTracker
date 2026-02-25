SELECT id, executor, arguments, executionTime, isIdle, expectedDurationMs
FROM tasks
WHERE isIdle = ?
  AND executionTime <= ?
ORDER BY executionTime ASC, id ASC
LIMIT ?
