INSERT INTO schedule_states (
    kind,
    date,
    status,
    phase,
    generated_at,
    started_at_ms,
    unique_items,
    usable_timetable_count,
    state_json,
    updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(kind) DO UPDATE SET
    date = excluded.date,
    status = excluded.status,
    phase = excluded.phase,
    generated_at = excluded.generated_at,
    started_at_ms = excluded.started_at_ms,
    unique_items = excluded.unique_items,
    usable_timetable_count = excluded.usable_timetable_count,
    state_json = excluded.state_json,
    updated_at = excluded.updated_at;
