import getLogger from '~/server/libs/log4js';
import { recordCurrentTrainProvenanceEventsForTrainCodes } from '~/server/services/trainProvenanceRecorder';
import type { FormationStatusWarning } from '~/server/services/formationStatusResolver';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import type { ServiceDay } from '~/server/utils/date/serviceDay';
import type { EmuId } from '~/server/libs/database/emu';

const logger = getLogger('formation-status-warnings');

export interface FormationWarningReportContext {
    trainInternalCode: string | null;
    startAt: number;
    serviceDate: ServiceDay;
    trainCodes: TrainCodeParts[];
    mainEmuId: EmuId;
}

export function reportFormationStatusWarnings(
    warnings: FormationStatusWarning[],
    context: FormationWarningReportContext
): void {
    for (const warning of warnings) {
        logger.warn(
            [
                'formation_position_warning',
                `source=${warning.source}`,
                `kind=${warning.kind}`,
                `emuId=${warning.emuId}`,
                `trainInternalCode=${context.trainInternalCode ?? ''}`,
                `startAt=${context.startAt}`,
                `serviceDate=${context.serviceDate}`,
                `oldStatus=${warning.oldStatus ?? 'null'}`,
                `newStatus=${warning.newStatus ?? 'null'}`,
                `pictureName=${warning.pictureName}`,
                `repeat=${warning.repeat}`,
                `reason=${warning.reason}`
            ].join(' ')
        );

        recordCurrentTrainProvenanceEventsForTrainCodes(context.trainCodes, {
            serviceDate: context.serviceDate,
            startAt: context.startAt,
            emuId: warning.emuId,
            eventType: 'formation_position_warning',
            result: warning.kind,
            payload: {
                source: warning.source,
                kind: warning.kind,
                reason: warning.reason,
                oldStatus: warning.oldStatus,
                newStatus: warning.newStatus,
                pictureName: warning.pictureName,
                repeat: warning.repeat,
                emuId: warning.emuId,
                trainInternalCode: context.trainInternalCode ?? '',
                startAt: context.startAt,
                serviceDate: context.serviceDate,
                trainCodes: context.trainCodes,
                mainEmuId: context.mainEmuId
            }
        });
    }
}
