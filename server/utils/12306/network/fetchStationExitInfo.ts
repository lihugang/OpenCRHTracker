import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { record12306RequestHourlyStat } from '~/server/services/trainProvenanceStore';
import parsePlatformNo from '../parsePlatformNo';
import waitFor12306RequestSlot from '../requestLimiter';
import log12306RequestFailure from './log12306RequestFailure';

interface StationExitInfoResponse {
    data?: unknown;
    status?: unknown;
    errorCode?: unknown;
    errorMsg?: unknown;
}

interface StationExitInfoResponseData {
    platform?: unknown;
    wicket?: unknown;
}

export interface StationExitInfo {
    platformNo: number | null;
    wicket: string | null;
}

const logger = getLogger('12306-network:fetch-station-exit-info');

function normalizeDisplayText(value: unknown): string | null {
    const text = typeof value === 'string' ? value.trim() : '';
    return text.length > 0 && text !== '--' ? text : null;
}

function isResponseData(value: unknown): value is StationExitInfoResponseData {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export default async function fetchStationExitInfo(
    trainDate: string,
    stationTelecode: string,
    stationTrainCode: string
): Promise<StationExitInfo | null> {
    const normalizedTrainDate = trainDate.trim();
    const normalizedStationTelecode = stationTelecode.trim().toUpperCase();
    const normalizedStationTrainCode = stationTrainCode.trim().toUpperCase();
    if (!/^\d{8}$/.test(normalizedTrainDate)) {
        throw new Error('trainDate must be in YYYYMMDD format');
    }
    if (normalizedStationTelecode.length === 0) {
        throw new Error('stationTelecode must be a non-empty string');
    }
    if (normalizedStationTrainCode.length === 0) {
        throw new Error('stationTrainCode must be a non-empty string');
    }

    const config = useConfig();
    const url = 'https://mobile.12306.cn/wxxcx/wechat/bigScreen/getExit';
    const context = {
        trainDate: normalizedTrainDate,
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
                stationCode: normalizedStationTelecode,
                trainDate: normalizedTrainDate,
                type: 'A',
                stationTrainCode: normalizedStationTrainCode
            })
        });
        if (!response.ok) {
            requestStatRecorded = true;
            record12306RequestHourlyStat({
                requestType: 'fetch_station_exit_info',
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
                `fetch_station_exit_info_http_failed status=${response.status}`
            );
        }

        const json = (await response.json()) as StationExitInfoResponse;
        if (json.status !== true) {
            requestStatRecorded = true;
            record12306RequestHourlyStat({
                requestType: 'fetch_station_exit_info',
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
                errorCode: json.errorCode,
                errorMsg: json.errorMsg
            });
            failureLogged = true;
            throw new Error(
                `fetch_station_exit_info_business_failed errorCode=${String(json.errorCode ?? '')} errorMsg=${String(json.errorMsg ?? '')}`
            );
        }

        if (json.data !== undefined && !isResponseData(json.data)) {
            requestStatRecorded = true;
            record12306RequestHourlyStat({
                requestType: 'fetch_station_exit_info',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                operation: 'invalid_response',
                url,
                context,
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                detail: 'data is not an object'
            });
            failureLogged = true;
            throw new Error(
                'fetch_station_exit_info_invalid_response data_not_object'
            );
        }

        requestStatRecorded = true;
        record12306RequestHourlyStat({
            requestType: 'fetch_station_exit_info',
            isSuccess: true
        });

        if (!json.data) {
            return null;
        }

        const platformNo = parsePlatformNo(json.data.platform);
        const wicket = normalizeDisplayText(json.data.wicket);
        if (platformNo === null && wicket === null) {
            return null;
        }

        return {
            platformNo,
            wicket
        };
    } catch (error) {
        if (!requestStatRecorded) {
            record12306RequestHourlyStat({
                requestType: 'fetch_station_exit_info',
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
