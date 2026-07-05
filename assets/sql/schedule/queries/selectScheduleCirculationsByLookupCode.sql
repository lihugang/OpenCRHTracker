SELECT DISTINCT
    circulations.entry_key AS entryKey,
    circulations.refreshed_at AS refreshedAt,
    circulations.entry_json AS entryJson
FROM schedule_circulations circulations
LEFT JOIN schedule_circulation_lookups lookups
ON lookups.entry_key = circulations.entry_key
WHERE circulations.entry_key = ?
OR lookups.lookup_code = ?
ORDER BY circulations.refreshed_at DESC, circulations.entry_key ASC;
