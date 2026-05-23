import type { RouteStopData } from '~/server/utils/12306/network/fetchRouteInfo';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { toShanghaiDayOffsetFromUnixSeconds } from '~/server/utils/date/shanghaiDateTime';
import type {
    ScheduleStationMap,
    ScheduleStop
} from './types';

export function toScheduleStops(
    date: string,
    stops: RouteStopData[]
): ScheduleStop[] {
    return stops.map((stop) => ({
        stationNo: stop.stationNo,
        stationName: stop.stationName,
        stationTelecode: normalizeCode(stop.stationTelecode),
        arriveAt:
            stop.arriveAt === null
                ? null
                : toShanghaiDayOffsetFromUnixSeconds(date, stop.arriveAt),
        departAt:
            stop.departAt === null
                ? null
                : toShanghaiDayOffsetFromUnixSeconds(date, stop.departAt),
        stationTrainCode: stop.stationTrainCode,
        wicket: stop.wicket,
        isStart: stop.isStart,
        isEnd: stop.isEnd
    }));
}

export function toScheduleStationMap(
    stops: RouteStopData[]
): ScheduleStationMap {
    const stations: ScheduleStationMap = {};

    for (const stop of stops) {
        const stationTelecode = normalizeCode(stop.stationTelecode);
        const stationName = stop.stationName.trim();
        if (
            stationTelecode.length === 0 ||
            stationName.length === 0 ||
            stop.lat === null ||
            stop.lon === null
        ) {
            continue;
        }

        stations[stationTelecode] = {
            stationTelecode,
            stationName,
            lat: stop.lat,
            lon: stop.lon
        };
    }

    return stations;
}
