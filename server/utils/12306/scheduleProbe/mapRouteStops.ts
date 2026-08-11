import type { RouteStopData } from '~/server/utils/12306/network/fetchRouteInfo';
import { loadStationCoordAssets } from '~/server/services/stationCoordStore';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import {
    serviceDayToShanghaiDayStartUnixSeconds,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import type { ScheduleStationMap, ScheduleStop } from './types';

interface ResolvedRouteStationCoord {
    stationName: string;
    stationTelecode: string;
    lat: number;
    lon: number;
}

export function toScheduleStops(
    serviceDate: ServiceDay,
    stops: RouteStopData[]
): ScheduleStop[] {
    const dayStartAt = serviceDayToShanghaiDayStartUnixSeconds(serviceDate);
    return stops.map((stop) => ({
        stationNo: stop.stationNo,
        stationName: stop.stationName,
        stationTelecode: normalizeCode(stop.stationTelecode),
        arriveAt: stop.arriveAt === null ? null : stop.arriveAt - dayStartAt,
        departAt: stop.departAt === null ? null : stop.departAt - dayStartAt,
        stationTrainCode: stop.stationTrainCode,
        wicket: stop.wicket,
        ...(stop.distance !== null ? { distance: stop.distance } : {}),
        isStart: stop.isStart,
        isEnd: stop.isEnd
    }));
}

async function resolveRouteStationCoords(
    stops: RouteStopData[]
): Promise<ResolvedRouteStationCoord[]> {
    const stationCoordAssets = await loadStationCoordAssets();
    const resolvedStations: ResolvedRouteStationCoord[] = [];

    for (const stop of stops) {
        const stationTelecode = normalizeCode(stop.stationTelecode);
        const stationName = stop.stationName.trim();
        if (stationTelecode.length === 0 || stationName.length === 0) {
            continue;
        }

        const fallbackStation =
            stop.lat === null || stop.lon === null
                ? (stationCoordAssets.byStationName.get(stationName) ?? null)
                : null;
        const lat = stop.lat ?? fallbackStation?.lat ?? null;
        const lon = stop.lon ?? fallbackStation?.lon ?? null;
        if (lat === null || lon === null) {
            continue;
        }

        resolvedStations.push({
            stationTelecode,
            stationName,
            lat,
            lon
        });
    }

    return resolvedStations;
}

export async function toScheduleStationMap(
    stops: RouteStopData[]
): Promise<ScheduleStationMap> {
    const stations: ScheduleStationMap = {};
    const resolvedStations = await resolveRouteStationCoords(stops);

    for (const station of resolvedStations) {
        stations[station.stationTelecode] = {
            stationTelecode: station.stationTelecode,
            stationName: station.stationName,
            lat: station.lat,
            lon: station.lon
        };
    }

    return stations;
}
