import parseDateAsTimestamp from '@/server/utils/date/parseDateAsTimestamp';
import parseTimeAsTimestamp from '@/server/utils/date/parseTimeAsTimestamp';
import useConfig from '~/server/config';
import getCurrentDateString from '../date/getCurrentDateString';
import waitFor12306RequestSlot from './requestLimiter';

interface RouteInfoResponse {
    noLogin: string
    data: {
        arriveTime: string
        trainDetail: {
            stationTrainCodeAll: string
            stopTime: Array<{
                stationTrainCode: string
                fact_train_date_time: string
                channel: string
                train_style: string
                start_station_telecode: string
                time_interval: string
                startTrainCode: string
                dayDifference: string
                center_notice_code: string
                lat: string
                arraiveDate: string
                bureau_code: string
                dispTrainCode: string
                fact_arraive_difference: string
                station_corporation_code: string
                runningTime: string
                country_code: string
                exit: string
                trainDate: string
                end_station_name: string
                ticketStatus: string
                country_flag: string
                start_station_name: string
                distance: string
                lon: string
                arriveTime: string
                jiaolu_corporation_code: string
                arraiveDifference: string
                startTrainDate: string
                country_name: string
                startTime: string
                stationName: string
                ticketDelay: string
                corporation_code: string
                train_flag: string
                fact_arraive_date_time: string
                stationNo: string
                ticketDelayDataFlag: string
                stationTelecode: string
                passFlag: string
                wicket: string
                fact_day_difference: string
                end_station_telecode: string
                waitingRoom: string
                local_arrive_time: string
                local_start_time: string
                stopover_time: string
                jiaolu_train_style: string
                jiaolu_dept_train: string
                ticketEarly?: string
            }>
            trainCode: string
            timestamp: number
        }
        startTrainCode: string
        startTrainDate: string
        end_station_telecode: string
        startTime: string
        trainNo: string
        start_station_telecode: string
    }
    now: string
    errorCode: string
    status: boolean
    errorMsg: string
}

const config = useConfig();

export default async function fetchRouteInfo(route: string) {
    try {
        await waitFor12306RequestSlot('query');
        const response = await fetch(
            'https://mobile.12306.cn/wxxcx/wechat/main/travelServiceQrcodeTrainInfo',
            {
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'user-agent': config.spider.userAgent
                },
                body: `trainCode=${route}&startDay=${getCurrentDateString()}&startTime=&endDay=&endTime=`,
                method: 'POST'
            }
        );
        const json: RouteInfoResponse = await response.json();
        if (!json.status) return null;

        const startStation = json.data.trainDetail.stopTime.at(0)!, endStation = json.data.trainDetail.stopTime.at(-1)!;

        return {
            route: {
                code: route,
                allCodes: json.data.trainDetail.stationTrainCodeAll.split('/'),
                internalCode: json.data.trainNo,
                startAt:
                    parseDateAsTimestamp(startStation.arraiveDate) +
                    parseTimeAsTimestamp(startStation.arriveTime), // second timestamp
                endAt:
                    parseDateAsTimestamp(endStation.arraiveDate) +
                    parseTimeAsTimestamp(endStation.arriveTime) // second timestamp
            }
        };
    } catch {
        return null;
    }

}
