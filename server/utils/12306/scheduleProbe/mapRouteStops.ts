import type { RouteStopData } from '~/server/utils/12306/network/fetchRouteInfo';
import { toShanghaiDayOffsetFromUnixSeconds } from '~/server/utils/date/shanghaiDateTime';
import type { ScheduleStop } from './types';

export function toScheduleStops(
    date: string,
    stops: RouteStopData[]
): ScheduleStop[] {
    return stops.map((stop) => ({
        stationNo: stop.stationNo,
        stationName: stop.stationName,
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
