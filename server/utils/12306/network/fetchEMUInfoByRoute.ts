import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { resolveCanonicalEmuCode } from '~/server/services/probeAssetStore';
import { record12306RequestHourlyStat } from '~/server/services/trainProvenanceStore';
import getCurrentDateString from '../../date/getCurrentDateString';
import log12306RequestFailure from './log12306RequestFailure';
import waitFor12306RequestSlot from '../requestLimiter';

interface EMUInfoResponse {
    errMsg: string;
    httpCode: number;
    content: {
        data: {
            carType: string;
            carCode: string;
            coachPicList: Array<{
                picOrder: number;
                pictureUrl: string;
                pictureName: string;
            }>;
            coachDetailPicList: Array<{
                picOrder: number;
                pictureUrl: string;
                pictureName: string;
            }>;
            trainStyle: string;
            carInfo: Array<{
                pictureValue: string;
                picOrder: number;
                pictureUrl: string;
                pictureName: string;
            }>;
            carPic: string;
        };
        timestamp: string;
        status: number;
    };
    status: number;
}

const config = useConfig();
const logger = getLogger('12306-network:fetch-emu-info-by-route');

export default async function fetchEMUInfoByRoute(route: string) {
    const url =
        'https://mobile.12306.cn/wxxcx/openplatform-inner/miniprogram/wifiapps/appFrontEnd/v2/lounge/open-smooth-common/trainStyleBatch/getCarDetail';

    try {
        await waitFor12306RequestSlot('query');
        // 12306 endpoint requires a non-empty carCode placeholder; value does not affect query result.
        const routeProbeCarCode = config.spider.params.routeProbeCarCode;
        const response = await fetch(
            `${url}?carCode=${encodeURIComponent(routeProbeCarCode)}&trainCode=${route}&runningDay=${getCurrentDateString()}&reqType=form`,
            {
                headers: {
                    'user-agent': config.spider.userAgent
                },
                method: 'GET'
            }
        );
        if (!response.ok) {
            record12306RequestHourlyStat({
                requestType: 'fetch_emu_by_route',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                operation: 'http_failed',
                url,
                context: {
                    trainCode: route
                },
                responseStatus: response.status,
                responseOk: response.ok
            });
            return null;
        }

        const json: EMUInfoResponse = await response.json();
        const contentData = json.content?.data;
        const emuCode = contentData?.carCode?.trim();
        if (!emuCode) {
            record12306RequestHourlyStat({
                requestType: 'fetch_emu_by_route',
                isSuccess: false
            });
            log12306RequestFailure({
                logger,
                level: 'debug',
                operation: 'invalid_response',
                url,
                context: {
                    trainCode: route
                },
                responseStatus: response.status,
                responseOk: response.ok,
                businessStatus: json.status,
                errMsg: json.errMsg,
                detail: 'missing content.data or content.data.carCode'
            });
            return null;
        }

        const canonicalEmuCode = await resolveCanonicalEmuCode(emuCode);

        record12306RequestHourlyStat({
            requestType: 'fetch_emu_by_route',
            isSuccess: true
        });
        return {
            route: {
                code: route // G xxxx
            },
            emu: {
                code: canonicalEmuCode // like CR400AF-2230
            }
        };
    } catch (error) {
        record12306RequestHourlyStat({
            requestType: 'fetch_emu_by_route',
            isSuccess: false
        });
        log12306RequestFailure({
            logger,
            operation: 'request_exception',
            url,
            context: {
                trainCode: route
            },
            error
        });
        return null;
    }
}
