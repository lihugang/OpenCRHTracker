import {
    listAdminTimetableHistoryMergeCandidates,
    mergeAdminTimetableHistoryCoverage
} from '~/server/services/adminTimetableHistoryMaintenanceStore';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';

export function getAdminTimetableHistoryMergeCandidates(
    trainCode: TrainCodeParts
) {
    return listAdminTimetableHistoryMergeCandidates(trainCode);
}

export function deleteAdminTimetableHistoryCoverage(coverageId: number) {
    return mergeAdminTimetableHistoryCoverage(coverageId);
}
