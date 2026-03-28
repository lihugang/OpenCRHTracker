import waitFor12306RequestSlot from '../requestLimiter';
import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import getCurrentDateString from '../../date/getCurrentDateString';
import { getShanghaiUnixSecondsFromDateAndTime } from '../../date/shanghaiDateTime';
import log12306RequestFailure from './log12306RequestFailure';
import log12306RequestMetric from './log12306RequestMetric';
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
        log12306RequestMetric({
            operation: 'fetch_emu_info_by_seat_code',
            type: 'query',
            url,
            context: {
                seatCode: normalizedCode
            }
        });
        const response = await fetch(url, {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': config.spider.userAgent
            },
            body: `c=${normalizedCode}&w=h&eKey=${config.spider.params.eKey}&cb=function(e)%7Be%26%26t.decodeCallBack()%7D`,
            method: 'POST'
        });
        if (!response.ok) {
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
            log12306RequestFailure({
                logger,
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
                code: emuCode // like CR400AF-2230
            }
        };

        if (result.route.endAt > nowSeconds) {
            cachedSeatCodeResults.set(normalizedCode, {
                expiresAt: result.route.endAt,
                startDay,
                value: result
            });
        }

        return result;
    } catch (error) {
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
