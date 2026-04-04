import { ProbeStatusValue } from '~/server/services/probeStatusStore';
import type { NotificationPayload } from '~/types/notifications';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

function getProbeStatusLabel(status: ProbeStatusValue) {
    return status === ProbeStatusValue.CoupledFormationResolved
        ? '重联'
        : '单编组';
}

export function buildEmuStatusUpdatedNotification(
    emuCode: string,
    startAt: number,
    status: ProbeStatusValue
): NotificationPayload {
    const formattedStartAt = formatTrackerTimestamp(startAt);
    const statusLabel = getProbeStatusLabel(status);

    return {
        title: `车组 ${emuCode} 已更新`,
        body: formattedStartAt
            ? `${formattedStartAt} 的记录已更新为${statusLabel}状态。`
            : `记录已更新为${statusLabel}状态。`,
        url: `/emu/${encodeURIComponent(emuCode)}`,
        tag: `ocrh:emu:${encodeURIComponent(emuCode)}:${startAt}`
    };
}
