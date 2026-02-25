import parseDateAsTimestamp from '@/server/utils/date/parseDateAsTimestamp';
import parseTimeAsTimestamp from '@/server/utils/date/parseTimeAsTimestamp';
import waitFor12306RequestSlot from './requestLimiter';
import useConfig from '~/server/config';

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

export default async function fetchEMUInfoBySeatCode(code: string) {
    try {
        await waitFor12306RequestSlot('query');
        const response = await fetch(
            'https://mobile.12306.cn/wxxcx/wechat/main/travelServiceDecodeQrcode',
            {
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'user-agent': config.spider.userAgent
                },
                body: `c=${code}&w=h&eKey=${config.spider.params.eKey}&cb=function(e)%7Be%26%26t.decodeCallBack()%7D`,
                method: 'POST'
            }
        );
        const json: EMUInfoResponse = await response.json();
        if (!json.status) return null;
        return {
            route: {
                code: json.data.trainCode, // G xxxx
                internalCode: json.data.trainNo,
                startAt:
                    parseDateAsTimestamp(json.data.startDay) +
                    parseTimeAsTimestamp(json.data.startTime), // second timestamp
                endAt:
                    parseDateAsTimestamp(json.data.endDay) +
                    parseTimeAsTimestamp(json.data.endTime) // second timestamp
            },
            emu: {
                code: json.data.carCode // like CR400AF-2230
            }
        };
    } catch {
        return null;
    }
}
