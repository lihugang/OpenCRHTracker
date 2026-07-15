import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { record12306RequestHourlyStat } from '~/server/services/trainProvenanceStore';
import parsePlatformNo from '../parsePlatformNo';
import waitFor12306RequestSlot from '../requestLimiter';
import log12306RequestFailure from './log12306RequestFailure';

interface StationTransportInfoResponse {
    httpCode?: unknown;
    content?: unknown;
    status?: unknown;
}

interface StationTransportInfoContent {
    data?: unknown;
    status?: unknown;
}

interface StationTransportInfoData {
    arrivePlant?: unknown;
}

export interface StationTransportInfo {
    platformNo: number;
}

const logger = getLogger('12306-network:fetch-station-transport-info');

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export default async function fetchStationTransportInfo(
    stationTelecode: string,
    stationTrainCode: string
): Promise<StationTransportInfo | null> {
    const normalizedStationTelecode = stationTelecode.trim().toUpperCase();
    const normalizedStationTrainCode = stationTrainCode.trim().toUpperCase();
    if (normalizedStationTelecode.length === 0) {
        throw new Error('stationTelecode must be a non-empty string');
    }
    if (normalizedStationTrainCode.length === 0) {
        throw new Error('stationTrainCode must be a non-empty string');
    }

    const config = useConfig();
    const url =
        'https://mobile.12306.cn/wxxcx/openplatform-inner/miniprogram/wifiapps/appFrontEnd/v2/lounge/open-smooth-common/navigation/listInfo';
    const context = {
        stationTelecode: normalizedStationTelecode,
        stationTrainCode: normalizedStationTrainCode
    };
    let requestStatRecorded = false;
    let failureLogged = false;

    try {
        await waitFor12306RequestSlot('query');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': config.spider.userAgent
            },
            body: new URLSearchParams({
                reqType: 'json',
                stationCode: normalizedStationTelecode,
                trainCode: normalizedStationTrainCode
            })
        });
        if (!response.ok) {
            requestStatRecorded = true;
            record12306RequestHourlyStat({
                requestType: 'fetch_station_transport_info',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                operation: 'http_failed',
                url,
                context,
                responseStatus: response.status,
                responseOk: response.ok
            });
            failureLogged = true;
            throw new Error(
                `fetch_station_transport_info_http_failed status=${response.status}`
            );
        }

        const json = (await response.json()) as StationTransportInfoResponse;
        if (
            json.httpCode !== 200 ||
            json.status !== 0 ||
            !isObject(json.content)
        ) {
            requestStatRecorded = true;
            record12306RequestHourlyStat({
                requestType: 'fetch_station_transport_info',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                operation: 'business_failed',
                url,
                context,
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                errorCode: json.httpCode,
                detail: 'invalid top-level response status or content'
            });
            failureLogged = true;
            throw new Error(
                `fetch_station_transport_info_business_failed httpCode=${String(json.httpCode ?? '')} status=${String(json.status ?? '')}`
            );
        }

        const content = json.content as StationTransportInfoContent;
        if (content.status !== 0 || !isObject(content.data)) {
            requestStatRecorded = true;
            record12306RequestHourlyStat({
                requestType: 'fetch_station_transport_info',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                operation: 'invalid_response',
                url,
                context,
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: content.status,
                detail: 'invalid content status or data'
            });
            failureLogged = true;
            throw new Error(
                `fetch_station_transport_info_invalid_response contentStatus=${String(content.status ?? '')}`
            );
        }

        requestStatRecorded = true;
        record12306RequestHourlyStat({
            requestType: 'fetch_station_transport_info',
            isSuccess: true
        });

        const data = content.data as StationTransportInfoData;
        const platformNo = parsePlatformNo(data.arrivePlant);
        return platformNo === null ? null : { platformNo };
    } catch (error) {
        if (!requestStatRecorded) {
            record12306RequestHourlyStat({
                requestType: 'fetch_station_transport_info',
                isSuccess: false
            });
        }
        if (error instanceof Error && !failureLogged) {
            log12306RequestFailure({
                logger,
                operation: 'request_failed',
                url,
                context,
                error
            });
        }
        throw error;
    }
}
