import {
    getAdminCouplingScanDetail,
    getAdminCouplingScanTaskList,
    getAdminQrcodeScanDetail,
    getAdminQrcodeScanTaskList,
    getAdminStationBoardDispatchDetail,
    getAdminStationBoardTaskList,
    getAdminStationPlatformRefreshDetail,
    getAdminTrainProvenance as getAdminTrainProvenanceStore,
    getAdminTrainRequestStats
} from '~/server/services/adminTrainProvenanceStore';
import type { ServiceDay } from '~/server/utils/date/serviceDay';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';

export function getAdminTrainProvenance(input: {
    serviceDay: ServiceDay;
    trainCode: TrainCodeParts;
    startAt: number | null;
}) {
    return getAdminTrainProvenanceStore(
        input.serviceDay,
        input.trainCode,
        input.startAt
    );
}

export function getAdminTrainProvenanceCouplingScan(taskRunId: number) {
    return getAdminCouplingScanDetail(taskRunId);
}

export function getAdminTrainProvenanceCouplingScanTasks(serviceDay: ServiceDay) {
    return getAdminCouplingScanTaskList(serviceDay);
}

export function getAdminTrainProvenanceQrcodeScan(
    serviceDay: ServiceDay,
    detectedAt: string
) {
    return getAdminQrcodeScanDetail(serviceDay, detectedAt);
}

export function getAdminTrainProvenanceQrcodeScanTasks(serviceDay: ServiceDay) {
    return getAdminQrcodeScanTaskList(serviceDay);
}

export function getAdminTrainProvenanceRequestStats(serviceDay: ServiceDay) {
    return getAdminTrainRequestStats(serviceDay);
}

export function getAdminTrainProvenanceStationBoard(taskRunId: number) {
    return getAdminStationBoardDispatchDetail(taskRunId);
}

export function getAdminTrainProvenanceStationBoardTasks(serviceDay: ServiceDay) {
    return getAdminStationBoardTaskList(serviceDay);
}

export function getAdminTrainProvenanceStationPlatformRefresh(resultId: number) {
    return getAdminStationPlatformRefreshDetail(resultId);
}
