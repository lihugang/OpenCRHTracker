import type { TodayScheduleStationIndexRow } from '~/server/services/todayScheduleCache';

const FIVE_MINUTES_SECONDS = 5 * 60;
const TWO_MINUTES_SECONDS = 2 * 60;

export interface StationPlatformOccupation {
    row: TodayScheduleStationIndexRow;
    platformNo: number;
    startsAt: number;
    endsAt: number;
}

export interface StationPlatformOverlapPair {
    left: StationPlatformOccupation;
    right: StationPlatformOccupation;
}

export interface DetectStationPlatformOverlapsResult {
    validOccupationCount: number;
    skippedRowCount: number;
    platformCount: number;
    pairs: StationPlatformOverlapPair[];
}

function buildOccupation(
    row: TodayScheduleStationIndexRow
): StationPlatformOccupation | null {
    const platformNo = row.platformNo;
    if (
        typeof platformNo !== 'number' ||
        !Number.isInteger(platformNo) ||
        platformNo <= 0
    ) {
        return null;
    }

    let startsAt: number | null = null;
    let endsAt: number | null = null;

    if (row.isStart && row.isEnd) {
        const startCandidates = [
            row.departAt === null ? null : row.departAt - FIVE_MINUTES_SECONDS,
            row.arriveAt
        ].filter((value): value is number => value !== null);
        const endCandidates = [
            row.departAt,
            row.arriveAt === null ? null : row.arriveAt + FIVE_MINUTES_SECONDS
        ].filter((value): value is number => value !== null);
        if (startCandidates.length > 0 && endCandidates.length > 0) {
            startsAt = Math.min(...startCandidates);
            endsAt = Math.max(...endCandidates);
        }
    } else if (row.isStart) {
        if (row.departAt !== null) {
            startsAt = row.departAt - FIVE_MINUTES_SECONDS;
            endsAt = row.departAt;
        }
    } else if (row.isEnd) {
        if (row.arriveAt !== null) {
            startsAt = row.arriveAt;
            endsAt = row.arriveAt + FIVE_MINUTES_SECONDS;
        }
    } else if (row.arriveAt !== null && row.departAt !== null) {
        startsAt = row.arriveAt - TWO_MINUTES_SECONDS;
        endsAt = row.departAt + TWO_MINUTES_SECONDS;
    }

    if (startsAt === null || endsAt === null || endsAt < startsAt) {
        return null;
    }

    return {
        row,
        platformNo,
        startsAt,
        endsAt
    };
}

function buildPairKey(
    left: StationPlatformOccupation,
    right: StationPlatformOccupation
) {
    return [left.row.trainKey, right.row.trainKey].sort().join(':');
}

export function detectStationPlatformOverlaps(
    rows: readonly TodayScheduleStationIndexRow[]
): DetectStationPlatformOverlapsResult {
    const occupationsByPlatform = new Map<
        number,
        StationPlatformOccupation[]
    >();
    let skippedRowCount = 0;

    for (const row of rows) {
        const occupation = buildOccupation(row);
        if (!occupation) {
            skippedRowCount += 1;
            continue;
        }

        const occupations = occupationsByPlatform.get(occupation.platformNo);
        if (occupations) {
            occupations.push(occupation);
        } else {
            occupationsByPlatform.set(occupation.platformNo, [occupation]);
        }
    }

    const pairsByKey = new Map<string, StationPlatformOverlapPair>();
    for (const occupations of occupationsByPlatform.values()) {
        occupations.sort((left, right) => {
            if (left.startsAt !== right.startsAt) {
                return left.startsAt - right.startsAt;
            }
            if (left.endsAt !== right.endsAt) {
                return left.endsAt - right.endsAt;
            }
            return left.row.trainKey.localeCompare(right.row.trainKey);
        });

        for (
            let leftIndex = 0;
            leftIndex < occupations.length;
            leftIndex += 1
        ) {
            const left = occupations[leftIndex]!;
            for (
                let rightIndex = leftIndex + 1;
                rightIndex < occupations.length;
                rightIndex += 1
            ) {
                const right = occupations[rightIndex]!;
                if (right.startsAt > left.endsAt) {
                    break;
                }
                if (left.row.trainKey === right.row.trainKey) {
                    continue;
                }

                const pairKey = buildPairKey(left, right);
                if (!pairsByKey.has(pairKey)) {
                    pairsByKey.set(pairKey, { left, right });
                }
            }
        }
    }

    return {
        validOccupationCount: [...occupationsByPlatform.values()].reduce(
            (count, occupations) => count + occupations.length,
            0
        ),
        skippedRowCount,
        platformCount: occupationsByPlatform.size,
        pairs: [...pairsByKey.values()]
    };
}
