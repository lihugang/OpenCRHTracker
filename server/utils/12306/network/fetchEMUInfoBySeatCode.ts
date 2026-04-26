import waitFor12306RequestSlot from '../requestLimiter';
import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { resolveCanonicalEmuCode } from '~/server/services/probeAssetStore';
import {
    hasCurrent12306TraceContext,
    record12306TraceRequest,
    with12306TraceFunction
} from '~/server/services/requestMetrics12306Trace';
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
    value: {
        route: {
            code: string;
            internalCode: string;
            startAt: number;
            endAt: number;
            trainRepeat: string;
        };
        emu: {
            code: string;
        };
    };
}

const cachedSeatCodeResults = new Map<string, CachedSeatCodeResult>();

export default async function fetchEMUInfoBySeatCode(code: string) {
    const normalizedCode = code.trim();
    const nowSeconds = getNowSeconds();
    const currentDate = getCurrentDateString();
    const hasParentTraceContext = hasCurrent12306TraceContext();

    const cached = cachedSeatCodeResults.get(normalizedCode);
    if (cached) {
        if (cached.expiresAt > nowSeconds && cached.startDay === currentDate) {
            return cached.value;
        }

        cachedSeatCodeResults.delete(normalizedCode);
    }

    const url =
        'https://mobile.12306.cn/wxxcx/wechat/main/travelServiceDecodeQrcode';
    return with12306TraceFunction<{
        route: {
            code: string;
            internalCode: string;
            startAt: number;
            endAt: number;
            trainRepeat: string;
        };
        emu: {
            code: string;
        };
    } | null>(
        {
            title: '按座位码获取编组信息',
            functionName: 'fetchEMUInfoBySeatCode',
            subject: hasParentTraceContext
                ? {
                      traceSubtitle: normalizedCode
                  }
                : {
                      traceKey: `seat-code:${normalizedCode}`,
                      traceTitle: '座位码编组查询',
                      traceSubtitle: normalizedCode
                  },
            context: {
                seatCode: normalizedCode
            },
            getSuccessContext: (result) => ({
                seatCode: normalizedCode,
                ok: !!result,
                trainCode: result?.route.code ?? '',
                trainInternalCode: result?.route.internalCode ?? '',
                emuCode: result?.emu.code ?? ''
            }),
            getSuccessLevel: (result) => (result ? 'INFO' : 'WARN'),
            getSuccessStatus: (result) => (result ? 'success' : 'warning')
        },
        async () => {
            const requestStartedAtMs = Date.now();
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
                    record12306TraceRequest({
                        title: '12306 座位码查询失败',
                        requestType: 'query',
                        method: 'POST',
                        url,
                        operation: 'fetch_emu_info_by_seat_code',
                        responseStatus: response.status,
                        durationMs: Date.now() - requestStartedAtMs,
                        level: 'WARN',
                        message: 'HTTP 请求失败',
                        context: {
                            seatCode: normalizedCode
                        },
                        errorMessage: `HTTP ${response.status}`
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
                    return null;
                }

                const json: EMUInfoResponse = await response.json();
                const data = json.data;
                const emuCode = data?.carCode?.trim();
                const startDay = data?.startDay?.trim() ?? '';
                if (!emuCode || !data?.trainNo) {
                    record12306TraceRequest({
                        title: '12306 座位码查询结构无效',
                        requestType: 'query',
                        method: 'POST',
                        url,
                        operation: 'fetch_emu_info_by_seat_code',
                        responseStatus: response.status,
                        businessStatus: json.status,
                        durationMs: Date.now() - requestStartedAtMs,
                        level: 'WARN',
                        message: '响应缺少 trainNo 或 carCode',
                        context: {
                            seatCode: normalizedCode
                        },
                        errorMessage:
                            'missing data, data.carCode, or data.trainNo'
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
                    return null;
                }
                if (startDay !== currentDate) {
                    record12306TraceRequest({
                        title: '12306 座位码查询日期不匹配',
                        subject: {
                            primaryTrainCode: data.trainCode,
                            allTrainCodes: [data.trainCode],
                            trainInternalCode: data.trainNo
                        },
                        requestType: 'query',
                        method: 'POST',
                        url,
                        operation: 'fetch_emu_info_by_seat_code',
                        responseStatus: response.status,
                        businessStatus: json.status,
                        durationMs: Date.now() - requestStartedAtMs,
                        level: 'WARN',
                        message: '返回的 startDay 不是当前日期',
                        context: {
                            seatCode: normalizedCode,
                            startDay,
                            currentDate
                        },
                        errorMessage: 'seat route startDay is not current day'
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
                    return null;
                }

                const canonicalEmuCode = await resolveCanonicalEmuCode(emuCode);

                const result = {
                    route: {
                        code: data.trainCode, // G xxxx
                        internalCode: data.trainNo,
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

                record12306TraceRequest({
                    title: '12306 座位码查询成功',
                    subject: {
                        primaryTrainCode: data.trainCode,
                        allTrainCodes: [data.trainCode],
                        trainInternalCode: data.trainNo,
                        startAt: result.route.startAt
                    },
                    requestType: 'query',
                    method: 'POST',
                    url,
                    operation: 'fetch_emu_info_by_seat_code',
                    responseStatus: response.status,
                    businessStatus: json.status,
                    durationMs: Date.now() - requestStartedAtMs,
                    message: '成功获取座位码对应编组',
                    context: {
                        seatCode: normalizedCode,
                        trainCode: data.trainCode,
                        trainInternalCode: data.trainNo,
                        emuCode: canonicalEmuCode,
                        startAt: result.route.startAt,
                        endAt: result.route.endAt,
                        trainRepeat: result.route.trainRepeat
                    }
                });

                if (result.route.endAt > nowSeconds) {
                    cachedSeatCodeResults.set(normalizedCode, {
                        expiresAt: result.route.endAt,
                        startDay,
                        value: result
                    });
                }

                return result;
            } catch (error) {
                record12306TraceRequest({
                    title: '12306 座位码查询异常',
                    requestType: 'query',
                    method: 'POST',
                    url,
                    operation: 'fetch_emu_info_by_seat_code',
                    durationMs: Date.now() - requestStartedAtMs,
                    level: 'WARN',
                    message: '请求抛出异常',
                    context: {
                        seatCode: normalizedCode,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error)
                    },
                    errorMessage:
                        error instanceof Error ? error.message : String(error)
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
                return null;
            }
        }
    );
}
