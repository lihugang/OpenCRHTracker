import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { estimateIdleTaskDurationMs } from '~/server/services/idleTaskEstimator';
import { enqueueTaskAfterDelaySeconds } from '~/server/services/taskQueue';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';

export const PROBE_QRCODE_AVAILABILITY_TASK_EXECUTOR =
    'probe_qrcode_availability';

const logger = getLogger('qrcode-probe-task');

export interface ProbeQrcodeAvailabilityTaskArgs {
    trainCode: string;
    emuCode: string;
}

export function isQrcodeProbeTaskEnabled(): boolean {
    return import.meta.dev && useConfig().task.qrcodeProbe.enabled;
}

function estimateQrcodeProbeTaskDurationMs(): number {
    return estimateIdleTaskDurationMs(
        PROBE_QRCODE_AVAILABILITY_TASK_EXECUTOR,
        useConfig().spider.rateLimit.query.minIntervalMs
    );
}

export function enqueueQrcodeProbeAvailabilityTask(
    trainCode: string,
    emuCode: string
): number | null {
    if (!isQrcodeProbeTaskEnabled()) {
        return null;
    }

    const normalizedTrainCode = normalizeCode(trainCode);
    const normalizedEmuCode = normalizeCode(emuCode);
    if (normalizedTrainCode.length === 0 || normalizedEmuCode.length === 0) {
        return null;
    }

    if (!parseEmuCode(normalizedEmuCode)) {
        logger.warn(
            `skip_invalid_emu_code trainCode=${normalizedTrainCode} emuCode=${normalizedEmuCode}`
        );
        return null;
    }

    const taskId = enqueueTaskAfterDelaySeconds(
        PROBE_QRCODE_AVAILABILITY_TASK_EXECUTOR,
        {
            trainCode: normalizedTrainCode,
            emuCode: normalizedEmuCode
        } satisfies ProbeQrcodeAvailabilityTaskArgs,
        useConfig().task.qrcodeProbe.delaySeconds,
        {
            isIdle: true,
            expectedDurationMs: estimateQrcodeProbeTaskDurationMs()
        }
    );

    return taskId;
}
