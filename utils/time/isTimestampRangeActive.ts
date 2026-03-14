function isValidTimestamp(timestamp: number | undefined) {
    return (
        typeof timestamp === 'number' &&
        Number.isFinite(timestamp) &&
        timestamp > 0
    );
}

export default function isTimestampRangeActive(
    startAt: number | undefined,
    endAt: number | undefined,
    currentUnixSeconds: number
) {
    const safeStartAt = isValidTimestamp(startAt) ? startAt : null;
    const safeEndAt = isValidTimestamp(endAt) ? endAt : null;

    if (!safeStartAt || !safeEndAt || !Number.isFinite(currentUnixSeconds)) {
        return false;
    }

    return safeStartAt <= currentUnixSeconds && currentUnixSeconds <= safeEndAt;
}
