import { scanDailyAnomalies } from '~/server/services/adminAnomalyStore';
import {
    deleteAnomalyRoute,
    deleteAnomalyRoutesByType
} from '~/server/services/adminAnomalyActionStore';
import type { ServiceDay } from '~/server/utils/date/serviceDay';

export function getAdminAnomalyScan(serviceDay: ServiceDay) {
    return scanDailyAnomalies(serviceDay);
}

export function postAdminAnomalyDeleteByType(
    serviceDay: ServiceDay,
    type: string
) {
    return deleteAnomalyRoutesByType(serviceDay, type);
}

export function postAdminAnomalyDeleteRoute(
    serviceDay: ServiceDay,
    routeId: string
) {
    return deleteAnomalyRoute(serviceDay, routeId);
}
