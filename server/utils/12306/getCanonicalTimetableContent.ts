import { createHash } from 'node:crypto';
import normalizeTimetableBoundaryStopTimes from '~/server/utils/12306/normalizeTimetableBoundaryStopTimes';
import type { ScheduleStop } from '~/server/utils/12306/scheduleProbe/types';

interface CanonicalTimetableStop {
    stationNo: number;
    stationName: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: string;
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
            stationTrainCode: stop.stationTrainCode.trim().toUpperCase(),
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
            const codeDiff = left.stationTrainCode.localeCompare(
                right.stationTrainCode,
                'zh-Hans-CN'
            );
            if (codeDiff !== 0) {
                return codeDiff;
            }
            return left.inputIndex - right.inputIndex;
        })
        .map(({ inputIndex: _inputIndex, ...stop }) => stop);
    const timetableJson = JSON.stringify({
        stops: normalizedStops as CanonicalTimetableStop[]
    });

    return {
        hash: createHash('sha256').update(timetableJson, 'utf8').digest('hex'),
        timetableJson,
        stopCount: normalizedStops.length
    };
}
