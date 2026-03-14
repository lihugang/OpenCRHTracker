import getLogger from '~/server/libs/log4js';
import { insertFailedCode } from '~/server/services/failedCodesStore';
import {
    buildProbeAssetKey,
    loadProbeAssets
} from '~/server/services/probeAssetStore';
import {
    isQrcodeProbeTaskEnabled,
    PROBE_QRCODE_AVAILABILITY_TASK_EXECUTOR,
    type ProbeQrcodeAvailabilityTaskArgs
} from '~/server/services/qrcodeProbeTask';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import fetchEMUInfoBySeatCode from '~/server/utils/12306/network/fetchEMUInfoBySeatCode';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

const logger = getLogger('task-executor:probe-qrcode-availability');

let registered = false;

function parseTaskArgs(raw: unknown): ProbeQrcodeAvailabilityTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const body = raw as {
        trainCode?: unknown;
        emuCode?: unknown;
    };
    const trainCode =
        typeof body.trainCode === 'string' ? normalizeCode(body.trainCode) : '';
    const emuCode =
        typeof body.emuCode === 'string' ? normalizeCode(body.emuCode) : '';
    if (trainCode.length === 0 || emuCode.length === 0) {
        throw new Error(
            'task arguments trainCode and emuCode must be non-empty'
        );
    }

    return {
        trainCode,
        emuCode
    };
}

function recordFailure(
    reason: string,
    args: ProbeQrcodeAvailabilityTaskArgs,
    seatCode: string,
    detectedTrainCode = '',
    detectedEmuCode = ''
): void {
    const checkedAt = getNowSeconds();
    insertFailedCode({
        emuCode: args.emuCode,
        seatCode,
        reason,
        checkedAt,
        expectedTrainCode: args.trainCode,
        detectedTrainCode,
        detectedEmuCode
    });
    logger.error(
        `probe_failed reason=${reason} trainCode=${args.trainCode} emuCode=${args.emuCode} seatCode=${seatCode} detectedTrainCode=${detectedTrainCode || 'null'} detectedEmuCode=${detectedEmuCode || 'null'}`
    );
}

async function executeProbeQrcodeAvailabilityTask(rawArgs: unknown) {
    const args = parseTaskArgs(rawArgs);
    if (!isQrcodeProbeTaskEnabled()) {
        logger.info(
            `skip_disabled trainCode=${args.trainCode} emuCode=${args.emuCode}`
        );
        return;
    }

    const parsedEmuCode = parseEmuCode(args.emuCode);
    if (!parsedEmuCode) {
        logger.warn(
            `skip_invalid_emu_code trainCode=${args.trainCode} emuCode=${args.emuCode}`
        );
        return;
    }

    const assets = await loadProbeAssets();
    const seatCode = assets.qrcodeByModelAndTrainSetNo.get(
        buildProbeAssetKey(parsedEmuCode.model, parsedEmuCode.trainSetNo)
    );
    if (!seatCode) {
        logger.warn(
            `seat_code_not_found trainCode=${args.trainCode} emuCode=${args.emuCode}`
        );
        return;
    }

    const result = await fetchEMUInfoBySeatCode(seatCode);
    if (!result) {
        recordFailure('decode_failed', args, seatCode);
        return;
    }

    const detectedTrainCode = normalizeCode(result.route.code);
    const detectedEmuCode = normalizeCode(result.emu.code);

    if (detectedEmuCode !== args.emuCode) {
        recordFailure(
            'emu_code_mismatch',
            args,
            seatCode,
            detectedTrainCode,
            detectedEmuCode
        );
        return;
    }

    logger.info(
        `probe_succeeded trainCode=${args.trainCode} emuCode=${args.emuCode} seatCode=${seatCode}`
    );
}

export function registerProbeQrcodeAvailabilityTaskExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(
        PROBE_QRCODE_AVAILABILITY_TASK_EXECUTOR,
        async (args) => {
            await executeProbeQrcodeAvailabilityTask(args);
        }
    );
    registered = true;
    logger.info(
        `registered executor=${PROBE_QRCODE_AVAILABILITY_TASK_EXECUTOR}`
    );
}
