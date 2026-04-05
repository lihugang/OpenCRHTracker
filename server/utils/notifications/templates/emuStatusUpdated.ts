import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import type { NotificationPayload } from '~/types/notifications';

export function buildEmuStatusUpdatedNotification(
    emuCode: string,
    startAt: number,
    trainCodes: string[]
): NotificationPayload {
    const trainCodeText = uniqueNormalizedCodes(trainCodes).join(' / ');
    const body = trainCodeText
        ? `今日 ${emuCode}（车组号）担当 ${trainCodeText} 次列车`
        : `今日 ${emuCode}（车组号）运用信息已更新`;

    return {
        title: `${emuCode}（车组号）运用情况 | Open CRH Tracker`,
        body,
        url: `/emu/${encodeURIComponent(emuCode)}`,
        tag: `ocrh:emu:${encodeURIComponent(emuCode)}:${startAt}`
    };
}
