import type { NotificationPayload } from '~/types/notifications';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';

export function buildTrainStatusUpdatedNotification(
    trainCode: string,
    startAt: number,
    emuCodes: string[]
): NotificationPayload {
    const [primaryEmuCode = '', coupledEmuCode = ''] =
        uniqueNormalizedCodes(emuCodes);

    const body = primaryEmuCode
        ? coupledEmuCode
            ? `今日 ${trainCode} 次列车由 ${primaryEmuCode}（车组号），重联 ${coupledEmuCode} 担当`
            : `今日 ${trainCode} 次列车由 ${primaryEmuCode}（车组号）担当`
        : `今日 ${trainCode} 次列车担当信息已更新`;

    return {
        title: `${trainCode} 次列车 | Open CRH Tracker`,
        body,
        url: `/train/${encodeURIComponent(trainCode)}`,
        tag: `ocrh:train:${encodeURIComponent(trainCode)}:${startAt}`
    };
}
