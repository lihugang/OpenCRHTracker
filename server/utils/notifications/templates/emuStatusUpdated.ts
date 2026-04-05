import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import type { NotificationPayload } from '~/types/notifications';
import {
    formatNotificationRouteSummary,
    resolveNotificationRouteSummaryByTrainCodes
} from '~/server/utils/notifications/templates/routeSummary';

export function buildEmuStatusUpdatedNotification(
    emuCode: string,
    startAt: number,
    trainCodes: string[]
): NotificationPayload {
    const normalizedTrainCodes = uniqueNormalizedCodes(trainCodes);
    const trainCodeText = normalizedTrainCodes.join(' / ');
    const routeSummaryText = formatNotificationRouteSummary(
        resolveNotificationRouteSummaryByTrainCodes(
            normalizedTrainCodes,
            startAt
        )
    );
    const body = trainCodeText
        ? routeSummaryText
            ? `今日 ${emuCode} 担当 ${trainCodeText} 次列车，${routeSummaryText}`
            : `今日 ${emuCode} 担当 ${trainCodeText} 次列车`
        : `今日 ${emuCode} 运用信息已更新`;

    return {
        title: `${emuCode} 运用情况 | Open CRH Tracker`,
        body,
        url: `/emu/${encodeURIComponent(emuCode)}`,
        tag: `ocrh:emu:${encodeURIComponent(emuCode)}:${startAt}`
    };
}
