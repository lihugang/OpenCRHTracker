import { getTodayScheduleCache } from '~/server/services/todayScheduleCache';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import formatShanghaiTime from '~/utils/time/formatShanghaiTime';

export interface NotificationRouteSummary {
    startStation: string;
    endStation: string;
    startTimeText: string;
    endTimeText: string;
}

function toRouteSummary(
    startStation: string,
    endStation: string,
    startAt: number,
    endAt: number
): NotificationRouteSummary | null {
    const normalizedStartStation = startStation.trim();
    const normalizedEndStation = endStation.trim();
    const startTimeText = formatShanghaiTime(startAt);
    const endTimeText = formatShanghaiTime(endAt);

    if (
        normalizedStartStation.length === 0 ||
        normalizedEndStation.length === 0 ||
        startTimeText.length === 0 ||
        endTimeText.length === 0
    ) {
        return null;
    }

    return {
        startStation: normalizedStartStation,
        endStation: normalizedEndStation,
        startTimeText,
        endTimeText
    };
}

export function resolveNotificationRouteSummaryByTrainCode(
    trainCode: string,
    startAt: number
): NotificationRouteSummary | null {
    const normalizedTrainCode = normalizeCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return null;
    }

    const route = getTodayScheduleCache().get(normalizedTrainCode) ?? null;
    if (!route || route.startAt !== startAt) {
        return null;
    }

    return toRouteSummary(
        route.startStation,
        route.endStation,
        route.startAt,
        route.endAt
    );
}

export function resolveNotificationRouteSummaryByTrainCodes(
    trainCodes: string[],
    startAt: number
): NotificationRouteSummary | null {
    for (const trainCode of uniqueNormalizedCodes(trainCodes)) {
        const summary = resolveNotificationRouteSummaryByTrainCode(
            trainCode,
            startAt
        );
        if (summary) {
            return summary;
        }
    }

    return null;
}

export function formatNotificationRouteSummary(
    summary: NotificationRouteSummary | null
) {
    if (!summary) {
        return '';
    }

    return `${summary.startStation} ${summary.startTimeText} 开，${summary.endStation} ${summary.endTimeText} 到`;
}
