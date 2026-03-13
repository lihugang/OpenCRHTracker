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
    if (
        !isValidTimestamp(startAt) ||
        !isValidTimestamp(endAt) ||
        !Number.isFinite(currentUnixSeconds)
    ) {
        return false;
    }

    return startAt <= currentUnixSeconds && currentUnixSeconds <= endAt;
}
