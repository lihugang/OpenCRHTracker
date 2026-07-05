SELECT
    entry_key AS entryKey,
    refreshed_at AS refreshedAt,
    entry_json AS entryJson
FROM schedule_circulations
WHERE entry_key = ?;
