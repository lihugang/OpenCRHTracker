import useConfig from '~/server/config';
import getCurrentDateString from '../../date/getCurrentDateString';
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

export default async function fetchEMUInfoByRoute(route: string) {
    try {
        await waitFor12306RequestSlot('query');
        // 12306 endpoint requires a non-empty carCode placeholder; value does not affect query result.
        const routeProbeCarCode = config.spider.params.routeProbeCarCode;
        const response = await fetch(
            `https://mobile.12306.cn/wxxcx/openplatform-inner/miniprogram/wifiapps/appFrontEnd/v2/lounge/open-smooth-common/trainStyleBatch/getCarDetail?carCode=${encodeURIComponent(routeProbeCarCode)}&trainCode=${route}&runningDay=${getCurrentDateString()}&reqType=form`,
            {
                headers: {
                    'user-agent': config.spider.userAgent
                },
                method: 'GET'
            }
        );
        const json: EMUInfoResponse = await response.json();
        if (!json.status) return null;
        return {
            route: {
                code: route // G xxxx
            },
            emu: {
                code: json.content.data.carCode // like CR400AF-2230
            }
        };
    } catch {
        return null;
    }
}
