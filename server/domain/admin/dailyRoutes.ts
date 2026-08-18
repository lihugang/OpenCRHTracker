import {
    createAdminDailyRoute,
    deleteAdminDailyRoute as deleteAdminDailyRouteStore,
    listAdminDailyRouteTimetableCandidates,
    searchAdminDailyRoutes
} from '~/server/services/adminDailyRouteMaintenanceStore';
import type { EmuId } from '~/server/libs/database/emu';
import type { ServiceDay } from '~/server/utils/date/serviceDay';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';

export function getAdminDailyRoutes(
    serviceDay: ServiceDay,
    trainCode: TrainCodeParts | null,
    emuId: EmuId | null
) {
    return searchAdminDailyRoutes(serviceDay, trainCode, emuId);
}

export function postAdminDailyRoutes(input: {
    serviceDay: ServiceDay;
    trainCode: TrainCodeParts;
    emuId: EmuId;
    timetableId: number | null;
    status: number;
}) {
    return createAdminDailyRoute(
        input.serviceDay,
        input.trainCode,
        input.emuId,
        input.timetableId,
        input.status
    );
}

export function deleteAdminDailyRoute(id: number) {
    return deleteAdminDailyRouteStore(String(id));
}

export function getAdminDailyRoutesTimetables(
    serviceDay: ServiceDay,
    trainCode: TrainCodeParts
) {
    return listAdminDailyRouteTimetableCandidates(serviceDay, trainCode);
}
