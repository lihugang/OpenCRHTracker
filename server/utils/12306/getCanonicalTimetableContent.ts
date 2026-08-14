import { createHash } from 'node:crypto';
import normalizeTimetableBoundaryStopTimes from '~/server/utils/12306/normalizeTimetableBoundaryStopTimes';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import { stringifyInternalJson } from '~/server/utils/internal/storageValues';
import type { ScheduleStop } from '~/server/utils/12306/scheduleProbe/types';

interface CanonicalTimetableStop {
    stationNo: number;
    stationName: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: TrainCodeParts;
}

export interface CanonicalTimetableContent {
    hash: string;
    timetableJson: string;
    stopCount: number;
}

export default function getCanonicalTimetableContent(
    stops: ScheduleStop[]
): CanonicalTimetableContent {
    const normalizedStops = normalizeTimetableBoundaryStopTimes(stops)
        .map((stop, index) => ({
            stationNo: stop.stationNo,
            stationName: stop.stationName.trim(),
            arriveAt: stop.arriveAt,
            departAt: stop.departAt,
            stationTrainCode: stop.stationTrainCode,
            inputIndex: index
        }))
        .sort((left, right) => {
            if (left.stationNo !== right.stationNo) {
                return left.stationNo - right.stationNo;
            }
            const stationNameDiff = left.stationName.localeCompare(
                right.stationName,
                'zh-Hans-CN'
            );
            if (stationNameDiff !== 0) {
                return stationNameDiff;
            }
            const leftArriveAt = left.arriveAt ?? Number.MIN_SAFE_INTEGER;
            const rightArriveAt = right.arriveAt ?? Number.MIN_SAFE_INTEGER;
            if (leftArriveAt !== rightArriveAt) {
                return leftArriveAt - rightArriveAt;
            }
            const leftDepartAt = left.departAt ?? Number.MIN_SAFE_INTEGER;
            const rightDepartAt = right.departAt ?? Number.MIN_SAFE_INTEGER;
            if (leftDepartAt !== rightDepartAt) {
                return leftDepartAt - rightDepartAt;
            }
            const leftCode = `${left.stationTrainCode.prefix}${left.stationTrainCode.number}`;
            const rightCode = `${right.stationTrainCode.prefix}${right.stationTrainCode.number}`;
            const codeDiff = leftCode.localeCompare(rightCode, 'zh-Hans-CN');
            if (codeDiff !== 0) {
                return codeDiff;
            }
            return left.inputIndex - right.inputIndex;
        })
        .map(({ inputIndex: _inputIndex, ...stop }) => stop);
    const timetableJson = stringifyInternalJson({
        stops: normalizedStops as CanonicalTimetableStop[]
    });

    return {
        hash: createHash('sha256').update(timetableJson, 'utf8').digest('hex'),
        timetableJson,
        stopCount: normalizedStops.length
    };
}
