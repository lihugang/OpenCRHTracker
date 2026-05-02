import waitFor12306RequestSlot from '../requestLimiter';
import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { resolveCanonicalEmuCode } from '~/server/services/probeAssetStore';
import { record12306RequestHourlyStat } from '~/server/services/trainProvenanceStore';
import getCurrentDateString from '../../date/getCurrentDateString';
import { getShanghaiUnixSecondsFromDateAndTime } from '../../date/shanghaiDateTime';
import log12306RequestFailure from './log12306RequestFailure';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

interface EMUInfoResponse {
    noLogin: string;
    data: {
        deptName: string;
        coachNo: string;
        startDay: string;
        trainCode: string;
        trainNo: string;
        conf: Array<any>;
        seatTypes: Array<{
            code: string;
            name: string;
        }>;
        bureauCode: string;
        indexApps: Array<any>;
        seatType: string;
        isSilentCoach: boolean;
        carCode: string;
        endDay: string;
        today: string;
        startTime: string;
        carInfo: {
            carCapacity: string;
            babyCareTable: string;
            carWidth: string;
            wheelchairAccessibleRestroom: string;
            trainConductorOffice: string;
            wifiFlag: string;
            carPicUrl: string;
            cateringLocation: string;
            carType: string;
            totalCoachNum: string;
            perHourSpeed: string;
            trainStyle: string;
            carHeight: string;
            carLength: string;
        };
        endTime: string;
        seatNo: string;
        bureauName: string;
        trainRepeat: string;
        deptCode: string;
        siteType: string;
    };
    now: string;
    errorCode: string;
    status: boolean;
    errorMsg: string;
}

const config = useConfig();
const logger = getLogger('12306-network:fetch-emu-info-by-seat-code');

interface CachedSeatCodeResult {
    expiresAt: number;
    startDay: string;
    value: FetchSeatCodeSuccessResult;
}

const cachedSeatCodeResults = new Map<string, CachedSeatCodeResult>();

export type FetchSeatCodeFailureReason =
    | 'network_error'
    | 'seat_code_not_enabled'
    | 'other_error';

export interface FetchSeatCodeSuccessResult {
    status: 'success';
    route: {
        code: string;
        internalCode: string;
        startDay: string;
        endDay: string;
        startAt: number;
        endAt: number;
        trainRepeat: string;
    };
    emu: {
        code: string;
    };
}

export interface FetchSeatCodeRouteSnapshot {
    code: string;
    internalCode: string;
    startDay: string;
    endDay: string;
    startAt: number;
    endAt: number;
    trainRepeat: string;
}

export interface FetchSeatCodeFailureResult {
    status: 'request_failed';
    reason: FetchSeatCodeFailureReason;
    errorCode: string;
    errorMsg: string;
    businessStatus: boolean | null;
    detail: string;
    route: FetchSeatCodeRouteSnapshot | null;
}

export type FetchSeatCodeResult =
    | FetchSeatCodeSuccessResult
    | FetchSeatCodeFailureResult;

function buildFailureResult(
    reason: FetchSeatCodeFailureReason,
    options: {
        errorCode?: string;
        errorMsg?: string;
        businessStatus?: boolean | null;
        detail?: string;
        route?: FetchSeatCodeRouteSnapshot | null;
    } = {}
): FetchSeatCodeFailureResult {
    return {
        status: 'request_failed',
        reason,
        errorCode: options.errorCode?.trim() ?? '',
        errorMsg: options.errorMsg?.trim() ?? '',
        businessStatus:
            typeof options.businessStatus === 'boolean'
                ? options.businessStatus
                : null,
        detail: options.detail?.trim() ?? '',
        route: options.route ?? null
    };
}

function buildRouteSnapshot(
    data: EMUInfoResponse['data'] | undefined
): FetchSeatCodeRouteSnapshot | null {
    const startDay = data?.startDay?.trim() ?? '';
    const endDay = data?.endDay?.trim() ?? '';
    const startTime = data?.startTime?.trim() ?? '';
    const endTime = data?.endTime?.trim() ?? '';
    const trainCode = data?.trainCode?.trim() ?? '';
    const trainNo = data?.trainNo?.trim() ?? '';

    if (
        startDay.length === 0 ||
        endDay.length === 0 ||
        startTime.length === 0 ||
        endTime.length === 0 ||
        trainCode.length === 0 ||
        trainNo.length === 0
    ) {
        return null;
    }

    return {
        code: trainCode,
        internalCode: trainNo,
        startDay,
        endDay,
        startAt: getShanghaiUnixSecondsFromDateAndTime(startDay, startTime),
        endAt: getShanghaiUnixSecondsFromDateAndTime(endDay, endTime),
        trainRepeat: data?.trainRepeat?.trim() ?? ''
    };
}

function isSeatCodeNotEnabledResponse(json: EMUInfoResponse): boolean {
    return (
        json.status === false &&
        json.errorCode === '1006' &&
        json.errorMsg.includes('暂未开通畅行码服务')
    );
}

export default async function fetchEMUInfoBySeatCode(
    code: string
): Promise<FetchSeatCodeResult> {
    const normalizedCode = code.trim();
    const nowSeconds = getNowSeconds();
    const currentDate = getCurrentDateString();

    const cached = cachedSeatCodeResults.get(normalizedCode);
    if (cached) {
        if (cached.expiresAt > nowSeconds && cached.startDay === currentDate) {
            return cached.value;
        }

        cachedSeatCodeResults.delete(normalizedCode);
    }

    const url =
        'https://mobile.12306.cn/wxxcx/wechat/main/travelServiceDecodeQrcode';

    try {
        await waitFor12306RequestSlot('query');
        const response = await fetch(url, {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': config.spider.userAgent
            },
            body: `c=${normalizedCode}&w=h&eKey=${config.spider.params.eKey}&cb=function(e)%7Be%26%26t.decodeCallBack()%7D`,
            method: 'POST'
        });
        if (!response.ok) {
            record12306RequestHourlyStat({
                requestType: 'fetch_emu_by_seat_code',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                operation: 'http_failed',
                url,
                context: {
                    seatCode: normalizedCode
                },
                responseStatus: response.status,
                responseOk: response.ok
            });
            return buildFailureResult('network_error', {
                detail: `http_failed status=${response.status}`
            });
        }

        const json: EMUInfoResponse = await response.json();
        if (isSeatCodeNotEnabledResponse(json)) {
            record12306RequestHourlyStat({
                requestType: 'fetch_emu_by_seat_code',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                level: 'debug',
                operation: 'seat_code_not_enabled',
                url,
                context: {
                    seatCode: normalizedCode
                },
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                errorCode: json.errorCode,
                errorMsg: json.errorMsg
            });
            return buildFailureResult('seat_code_not_enabled', {
                errorCode: json.errorCode,
                errorMsg: json.errorMsg,
                businessStatus: json.status,
                detail: 'seat code service is not enabled for this train'
            });
        }

        const data = json.data;
        const routeSnapshot = buildRouteSnapshot(data);
        const emuCode = data?.carCode?.trim();
        const startDay = data?.startDay?.trim() ?? '';
        if (!emuCode || !data?.trainNo) {
            record12306RequestHourlyStat({
                requestType: 'fetch_emu_by_seat_code',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                level: 'debug',
                operation: 'invalid_response',
                url,
                context: {
                    seatCode: normalizedCode
                },
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                errorCode: json.errorCode,
                errorMsg: json.errorMsg,
                detail: 'missing data, data.carCode, or data.trainNo'
            });
            return buildFailureResult('other_error', {
                errorCode: json.errorCode,
                errorMsg: json.errorMsg,
                businessStatus: json.status,
                detail: 'missing data, data.carCode, or data.trainNo',
                route: routeSnapshot
            });
        }
        if (startDay !== currentDate) {
            record12306RequestHourlyStat({
                requestType: 'fetch_emu_by_seat_code',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                level: 'debug',
                operation: 'invalid_response',
                url,
                context: {
                    seatCode: normalizedCode,
                    startDay,
                    currentDate
                },
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                errorCode: json.errorCode,
                errorMsg: json.errorMsg,
                detail: 'seat route startDay is not current day'
            });
            return buildFailureResult('other_error', {
                errorCode: json.errorCode,
                errorMsg: json.errorMsg,
                businessStatus: json.status,
                detail: 'seat route startDay is not current day',
                route: routeSnapshot
            });
        }

        const canonicalEmuCode = await resolveCanonicalEmuCode(emuCode);

        const result: FetchSeatCodeSuccessResult = {
            status: 'success',
            route: {
                code: data.trainCode, // G xxxx
                internalCode: data.trainNo,
                startDay,
                endDay: data.endDay?.trim() ?? '',
                startAt: getShanghaiUnixSecondsFromDateAndTime(
                    startDay,
                    data.startTime
                ), // second timestamp
                endAt: getShanghaiUnixSecondsFromDateAndTime(
                    data.endDay,
                    data.endTime
                ), // second timestamp
                trainRepeat: data.trainRepeat?.trim() ?? ''
            },
            emu: {
                code: canonicalEmuCode // like CR400AF-2230
            }
        };

        if (result.route.endAt > nowSeconds) {
            cachedSeatCodeResults.set(normalizedCode, {
                expiresAt: result.route.endAt,
                startDay,
                value: result
            });
        }

        record12306RequestHourlyStat({
            requestType: 'fetch_emu_by_seat_code',
            isSuccess: true
        });
        return result;
    } catch (error) {
        record12306RequestHourlyStat({
            requestType: 'fetch_emu_by_seat_code',
            isSuccess: false
        });
        log12306RequestFailure({
            logger,
            operation: 'request_exception',
            url,
            context: {
                seatCode: normalizedCode
            },
            error
        });
        return buildFailureResult('network_error', {
            detail: error instanceof Error ? error.message : String(error)
        });
    }
}
