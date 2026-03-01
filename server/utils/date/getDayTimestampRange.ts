import parseDateAsTimestamp from '~/server/utils/date/parseDateAsTimestamp';

export default function getDayTimestampRange(date: string): {
    startAt: number;
    endAt: number;
} {
    const startAt = parseDateAsTimestamp(date);
    return {
        startAt,
        endAt: startAt + 24 * 60 * 60 - 1
    };
}
