CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    executor VARCHAR(31) NOT NULL,
    arguments VARCHAR(511) NOT NULL,
    executionTime INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS executionTimeIndex ON tasks(executionTime);
