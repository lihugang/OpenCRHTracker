import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { record12306RequestHourlyStat } from '~/server/services/trainProvenanceStore';
import waitFor12306RequestSlot from '../requestLimiter';
import log12306RequestFailure from './log12306RequestFailure';

interface AllStationsResponse {
    data?: {
        stations?: Array<{
            station_name?: unknown;
            station_telecode?: unknown;
        }>;
    };
    status?: unknown;
    errorCode?: unknown;
    errorMsg?: unknown;
}

export interface AllStationRow {
    stationName: string;
    stationTelecode: string;
}

const logger = getLogger('12306-network:fetch-all-stations');

export default async function fetchAllStations(): Promise<AllStationRow[]> {
    const config = useConfig();
    const url = 'https://mobile.12306.cn/wxxcx/wechat/main/getAllStations';
    let requestStatRecorded = false;
    let failureLogged = false;

    try {
        await waitFor12306RequestSlot('query');
        const response = await fetch(url, {
            headers: {
                'user-agent': config.spider.userAgent
            }
        });
        if (!response.ok) {
            requestStatRecorded = true;
            record12306RequestHourlyStat({
                requestType: 'fetch_all_stations',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                operation: 'http_failed',
                url,
                responseStatus: response.status,
                responseOk: response.ok
            });
            failureLogged = true;
            throw new Error(
                `fetch_all_stations_http_failed status=${response.status}`
            );
        }

        const json = (await response.json()) as AllStationsResponse;
        if (json.status !== true) {
            requestStatRecorded = true;
            record12306RequestHourlyStat({
                requestType: 'fetch_all_stations',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                operation: 'business_failed',
                url,
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                errorCode: json.errorCode,
                errorMsg: json.errorMsg
            });
            failureLogged = true;
            throw new Error(
                `fetch_all_stations_business_failed errorCode=${String(json.errorCode ?? '')} errorMsg=${String(json.errorMsg ?? '')}`
            );
        }

        const stations = Array.isArray(json.data?.stations)
            ? json.data.stations
            : [];
        const normalizedStations: AllStationRow[] = [];
        for (const station of stations) {
            const stationName =
                typeof station.station_name === 'string'
                    ? station.station_name.trim()
                    : '';
            const stationTelecode =
                typeof station.station_telecode === 'string'
                    ? station.station_telecode.trim().toUpperCase()
                    : '';
            if (stationName.length === 0 || stationTelecode.length === 0) {
                continue;
            }

            normalizedStations.push({
                stationName,
                stationTelecode
            });
        }

        if (normalizedStations.length === 0) {
            requestStatRecorded = true;
            record12306RequestHourlyStat({
                requestType: 'fetch_all_stations',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                operation: 'invalid_response',
                url,
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                detail: 'normalized stations list is empty'
            });
            failureLogged = true;
            throw new Error('fetch_all_stations_empty_result');
        }

        requestStatRecorded = true;
        record12306RequestHourlyStat({
            requestType: 'fetch_all_stations',
            isSuccess: true
        });
        logger.info(`done stationCount=${normalizedStations.length}`);

        return normalizedStations;
    } catch (error) {
        if (!requestStatRecorded) {
            record12306RequestHourlyStat({
                requestType: 'fetch_all_stations',
                isSuccess: false
            });
        }
        if (error instanceof Error && !failureLogged) {
            log12306RequestFailure({
                logger,
                operation: 'request_failed',
                url,
                error
            });
        }
        throw error;
    }
}
