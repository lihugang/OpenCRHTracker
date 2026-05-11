import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import waitFor12306RequestSlot from '../requestLimiter';
import log12306RequestFailure from './log12306RequestFailure';

interface StationBoardResponseRow {
    train_no?: unknown;
    station_train_code?: unknown;
    jiaolu_train?: unknown;
    start_station_name?: unknown;
    end_station_name?: unknown;
}

interface StationBoardResponse {
    data?: unknown;
    status?: unknown;
    errorCode?: unknown;
    errorMsg?: unknown;
}

export interface StationBoardTrainRow {
    trainNo: string;
    stationTrainCode: string;
    jiaoluTrain: string;
    startStationName: string;
    endStationName: string;
}

const logger = getLogger('12306-network:fetch-station-board');

function normalizeStationBoardRow(value: unknown): StationBoardTrainRow | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    const row = value as StationBoardResponseRow;
    return {
        trainNo:
            typeof row.train_no === 'string'
                ? row.train_no.trim().toUpperCase()
                : '',
        stationTrainCode:
            typeof row.station_train_code === 'string'
                ? row.station_train_code.trim().toUpperCase()
                : '',
        jiaoluTrain:
            typeof row.jiaolu_train === 'string' ? row.jiaolu_train.trim() : '',
        startStationName:
            typeof row.start_station_name === 'string'
                ? row.start_station_name.trim()
                : '',
        endStationName:
            typeof row.end_station_name === 'string'
                ? row.end_station_name.trim()
                : ''
    };
}

export default async function fetchStationBoardByStation(
    serviceDate: string,
    stationTelecode: string
): Promise<StationBoardTrainRow[]> {
    const normalizedServiceDate = serviceDate.trim();
    const normalizedStationTelecode = stationTelecode.trim().toUpperCase();
    if (!/^\d{8}$/.test(normalizedServiceDate)) {
        throw new Error('serviceDate must be in YYYYMMDD format');
    }
    if (normalizedStationTelecode.length === 0) {
        throw new Error('stationTelecode must be a non-empty string');
    }

    const config = useConfig();
    const url =
        'https://mobile.12306.cn/wxxcx/wechat/bigScreen/queryTrainByStation' +
        `?train_start_date=${normalizedServiceDate}&train_station_code=${normalizedStationTelecode}`;

    try {
        await waitFor12306RequestSlot('query');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': config.spider.userAgent
            },
            body: ''
        });
        if (!response.ok) {
            log12306RequestFailure({
                logger,
                operation: 'http_failed',
                url,
                context: {
                    serviceDate: normalizedServiceDate,
                    stationTelecode: normalizedStationTelecode
                },
                responseStatus: response.status,
                responseOk: response.ok
            });
            throw new Error(
                `fetch_station_board_http_failed status=${response.status}`
            );
        }

        const json = (await response.json()) as StationBoardResponse;
        if (json.status !== true) {
            log12306RequestFailure({
                logger,
                operation: 'business_failed',
                url,
                context: {
                    serviceDate: normalizedServiceDate,
                    stationTelecode: normalizedStationTelecode
                },
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                errorCode: json.errorCode,
                errorMsg: json.errorMsg
            });
            throw new Error(
                `fetch_station_board_business_failed errorCode=${String(json.errorCode ?? '')} errorMsg=${String(json.errorMsg ?? '')}`
            );
        }

        if (!Array.isArray(json.data)) {
            log12306RequestFailure({
                logger,
                operation: 'invalid_response',
                url,
                context: {
                    serviceDate: normalizedServiceDate,
                    stationTelecode: normalizedStationTelecode
                },
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                detail: 'data is not an array'
            });
            throw new Error(
                'fetch_station_board_invalid_response data_not_array'
            );
        }

        return json.data
            .map((row) => normalizeStationBoardRow(row))
            .filter((row): row is StationBoardTrainRow => row !== null);
    } catch (error) {
        if (error instanceof Error) {
            log12306RequestFailure({
                logger,
                operation: 'request_failed',
                url,
                context: {
                    serviceDate: normalizedServiceDate,
                    stationTelecode: normalizedStationTelecode
                },
                error
            });
        }
        throw error;
    }
}
