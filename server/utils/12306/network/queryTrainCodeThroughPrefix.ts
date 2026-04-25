import useConfig from '~/server/config';
import waitFor12306RequestSlot from '../requestLimiter';
import {
    record12306TraceRequest,
    with12306TraceFunction
} from '~/server/services/requestMetrics12306Trace';
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
    return with12306TraceFunction<
        Array<{
            route: {
                code: string;
                internalCode: string;
            };
        }> | null
    >(
        {
            title: '按前缀搜索车次',
            functionName: 'queryTrainCodeThroughPrefix',
            subject: {
                traceKey: `schedule-probe:keyword:${prefix}`,
                traceTitle: `关键词 ${prefix}`,
                traceSubtitle: '12306 search 前缀搜索'
            },
            context: {
                keyword: prefix
            },
            getSuccessContext: (result) => ({
                keyword: prefix,
                ok: !!result,
                resultCount: result?.length ?? 0
            }),
            getSuccessLevel: (result) => (result ? 'INFO' : 'WARN'),
            getSuccessStatus: (result) => (result ? 'success' : 'warning')
        },
        async () => {
            const requestStartedAtMs = Date.now();
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
                    record12306TraceRequest({
                        title: '12306 关键词搜索未命中',
                        subject: {
                            traceKey: `schedule-probe:keyword:${prefix}`,
                            traceTitle: `关键词 ${prefix}`,
                            traceSubtitle: '12306 search 前缀搜索'
                        },
                        requestType: 'search',
                        method: 'GET',
                        url,
                        operation: 'query_train_code_through_prefix',
                        responseStatus: response.status,
                        businessStatus: json.status,
                        durationMs: Date.now() - requestStartedAtMs,
                        level: 'WARN',
                        message: '12306 search 返回未成功状态',
                        context: {
                            keyword: prefix
                        },
                        errorMessage: json.errorMsg
                    });
                    return null;
                }

                const result = json.data.map((item) => {
                    return {
                        route: {
                            code: item.params.station_train_code,
                            internalCode: item.params.train_no
                        }
                    };
                });
                record12306TraceRequest({
                    title: '12306 关键词搜索成功',
                    subject: {
                        traceKey: `schedule-probe:keyword:${prefix}`,
                        traceTitle: `关键词 ${prefix}`,
                        traceSubtitle: '12306 search 前缀搜索'
                    },
                    requestType: 'search',
                    method: 'GET',
                    url,
                    operation: 'query_train_code_through_prefix',
                    responseStatus: response.status,
                    businessStatus: json.status,
                    durationMs: Date.now() - requestStartedAtMs,
                    message: '成功获取前缀搜索结果',
                    context: {
                        keyword: prefix,
                        resultCount: result.length
                    }
                });

                return result;
            } catch (error) {
                record12306TraceRequest({
                    title: '12306 关键词搜索异常',
                    subject: {
                        traceKey: `schedule-probe:keyword:${prefix}`,
                        traceTitle: `关键词 ${prefix}`,
                        traceSubtitle: '12306 search 前缀搜索'
                    },
                    requestType: 'search',
                    method: 'GET',
                    url: 'https://search.12306.cn/search/v1/h5/search',
                    operation: 'query_train_code_through_prefix',
                    durationMs: Date.now() - requestStartedAtMs,
                    level: 'WARN',
                    message: '请求抛出异常',
                    context: {
                        keyword: prefix,
                        error: error instanceof Error ? error.message : String(error)
                    },
                    errorMessage:
                        error instanceof Error ? error.message : String(error)
                });
                return null;
            }
        }
    );
}
