import CryptoJS from 'crypto-js';
import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { record12306RequestHourlyStat } from '~/server/services/trainProvenanceStore';
import waitFor12306RequestSlot from '~/server/utils/12306/requestLimiter';

const API_URL = 'https://erpwxapi.dczcy.com/shoppingapi/GetTrainnoRoadInfo';
const API_VERSION = '1.0.0';
const REQUEST_MODEL = 'unknown';
const REQUEST_TIMEOUT_MS = 30_000;

const logger = getLogger('12306-network:fetch-guangzhou-dining-train');

interface GuangzhouDiningResponse {
    code?: number;
    info?: string;
    data?: string;
}

interface GuangzhouDiningDecryptedData {
    F_TrainsId?: string;
    F_Trainno?: string;
}

export interface GuangzhouDiningTrainResult {
    trainUuid: string;
    returnedTrainCode: string;
}

function buildBusinessData(trainCode: string, serviceDate: string) {
    return JSON.stringify({
        F_TrainsName: trainCode,
        F_TrainsDate: `${serviceDate.slice(0, 4)}-${serviceDate.slice(4, 6)}-${serviceDate.slice(6, 8)}`,
        F_CarriageNo: '01车',
        F_SeatOrder: '1',
        F_SeatNo: 'A座'
    });
}

function decryptResponseData(encryptedData: string, desKey: string) {
    const key = CryptoJS.enc.Utf8.parse(desKey);
    const plaintext = CryptoJS.DES.decrypt(encryptedData, key, {
        iv: key,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    }).toString(CryptoJS.enc.Utf8);
    if (plaintext.length === 0) {
        throw new Error('decrypted response is empty');
    }
    return JSON.parse(plaintext) as GuangzhouDiningDecryptedData;
}

export default async function fetchGuangzhouDiningTrain(
    trainCode: string,
    serviceDate: string
): Promise<GuangzhouDiningTrainResult | null> {
    const { guangzhouDiningSigningKey, guangzhouDiningDesKey } =
        useConfig().spider.params;
    const data = buildBusinessData(trainCode, serviceDate);
    const signingText = `data=${data}&model=${REQUEST_MODEL}&version=${API_VERSION}&key=${guangzhouDiningSigningKey}`;
    const url = new URL(API_URL);
    url.searchParams.set(
        'sign',
        CryptoJS.MD5(signingText).toString(CryptoJS.enc.Hex)
    );
    url.searchParams.set('data', data);
    url.searchParams.set('version', API_VERSION);
    url.searchParams.set('model', REQUEST_MODEL);

    try {
        await waitFor12306RequestSlot('query');
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'content-type': 'application/x-www-form-urlencoded'
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        const body = (await response.json()) as GuangzhouDiningResponse;
        if (!response.ok || body.code !== 200 || !body.data?.trim()) {
            record12306RequestHourlyStat({
                requestType: 'fetch_guangzhou_dining_train',
                isSuccess: false
            });
            logger.warn(
                `request_failed trainCode=${trainCode} serviceDate=${serviceDate} responseStatus=${response.status} businessCode=${body.code ?? ''} info=${body.info ?? ''}`
            );
            return null;
        }

        const decrypted = decryptResponseData(body.data, guangzhouDiningDesKey);
        const trainUuid = decrypted.F_TrainsId?.trim() ?? '';
        if (trainUuid.length === 0) {
            record12306RequestHourlyStat({
                requestType: 'fetch_guangzhou_dining_train',
                isSuccess: false
            });
            logger.warn(
                `invalid_response trainCode=${trainCode} serviceDate=${serviceDate} detail=missing_F_TrainsId`
            );
            return null;
        }

        record12306RequestHourlyStat({
            requestType: 'fetch_guangzhou_dining_train',
            isSuccess: true
        });
        return {
            trainUuid,
            returnedTrainCode: decrypted.F_Trainno?.trim().toUpperCase() ?? ''
        };
    } catch (error) {
        record12306RequestHourlyStat({
            requestType: 'fetch_guangzhou_dining_train',
            isSuccess: false
        });
        logger.warn(
            `request_exception trainCode=${trainCode} serviceDate=${serviceDate} error=${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`
        );
        return null;
    }
}
