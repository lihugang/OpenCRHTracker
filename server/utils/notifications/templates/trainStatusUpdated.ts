import type { NotificationPayload } from '~/types/notifications';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import {
    formatNotificationRouteSummary,
    resolveNotificationRouteSummaryByTrainCode
} from '~/server/utils/notifications/templates/routeSummary';

export function buildTrainStatusUpdatedNotification(
    trainCode: string,
    startAt: number,
    emuCodes: string[]
): NotificationPayload {
    const [primaryEmuCode = '', coupledEmuCode = ''] =
        uniqueNormalizedCodes(emuCodes);
    const routeSummaryText = formatNotificationRouteSummary(
        resolveNotificationRouteSummaryByTrainCode(trainCode, startAt)
    );

    const body = primaryEmuCode
        ? coupledEmuCode
            ? routeSummaryText
                ? `今日 ${trainCode} 次列车由 ${primaryEmuCode} 重联 ${coupledEmuCode} 担当，${routeSummaryText}`
                : `今日 ${trainCode} 次列车由 ${primaryEmuCode} 重联 ${coupledEmuCode} 担当`
            : routeSummaryText
              ? `今日 ${trainCode} 次列车由 ${primaryEmuCode} 担当，${routeSummaryText}`
              : `今日 ${trainCode} 次列车由 ${primaryEmuCode} 担当`
        : `今日 ${trainCode} 次列车担当信息已更新`;

    return {
        title: `${trainCode} 次列车 | Open CRH Tracker`,
        body,
        url: `/train/${encodeURIComponent(trainCode)}`,
        tag: `ocrh:train:${encodeURIComponent(trainCode)}:${startAt}`
    };
}
