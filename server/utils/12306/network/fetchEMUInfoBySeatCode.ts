import waitFor12306RequestSlot from '../requestLimiter';
import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { getShanghaiUnixSecondsFromDateAndTime } from '../../date/shanghaiDateTime';
import log12306RequestFailure from './log12306RequestFailure';

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

export default async function fetchEMUInfoBySeatCode(code: string) {
    const url =
        'https://mobile.12306.cn/wxxcx/wechat/main/travelServiceDecodeQrcode';
    try {
        await waitFor12306RequestSlot('query');
        const response = await fetch(
            url,
            {
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'user-agent': config.spider.userAgent
                },
                body: `c=${code}&w=h&eKey=${config.spider.params.eKey}&cb=function(e)%7Be%26%26t.decodeCallBack()%7D`,
                method: 'POST'
            }
        );
        if (!response.ok) {
            log12306RequestFailure({
                logger,
                operation: 'http_failed',
                url,
                context: {
                    seatCode: code
                },
                responseStatus: response.status,
                responseOk: response.ok
            });
            return null;
        }

        const json: EMUInfoResponse = await response.json();
        const data = json.data;
        const emuCode = data?.carCode?.trim();
        if (!emuCode || !data?.trainNo) {
            log12306RequestFailure({
                logger,
                operation: 'invalid_response',
                url,
                context: {
                    seatCode: code
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

        return {
            route: {
                code: data.trainCode, // G xxxx
                internalCode: data.trainNo,
                startAt: getShanghaiUnixSecondsFromDateAndTime(
                    data.startDay,
                    data.startTime
                ), // second timestamp
                endAt: getShanghaiUnixSecondsFromDateAndTime(
                    data.endDay,
                    data.endTime
                ) // second timestamp
            },
            emu: {
                code: emuCode // like CR400AF-2230
            }
        };
    } catch (error) {
        log12306RequestFailure({
            logger,
            operation: 'request_exception',
            url,
            context: {
                seatCode: code
            },
            error
        });
        return null;
    }
}
