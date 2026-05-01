import useConfig from '~/server/config';
import waitFor12306RequestSlot from '../requestLimiter';
import parseJsonpToJson from '../../json/parseJsonpToJson';

interface TrainCodeResponse {
    data: Array<{
        word: string;
        type: string;
        districtname: string;
        url: string;
        params: {
            date: string;
            station_train_code: string;
            to_station_code: string;
            train_no: string;
            total_num: string;
            from_station: string;
            train_date: string;
            from_station_code: string;
            to_station: string;
        };
        need_login: boolean;
        image: string;
        extend: any;
        activity: any;
        more: any;
        name: any;
        gotoType: number;
        imageUrl: string;
        searchAdd: any;
    }>;
    status: boolean;
    errorMsg: string;
}

const config = useConfig();

export default async function queryTrainCodeThroughPrefix(prefix: string) {
    try {
        await waitFor12306RequestSlot('search');
        const url =
            `https://search.12306.cn/search/v1/h5/search?callback=${config.spider.params.jsonpCallback}` +
            `&keyword=${prefix}&suorce=&action=&_=${Date.now()}`;
        const response = await fetch(url, {
            headers: {
                'user-agent': config.spider.userAgent
            },
            method: 'GET'
        });
        const rawText = await response.text();
        const json = parseJsonpToJson<TrainCodeResponse>(
            rawText,
            config.spider.params.jsonpCallback
        );
        if (!json.status) {
            return null;
        }

        return json.data.map((item) => {
            return {
                route: {
                    code: item.params.station_train_code,
                    internalCode: item.params.train_no
                }
            };
        });
    } catch {
        return null;
    }
}
