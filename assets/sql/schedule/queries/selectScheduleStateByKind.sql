SELECT
    kind,
    date,
    status,
    phase,
    generated_at AS generatedAt,
    started_at_ms AS startedAtMs,
    unique_items AS uniqueItems,
    usable_timetable_count AS usableTimetableCount,
    state_json AS stateJson,
    updated_at AS updatedAt
FROM schedule_states
WHERE kind = ?;
