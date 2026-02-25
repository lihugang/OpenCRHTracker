CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    executor VARCHAR(31) NOT NULL,
    arguments VARCHAR(511) NOT NULL,
    executionTime INTEGER NOT NULL,
    isIdle INTEGER NOT NULL DEFAULT 0 CHECK (isIdle IN (0, 1))
);

CREATE INDEX IF NOT EXISTS executionTimeIndex ON tasks(executionTime);
CREATE INDEX IF NOT EXISTS idleExecutionTimeIndex ON tasks(isIdle, executionTime, id);
