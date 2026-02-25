SELECT id, executor, arguments, executionTime
FROM tasks
WHERE executionTime <= ?
ORDER BY executionTime ASC, id ASC
