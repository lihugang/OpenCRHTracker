import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import getCurrentDateString from '../../date/getCurrentDateString';
import { getShanghaiUnixSecondsFromDateAndTime } from '../../date/shanghaiDateTime';
import log12306RequestFailure from './log12306RequestFailure';
import log12306RequestMetric from './log12306RequestMetric';
import waitFor12306RequestSlot from '../requestLimiter';

interface RouteInfoResponse {
    noLogin: string;
    data: {
        arriveTime: string;
        trainDetail: {
            stationTrainCodeAll: string;
            stopTime: Array<{
                stationTrainCode: string;
                fact_train_date_time: string;
                channel: string;
                train_style: string;
                start_station_telecode: string;
                time_interval: string;
                startTrainCode: string;
                dayDifference: string;
                center_notice_code: string;
                lat: string;
                arraiveDate: string;
                bureau_code: string;
                dispTrainCode: string;
                fact_arraive_difference: string;
                station_corporation_code: string;
                runningTime: string;
                country_code: string;
                exit: string;
                trainDate: string;
                end_station_name: string;
                ticketStatus: string;
                country_flag: string;
                start_station_name: string;
                distance: string;
                lon: string;
                arriveTime: string;
                jiaolu_corporation_code: string;
                arraiveDifference: string;
                startTrainDate: string;
                country_name: string;
                startTime: string;
                stationName: string;
                ticketDelay: string;
                corporation_code: string;
                train_flag: string;
                fact_arraive_date_time: string;
                stationNo: string;
                ticketDelayDataFlag: string;
                stationTelecode: string;
                passFlag: string;
                wicket: string;
                fact_day_difference: string;
                end_station_telecode: string;
                waitingRoom: string;
                local_arrive_time: string;
                local_start_time: string;
                stopover_time: string;
                jiaolu_train_style: string;
                jiaolu_dept_train: string;
                ticketEarly?: string;
            }>;
            trainCode: string;
            timestamp: number;
        };
        startTrainCode: string;
        startTrainDate: string;
        end_station_telecode: string;
        startTime: string;
        trainNo: string;
        start_station_telecode: string;
    };
    now: string;
    errorCode: string;
    status: boolean;
    errorMsg: string;
}

const config = useConfig();
const logger = getLogger('12306-network:fetch-route-info');

export interface RouteInfoData {
    code: string;
    allCodes: string[];
    internalCode: string;
    bureauCode: string;
    trainDepartment: string;
    passengerDepartment: string;
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    stops: RouteStopData[];
}

export interface RouteStopData {
    stationNo: number;
    stationName: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: string;
    wicket: string;
    isStart: boolean;
    isEnd: boolean;
}

export interface RunningRouteInfoResult {
    status: 'running';
    route: RouteInfoData;
}

export interface NotRunningRouteInfoResult {
    status: 'not_running';
    errorCode: string;
    errorMsg: string;
}

export interface RequestFailedRouteInfoResult {
    status: 'request_failed';
}

export type FetchRouteInfoResult =
    | RunningRouteInfoResult
    | NotRunningRouteInfoResult
    | RequestFailedRouteInfoResult;

export default async function fetchRouteInfo(
    route: string
): Promise<FetchRouteInfoResult> {
    const url =
        'https://mobile.12306.cn/wxxcx/wechat/main/travelServiceQrcodeTrainInfo';
    try {
        await waitFor12306RequestSlot('query');
        log12306RequestMetric({
            operation: 'fetch_route_info',
            type: 'query',
            url,
            context: {
                trainCode: route
            }
        });
        const response = await fetch(url, {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': config.spider.userAgent
            },
            body: `trainCode=${route}&startDay=${getCurrentDateString()}&startTime=&endDay=&endTime=`,
            method: 'POST'
        });
        if (!response.ok) {
            log12306RequestFailure({
                logger,
                operation: 'http_failed',
                url,
                context: {
                    trainCode: route
                },
                responseStatus: response.status,
                responseOk: response.ok
            });
            return {
                status: 'request_failed'
            };
        }

        const json: RouteInfoResponse = await response.json();
        if (!json.status) {
            log12306RequestFailure({
                logger,
                operation: 'business_failed',
                url,
                context: {
                    trainCode: route
                },
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                errorCode: json.errorCode,
                errorMsg: json.errorMsg
            });
            return {
                status: 'not_running',
                errorCode: json.errorCode ?? '',
                errorMsg: json.errorMsg ?? ''
            };
        }

        const rawStops = json.data?.trainDetail?.stopTime ?? [];
        const routeMetadata = resolveRouteMetadata(rawStops);
        const stops = rawStops
            .map((stop, index) => {
                const stationNo = Number.parseInt(stop.stationNo, 10);
                const arriveAt = parseOptionalUnixSeconds(
                    stop.arraiveDate,
                    stop.arriveTime
                );
                const departAt = parseOptionalUnixSeconds(
                    stop.arraiveDate,
                    stop.startTime
                );

                return {
                    stationNo: Number.isInteger(stationNo)
                        ? stationNo
                        : index + 1,
                    stationName: stop.stationName.trim(),
                    arriveAt,
                    departAt,
                    stationTrainCode: stop.stationTrainCode
                        .trim()
                        .toUpperCase(),
                    wicket: normalizeOptionalField(stop.wicket),
                    isStart: index === 0,
                    isEnd: index === rawStops.length - 1
                };
            })
            .filter((stop) => stop.stationName.length > 0);
        const startStation = stops.at(0);
        const endStation = stops.at(-1);
        if (!startStation || !endStation || !json.data?.trainNo) {
            log12306RequestFailure({
                logger,
                level: 'debug',
                operation: 'invalid_response',
                url,
                context: {
                    trainCode: route
                },
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                errorCode: json.errorCode,
                errorMsg: json.errorMsg,
                detail: 'missing train detail stopTime or trainNo'
            });
            return {
                status: 'not_running',
                errorCode: 'invalid_response',
                errorMsg: 'missing train detail stopTime or trainNo'
            };
        }

        const startAt = startStation.departAt ?? startStation.arriveAt;
        const endAt = endStation.arriveAt ?? endStation.departAt;
        if (startAt === null || endAt === null) {
            log12306RequestFailure({
                logger,
                operation: 'invalid_response',
                url,
                context: {
                    trainCode: route
                },
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                errorCode: json.errorCode,
                errorMsg: json.errorMsg,
                detail: 'missing parsed startAt or endAt'
            });
            return {
                status: 'not_running',
                errorCode: 'invalid_response',
                errorMsg: 'missing parsed startAt or endAt'
            };
        }

        return {
            status: 'running',
            route: {
                code: route,
                allCodes: uniqueNormalizedCodes([
                    route,
                    ...json.data.trainDetail.stationTrainCodeAll.split('/')
                ]),
                internalCode: json.data.trainNo,
                bureauCode: routeMetadata.bureauCode,
                trainDepartment: routeMetadata.trainDepartment,
                passengerDepartment: routeMetadata.passengerDepartment,
                startStation: startStation.stationName,
                endStation: endStation.stationName,
                startAt,
                endAt,
                stops
            }
        };
    } catch (error) {
        log12306RequestFailure({
            logger,
            operation: 'request_exception',
            url,
            context: {
                trainCode: route
            },
            error
        });
        return {
            status: 'request_failed'
        };
    }
}

function parseOptionalUnixSeconds(
    dateYYYYMMDD: string,
    timeHHmm: string
): number | null {
    if (!/^\d{8}$/.test(dateYYYYMMDD) || !/^\d{4}$/.test(timeHHmm)) {
        return null;
    }

    return getShanghaiUnixSecondsFromDateAndTime(dateYYYYMMDD, timeHHmm);
}

function normalizeOptionalField(value: string | undefined): string {
    if (typeof value !== 'string') {
        return '';
    }

    const normalized = value.trim();
    if (
        normalized.length === 0 ||
        normalized === '--' ||
        normalized === '----'
    ) {
        return '';
    }

    return normalized;
}

function resolveRouteMetadata(
    rawStops: RouteInfoResponse['data']['trainDetail']['stopTime']
): Pick<RouteInfoData, 'bureauCode' | 'trainDepartment' | 'passengerDepartment'> {
    const metadata: Pick<
        RouteInfoData,
        'bureauCode' | 'trainDepartment' | 'passengerDepartment'
    > = {
        bureauCode: '',
        trainDepartment: '',
        passengerDepartment: ''
    };

    for (const stop of rawStops) {
        if (metadata.bureauCode.length === 0) {
            metadata.bureauCode = normalizeOptionalField(
                stop.corporation_code
            ).slice(0, 1);
        }
        if (metadata.trainDepartment.length === 0) {
            metadata.trainDepartment = normalizeOptionalField(
                stop.jiaolu_dept_train
            );
        }
        if (metadata.passengerDepartment.length === 0) {
            metadata.passengerDepartment = normalizeOptionalField(
                stop.jiaolu_corporation_code
            );
        }
        if (
            metadata.bureauCode.length > 0 &&
            metadata.trainDepartment.length > 0 &&
            metadata.passengerDepartment.length > 0
        ) {
            break;
        }
    }

    return metadata;
}
