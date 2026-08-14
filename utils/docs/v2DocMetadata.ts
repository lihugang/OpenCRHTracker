import type {
    DocsApiExample,
    DocsAuthMode,
    OpenApiParameter
} from '~/types/docs';

// ---------------------------------------------------------------------------
// v2 API 文档覆盖层
// ---------------------------------------------------------------------------
// 这份文件是“人话”部分：接口的中文描述、参数说明、示例、适用场景和常见问题
// 都维护在这里。路径、方法、响应结构等信息由生成脚本从
// 操作清单（manifest）、客户端注册表（registry）与 protobuf 定义自动推导，
// 避免两边漂移。

export interface V2DocGroup {
    key: string;
    label: string;
    tag: string;
    description: string;
}

export interface V2DocErrorResponse {
    statusCode: string;
    description: string;
    data: string;
    errorCode: string;
}

export interface V2DocEndpointMetadata {
    slug: string;
    operationName: string;
    groupKey: string;
    sortOrder: number;
    authModes: DocsAuthMode[];
    summary: string;
    description: string;
    successDescription: string;
    usageScenarios: string[];
    faq: Array<{ question: string; answer: string }>;
    parameters: OpenApiParameter[];
    examples: DocsApiExample[];
    successExample: Record<string, unknown>;
    errors: V2DocErrorResponse[];
    rawContentTypes?: string[];
    rawExample?: string;
    rawErrorShape?: boolean;
}

export const V2_DOC_GROUPS: V2DocGroup[] = [
    {
        key: 'auth',
        label: '身份',
        tag: 'Auth',
        description: '与当前登录会话、API Key 和额度状态相关的接口。'
    },
    {
        key: 'records',
        label: '记录',
        tag: 'Records',
        description: '按日期分页读取车次与车组的担当记录。'
    },
    {
        key: 'timetable',
        label: '时刻表',
        tag: 'Timetable',
        description:
            '读取车次当前时刻表、历史时刻表、车站时刻表，以及交路图图片。'
    },
    {
        key: 'history',
        label: '历史',
        tag: 'History',
        description: '按车次号或车组号查询历史担当记录。'
    },
    {
        key: 'allocation',
        label: '配属',
        tag: 'Allocation',
        description: '查询动车组的配属基础信息。'
    },
    {
        key: 'exports',
        label: '导出',
        tag: 'Exports',
        description: '列出并下载按日生成的 CSV 导出文件。'
    }
];

// ---------------------------------------------------------------------------
// 常用参数
// ---------------------------------------------------------------------------

const TRAIN_CODE_PATH_PARAM: OpenApiParameter = {
    name: 'trainCode',
    in: 'path',
    required: true,
    description:
        '要查询的车次号，例如 G2492、D2212 或 C2001。字母大小写都可以，服务端会做标准化处理。',
    schema: {
        type: 'string'
    },
    example: 'G2492'
};

const EMU_CODE_PATH_PARAM: OpenApiParameter = {
    name: 'emuCode',
    in: 'path',
    required: true,
    description:
        '要查询的车组编号，例如 CR400AF-C-2214。车组编号区分大小写，请按页面展示的格式填写。',
    schema: {
        type: 'string'
    },
    example: 'CR400AF-C-2214'
};

const STATION_NAME_PATH_PARAM: OpenApiParameter = {
    name: 'stationName',
    in: 'path',
    required: true,
    description:
        '要查询的车站名，例如 北京南。中文站名在请求时会被自动做 URL 编码，调试器里直接填中文即可。',
    schema: {
        type: 'string'
    },
    example: '北京南'
};

const DATE_PATH_PARAM: OpenApiParameter = {
    name: 'date',
    in: 'path',
    required: true,
    description:
        '要读取的日期，格式为 YYYYMMDD，例如 20260814 表示 2026 年 8 月 14 日。',
    schema: {
        type: 'string',
        pattern: '^\\d{8}$'
    },
    example: '20260814'
};

const DAILY_DATE_QUERY: OpenApiParameter = {
    name: 'date',
    in: 'query',
    required: true,
    description: '要读取的日期，格式为 YYYYMMDD，例如 20260814。',
    schema: {
        type: 'string',
        pattern: '^\\d{8}$'
    },
    example: '20260814'
};

const CURSOR_QUERY: OpenApiParameter = {
    name: 'cursor',
    in: 'query',
    description:
        '分页游标，格式为 serviceDay:id。第一页不需要传，翻页时直接复用上一页响应里的 nextCursor。serviceDay 是按上海时间自 1970-01-01 起的天数（epoch day），不是日期字符串。',
    schema: {
        type: 'string'
    }
};

const DAILY_CURSOR_QUERY: OpenApiParameter = {
    ...CURSOR_QUERY,
    description:
        '分页游标，格式为 serviceDay:id（例如 20679:1894995）。第一页不需要传，翻页时直接复用上一页响应里的 nextCursor。serviceDay 是按上海时间自 1970-01-01 起的天数（epoch day），不是日期字符串。',
    example: '20679:1894995'
};

const STATION_CURSOR_QUERY: OpenApiParameter = {
    ...CURSOR_QUERY,
    description:
        '分页游标，格式为 serviceDay:id（例如 20679:6292081551810740）。第一页不需要传，翻页时直接复用上一页响应里的 nextCursor。serviceDay 是按上海时间自 1970-01-01 起的天数（epoch day），不是日期字符串。',
    example: '20679:6292081551810740'
};

const TRAIN_HISTORY_CURSOR_QUERY: OpenApiParameter = {
    ...CURSOR_QUERY,
    description:
        '分页游标，格式为 serviceDay:id（例如 20678:1858368）。第一页不需要传，翻页时直接复用上一页响应里的 nextCursor。serviceDay 是按上海时间自 1970-01-01 起的天数（epoch day），不是日期字符串。',
    example: '20678:1858368'
};

const EMU_HISTORY_CURSOR_QUERY: OpenApiParameter = {
    ...CURSOR_QUERY,
    description:
        '分页游标，格式为 serviceDay:id（例如 20679:1880201）。第一页不需要传，翻页时直接复用上一页响应里的 nextCursor。serviceDay 是按上海时间自 1970-01-01 起的天数（epoch day），不是日期字符串。',
    example: '20679:1880201'
};

const LIMIT_QUERY: OpenApiParameter = {
    name: 'limit',
    in: 'query',
    description:
        '每一页最多返回多少条记录。不传时使用默认值 20；超过服务端配置上限（当前为 200）时会被自动截断。',
    schema: {
        type: 'integer',
        minimum: 1,
        default: 20
    },
    example: 20
};

const START_TIMESTAMP_QUERY: OpenApiParameter = {
    name: 'start',
    in: 'query',
    description: '起始时间戳，单位是秒，包含边界。留空表示从最早记录开始。',
    schema: {
        type: 'integer',
        minimum: 0
    },
    example: 1786636800
};

const END_TIMESTAMP_QUERY: OpenApiParameter = {
    name: 'end',
    in: 'query',
    description: '结束时间戳，单位是秒，包含边界。留空表示读到最新记录。',
    schema: {
        type: 'integer',
        minimum: 0
    },
    example: 1786723200
};

const EXPORT_YEAR_QUERY: OpenApiParameter = {
    name: 'year',
    in: 'query',
    description:
        '按年份筛选导出索引，例如 2026。留空时自动选择最近有导出文件的月份。',
    schema: {
        type: 'integer',
        minimum: 1
    },
    example: 2026
};

const EXPORT_MONTH_QUERY: OpenApiParameter = {
    name: 'month',
    in: 'query',
    description:
        '按月份筛选导出索引，取值 1-12。留空时自动选择最近有导出文件的月份。',
    schema: {
        type: 'integer',
        minimum: 1,
        maximum: 12
    },
    example: 8
};

const EXPORT_BINARY_QUERY: OpenApiParameter = {
    name: 'binary',
    in: 'query',
    description:
        '是否直接返回原始 CSV 文件。传 true 时响应体就是 CSV 文本，并带有下载响应头；不传或传 false 时返回 JSON 包装结构。',
    schema: {
        type: 'string',
        enum: ['true', 'false'],
        default: 'false'
    },
    example: 'false'
};

const IMAGE_FORMAT_QUERY: OpenApiParameter = {
    name: 'format',
    in: 'query',
    description: '交路图的输出格式：png 或 pdf。不传时默认使用 png。',
    schema: {
        type: 'string',
        enum: ['png', 'pdf'],
        default: 'png'
    },
    example: 'png'
};

const IMAGE_BINARY_QUERY: OpenApiParameter = {
    name: 'binary',
    in: 'query',
    description:
        '是否直接返回图片或 PDF 的原始二进制内容。传 true 时响应体就是文件本身；不传或传 false 时返回 JSON 包装结构（包含图片直链）。',
    schema: {
        type: 'string',
        enum: ['true', 'false'],
        default: 'false'
    },
    example: 'false'
};

// ---------------------------------------------------------------------------
// 通用错误响应
// ---------------------------------------------------------------------------

function error(
    statusCode: string,
    description: string,
    data: string,
    errorCode: string
): V2DocErrorResponse {
    return {
        statusCode,
        description,
        data,
        errorCode
    };
}

function commonQueryErrors(notFound?: {
    description: string;
    data: string;
}): V2DocErrorResponse[] {
    const errors = [
        error(
            '400',
            '请求参数不合法：可能是日期格式、游标格式或 limit 不符合要求。',
            'date 必须使用 YYYYMMDD 格式。',
            'invalid_param'
        ),
        error(
            '401',
            '请求未携带有效的认证信息，或提供的 API Key 已失效。',
            'API Key 无效或已过期。',
            'invalid_api_key'
        ),
        error(
            '403',
            '当前凭证缺少调用该接口所需的 scope。',
            '缺少调用该接口所需的权限。',
            'forbidden'
        ),
        error(
            '429',
            '额度不足或请求过于频繁，建议等 Retry-After 提示的时间后再试。',
            '额度不足，请稍后再试。',
            'rate_limited'
        )
    ];

    if (notFound) {
        errors.push(
            error('404', notFound.description, notFound.data, 'not_found')
        );
    }

    return errors;
}

// ---------------------------------------------------------------------------
// 11 个公开接口
// ---------------------------------------------------------------------------

export const V2_DOC_ENDPOINTS: V2DocEndpointMetadata[] = [
    {
        slug: 'auth-me',
        operationName: 'GetAuthMe',
        groupKey: 'auth',
        sortOrder: 10,
        authModes: ['cookie', 'apiKey'],
        summary: '读取当前鉴权会话',
        description:
            '返回当前登录用户、正在使用的 API Key 摘要，以及当前额度桶的状态。通常用于接入方在请求前确认自己的凭证是否仍然有效。',
        successDescription: '当前鉴权会话信息。',
        usageScenarios: [
            '第三方应用拿到 access_token 后，先调用这个接口确认凭证有效、额度还剩多少。',
            '前端页面在启动时判断用户是否已登录。',
            '开发者调试自己签发的 API Key 是否配置正确。'
        ],
        faq: [
            {
                question: '为什么调用这个接口也能看到额度？',
                answer: '每次响应都会带 meta 字段，里面是本次请求后的剩余额度（remain）、本次扣费（cost）和可能的重试等待时间（retryAfter）。'
            },
            {
                question: 'issuer 字段表示什么？',
                answer: '它说明这份凭证是怎么来的：webapp 表示网页登录会话，api 表示站内签发的 API Key，oauth 表示通过 OAuth 授权拿到的 access_token。'
            }
        ],
        parameters: [],
        examples: [
            {
                id: 'auth-me-cookie',
                label: '网页会话',
                summary: '使用当前浏览器登录会话读取会话信息。',
                authMode: 'cookie'
            },
            {
                id: 'auth-me-api-key',
                label: 'API Key',
                summary: '使用 API Key 读取当前凭证对应的会话信息。',
                authMode: 'apiKey'
            }
        ],
        successExample: {
            meta: {
                remain: 2000,
                cost: 1
            },
            data: {
                user: {
                    userId: 'demo-user'
                },
                apiKey: {
                    revokeId: 'ocrh_revoke_9f4f1c8c4d5a4f43',
                    issuer: 'webapp',
                    maskedApiKey: 'ocrh_u_abc***xyz',
                    activeFrom: 1786636800,
                    expiresAt: 1789228800,
                    dailyTokenLimit: 2000,
                    scopes: ['api.auth.me.read', 'api.records.daily.read']
                },
                quota: {
                    tokenLimit: 2000,
                    remain: 1999,
                    refillAmount: 10,
                    refillIntervalSeconds: 300,
                    nextRefillAt: 1786637100
                }
            }
        },
        errors: [
            error(
                '401',
                '请求未携带有效的认证信息，或提供的 API Key 已失效。',
                'API Key 无效或已过期。',
                'invalid_api_key'
            ),
            error(
                '403',
                '账号已被封禁，或当前凭证缺少 api.auth.me.read 权限。',
                '账号已被封禁。',
                'account_banned'
            ),
            error(
                '429',
                '额度不足或请求过于频繁。',
                '额度不足，请稍后再试。',
                'rate_limited'
            )
        ]
    },
    {
        slug: 'records-daily',
        operationName: 'GetDailyRecords',
        groupKey: 'records',
        sortOrder: 20,
        authModes: ['anonymous', 'cookie', 'apiKey'],
        summary: '分页读取每日记录',
        description:
            '读取某一天里所有车次与车组的担当记录。每一条记录表示一个车次在某一天由某个车组担当，适合做数据同步或离线分析。',
        successDescription: '一页每日记录数据。',
        usageScenarios: [
            '按天拉取全量担当数据，建立自己的车次-车组对应关系表。',
            '做一个“某天所有车次都用了哪些车组”的查询页面。'
        ],
        faq: [
            {
                question: 'items 里的 emuId 和 trainCode 怎么理解？',
                answer: '为了减少重复数据，记录里存的是车组 ID（emuId）和结构化的车次号（trainCode），对应的车组编号和时刻表摘要分别放在 emuCodeMappings 与 timetableMappings 里，按 ID 查表即可。'
            },
            {
                question: 'serviceDay 为什么是数字而不是日期字符串？',
                answer: 'serviceDay 表示服务日期，是按上海时间自 1970-01-01 起的天数（epoch day），例如 2026-08-14 对应 20679。它只是内部表示，需要展示日期时再换算即可。'
            }
        ],
        parameters: [DAILY_DATE_QUERY, LIMIT_QUERY, DAILY_CURSOR_QUERY],
        examples: [
            {
                id: 'daily-first-page',
                label: '第一页',
                summary: '不额外携带身份信息，直接读取某一天的第一页数据。',
                authMode: 'anonymous',
                query: {
                    date: '20260814',
                    limit: '2'
                }
            },
            {
                id: 'daily-next-page',
                label: '下一页',
                summary: '复用服务端返回的 cursor，继续读取下一页每日记录。',
                authMode: 'anonymous',
                query: {
                    date: '20260814',
                    limit: '2',
                    cursor: '20679:1894995'
                }
            }
        ],
        successExample: {
            ok: true,
            data: {
                serviceDay: 20679,
                cursor: '',
                limit: 2,
                nextCursor: '20679:1894995',
                items: [
                    {
                        id: 1894996,
                        serviceDay: 20679,
                        timetableId: 1075,
                        emuId: 3378,
                        trainCode: {
                            prefix: 'G',
                            number: 7309
                        }
                    },
                    {
                        id: 1894995,
                        serviceDay: 20679,
                        timetableId: 1075,
                        emuId: 3522,
                        trainCode: {
                            prefix: 'G',
                            number: 7309
                        }
                    }
                ],
                emuCodeMappings: {
                    '3378': 'CRH380B-3602',
                    '3522': 'CRH380B-3752'
                },
                timetableMappings: {
                    '1075': {
                        startStation: '上海南',
                        endStation: '杭州东',
                        startOffset: 82500,
                        endOffset: 85320
                    }
                }
            },
            error: ''
        },
        errors: commonQueryErrors()
    },
    {
        slug: 'timetable-train-current',
        operationName: 'GetCurrentTrainTimetable',
        groupKey: 'timetable',
        sortOrder: 25,
        authModes: ['anonymous', 'cookie', 'apiKey'],
        summary: '按车次读取当前完整时刻表',
        description:
            '返回某车次当前的完整时刻表，包括经停站、各站到达/发车时间、检票口、站台、参考车型，以及交路信息。适合做列车详情页。',
        successDescription: '当前日期下的完整车次时刻表。',
        usageScenarios: [
            '做一个列车详情页，展示某车次今天从始发到终点的全部经停信息。',
            '结合 referenceModels 展示该车次可能使用的车型。',
            '展示车次所在的交路（circulation），让用户知道这列车当天还跑哪些车次。'
        ],
        faq: [
            {
                question: 'stops 里 stationTrainCode 为什么是对象？',
                answer: 'v2 用 { prefix, number } 表示结构化车次号，例如 G2492 就是 { prefix: "G", number: 2492 }，方便程序处理而不需要解析字符串。'
            },
            {
                question: '有些站的 distance 或 platformNo 没有返回？',
                answer: '这两个字段是可选的：没有数据时字段会直接省略，而不是返回 null，这也是 v2 的通用约定。'
            }
        ],
        parameters: [TRAIN_CODE_PATH_PARAM],
        examples: [
            {
                id: 'timetable-by-train-code',
                label: '当前时刻表',
                summary: '读取一趟车次的完整经停表，可用于详情页展示。',
                authMode: 'anonymous',
                pathParams: {
                    trainCode: 'G2492'
                }
            },
            {
                id: 'timetable-by-train-code-d',
                label: '动车组车次',
                summary: '读取一趟动车组车次的当前时刻表。',
                authMode: 'anonymous',
                pathParams: {
                    trainCode: 'D2212'
                }
            }
        ],
        successExample: {
            ok: true,
            data: {
                updatedAt: 1786672375,
                requestTrainCode: {
                    prefix: 'G',
                    number: 2492
                },
                trainCode: {
                    prefix: 'G',
                    number: 2492
                },
                internalCode: '33000G249204',
                allCodes: [
                    {
                        prefix: 'G',
                        number: 2492
                    }
                ],
                bureauCode: 'C',
                bureauName: '呼和浩特局集团',
                trainDepartment: '包头车辆段',
                passengerDepartment: '包头客运段',
                referenceModels: [
                    {
                        model: 'CR400BF-G',
                        weightedShare: 1
                    }
                ],
                startStation: '包头',
                endStation: '北京北',
                startAt: 1786663920,
                endAt: 1786675800,
                circulation: {
                    source: 'official',
                    refreshAt: 1786622308,
                    nodes: [
                        {
                            internalCode: '33000G249204',
                            allCodes: [
                                {
                                    prefix: 'G',
                                    number: 2492
                                }
                            ],
                            startStation: '包头',
                            endStation: '北京北',
                            startAt: 27120,
                            endAt: 39000
                        },
                        {
                            internalCode: '24000G249307',
                            allCodes: [
                                {
                                    prefix: 'G',
                                    number: 2493
                                }
                            ],
                            startStation: '北京北',
                            endStation: '包头',
                            startAt: 42840,
                            endAt: 56220
                        },
                        {
                            internalCode: '33000G249608',
                            allCodes: [
                                {
                                    prefix: 'G',
                                    number: 2496
                                }
                            ],
                            startStation: '包头',
                            endStation: '北京北',
                            startAt: 58560,
                            endAt: 73080
                        },
                        {
                            internalCode: '24000G249109',
                            allCodes: [
                                {
                                    prefix: 'G',
                                    number: 2491
                                }
                            ],
                            startStation: '北京北',
                            endStation: '包头',
                            startAt: 117120,
                            endAt: 130020
                        },
                        {
                            internalCode: '33000G249408',
                            allCodes: [
                                {
                                    prefix: 'G',
                                    number: 2494
                                }
                            ],
                            startStation: '包头',
                            endStation: '北京北',
                            startAt: 131640,
                            endAt: 145560
                        },
                        {
                            internalCode: '24000G249505',
                            allCodes: [
                                {
                                    prefix: 'G',
                                    number: 2495
                                }
                            ],
                            startStation: '北京北',
                            endStation: '包头',
                            startAt: 147300,
                            endAt: 159120
                        },
                        {
                            internalCode: '33000D67580J',
                            allCodes: [
                                {
                                    prefix: 'D',
                                    number: 6758
                                }
                            ],
                            startStation: '包头',
                            endStation: '呼和浩特东',
                            startAt: 160680,
                            endAt: 165300
                        }
                    ],
                    metadata: {
                        validationState: 'raw_official',
                        originalOfficialEntryKey: '33000G249608',
                        matchedInferredRouteId: 'circulation_fb7bd969'
                    }
                },
                stops: [
                    {
                        stationNo: 1,
                        stationName: '包头',
                        departAt: 1786663920,
                        stationTrainCode: {
                            prefix: 'G',
                            number: 2492
                        },
                        wicket: '一层2检票口',
                        distance: 0,
                        platformNo: 1,
                        isStart: true,
                        isEnd: false
                    },
                    {
                        stationNo: 2,
                        stationName: '呼和浩特',
                        arriveAt: 1786667460,
                        departAt: 1786667760,
                        stationTrainCode: {
                            prefix: 'G',
                            number: 2492
                        },
                        wicket: '3检票口,4检票口',
                        distance: 165,
                        platformNo: 4,
                        isStart: false,
                        isEnd: false
                    },
                    {
                        stationNo: 3,
                        stationName: '北京北',
                        arriveAt: 1786675800,
                        stationTrainCode: {
                            prefix: 'G',
                            number: 2492
                        },
                        wicket: '1检票口',
                        distance: 633,
                        platformNo: 4,
                        isStart: false,
                        isEnd: true
                    }
                ],
                serviceDay: 20679
            },
            error: ''
        },
        errors: commonQueryErrors({
            description: '当前时刻表暂不可用。',
            data: '当前暂无时刻表。'
        })
    },
    {
        slug: 'timetable-train-circulation-image',
        operationName: 'GetTrainCirculationImage',
        groupKey: 'timetable',
        sortOrder: 26,
        authModes: ['anonymous', 'cookie', 'apiKey'],
        summary: '获取交路图图片',
        description:
            '根据车次的交路表和首末站坐标生成交路图。默认返回 JSON 包装结构（含图片直链），也可以让接口直接返回 PNG 或 PDF 文件内容。',
        successDescription:
            '交路图生成成功：JSON 包装结构或原始图片/PDF 文件。',
        usageScenarios: [
            '在页面里直接展示交路图：使用默认的 JSON 返回，取 imageUrl 放进 <img>。',
            '把交路图下载成 PDF 存档或打印：设置 format=pdf。',
            '程序直接保存图片文件：设置 binary=true 并写入本地文件。'
        ],
        faq: [
            {
                question: 'binary 应该怎么选？',
                answer: '需要图片直链时用 binary=false（默认）；需要直接拿到文件内容时用 binary=true。两者都支持 format=png 或 format=pdf。'
            },
            {
                question: '为什么有时扣费是 2 点，有时是 20 点？',
                answer: '交路图由上游编译服务渲染。缓存命中时按缓存档位扣费（较低），未命中时按完整渲染成本扣费（较高），失败时按失败档位扣费。'
            }
        ],
        parameters: [
            TRAIN_CODE_PATH_PARAM,
            IMAGE_FORMAT_QUERY,
            IMAGE_BINARY_QUERY
        ],
        examples: [
            {
                id: 'circulation-image-json',
                label: '图片地址',
                summary: '返回交路图图片直链，适合在页面中直接展示。',
                authMode: 'anonymous',
                pathParams: {
                    trainCode: 'G2492'
                },
                query: {
                    binary: 'false'
                }
            },
            {
                id: 'circulation-image-pdf-json',
                label: 'PDF 地址',
                summary: '返回交路图 PDF 直链，适合交给下载器或文档预览组件。',
                authMode: 'anonymous',
                pathParams: {
                    trainCode: 'G2492'
                },
                query: {
                    format: 'pdf',
                    binary: 'false'
                }
            },
            {
                id: 'circulation-image-binary',
                label: '原始 PNG',
                summary: '直接返回 PNG 二进制内容，适合下载或转存。',
                authMode: 'anonymous',
                pathParams: {
                    trainCode: 'G2492'
                },
                query: {
                    binary: 'true'
                }
            },
            {
                id: 'circulation-image-binary-pdf',
                label: '原始 PDF',
                summary: '直接返回 PDF 二进制内容，适合下载或打印。',
                authMode: 'anonymous',
                pathParams: {
                    trainCode: 'G2492'
                },
                query: {
                    format: 'pdf',
                    binary: 'true'
                }
            }
        ],
        successExample: {
            meta: {
                remain: 159,
                cost: 2
            },
            data: {
                cacheHit: false,
                requestTrainCode: {
                    prefix: 'G',
                    number: 2492
                },
                trainCode: {
                    prefix: 'G',
                    number: 2492
                },
                documentId:
                    '8d2fca6e88c2a1e3c2106a4f28f0d5e7b3147427ec8d1b4af75a4b6b485b92ce',
                imageUrl:
                    'https://static.example.com/circulation/8d2fca6e88c2a1e3c2106a4f28f0d5e7b3147427ec8d1b4af75a4b6b485b92ce/png/1'
            }
        },
        rawContentTypes: ['image/png', 'application/pdf'],
        rawErrorShape: true,
        errors: [
            error(
                '400',
                '路径参数、binary 查询参数或 format 查询参数无效。',
                'binary 必须是 true/false',
                'invalid_param'
            ),
            error(
                '401',
                '请求未携带有效的认证信息，或提供的 API Key 已失效。',
                'API Key 无效或已过期。',
                'invalid_api_key'
            ),
            error(
                '403',
                '当前凭证缺少调用该接口所需的 scope。',
                '缺少调用该接口所需的权限。',
                'forbidden'
            ),
            error(
                '404',
                '当前时刻表或交路数据不可用。',
                '当前暂无交路数据',
                'not_found'
            ),
            error(
                '422',
                '今日时刻表数据不完整，无法生成交路图。',
                '交路节点 G2492 的首末站缺少经纬度',
                'invalid_schedule_data'
            ),
            error(
                '429',
                '额度不足或请求过于频繁。',
                '额度不足，请稍后再试。',
                'rate_limited'
            ),
            error(
                '502',
                '上游渲染服务不可用或编译失败。',
                '交路图渲染服务暂时不可用',
                'upstream_unavailable'
            )
        ]
    },
    {
        slug: 'timetable-train-history',
        operationName: 'GetTrainTimetableHistory',
        groupKey: 'timetable',
        sortOrder: 27,
        authModes: ['anonymous', 'cookie', 'apiKey'],
        summary: '按车次读取历史时刻表',
        description:
            '返回指定车次的历史时刻表覆盖范围，并通过 timetableMappings 一并返回每份历史时刻表的完整内容（包含全部经停站）。v2 已把“历史时刻表详情”合并进这个接口，不需要再单独请求一次。',
        successDescription: '车次历史时刻表覆盖范围与完整内容。',
        usageScenarios: [
            '展示某车次历史上使用过哪些时刻表，以及每份时刻表的生效日期范围。',
            '把某一天的历史时刻表内容（如经停站）拉出来做对比或归档。'
        ],
        faq: [
            {
                question:
                    'items 里的 serviceDayStart 和 serviceDayEndExclusive 是什么意思？',
                answer: '它们表示这份时刻表的生效区间：从 serviceDayStart 当天开始，到 serviceDayEndExclusive 当天之前结束，即结束日期不包含在区间内。这两个值都是按上海时间自 1970-01-01 起的天数（epoch day），例如 20575 对应 2026-05-02。'
            },
            {
                question: '为什么历史详情没有单独的接口了？',
                answer: 'v2 把历史时刻表的内容直接放在 timetableMappings 里，与覆盖范围一起返回。mapping 的 key 就是 items 里的 timetableId，取出来后就是完整内容。'
            }
        ],
        parameters: [TRAIN_CODE_PATH_PARAM],
        examples: [
            {
                id: 'train-history-first-page',
                label: '历史清单',
                summary: '读取指定车次的历史时刻表覆盖范围列表。',
                authMode: 'anonymous',
                pathParams: {
                    trainCode: 'G512'
                }
            },
            {
                id: 'train-history-d',
                label: '动车组车次',
                summary: '读取另一趟车次的历史时刻表。',
                authMode: 'anonymous',
                pathParams: {
                    trainCode: 'D3319'
                }
            }
        ],
        successExample: {
            ok: true,
            data: {
                trainCode: {
                    prefix: 'G',
                    number: 512
                },
                items: [
                    {
                        coverageId: 6845,
                        timetableId: 5479,
                        serviceDayStart: 20575,
                        serviceDayEndExclusive: 20680
                    }
                ],
                timetableMappings: {
                    '5479': {
                        timetableId: 5479,
                        startStation: '汉口',
                        endStation: '北京西',
                        startOffset: 47340,
                        endOffset: 66060,
                        stops: [
                            {
                                stationNo: 1,
                                stationName: '汉口',
                                departOffset: 47340,
                                stationTrainCode: {
                                    prefix: 'G',
                                    number: 512
                                },
                                isStart: true,
                                isEnd: false
                            },
                            {
                                stationNo: 2,
                                stationName: '许昌东',
                                arriveOffset: 53040,
                                departOffset: 53760,
                                stationTrainCode: {
                                    prefix: 'G',
                                    number: 512
                                },
                                isStart: false,
                                isEnd: false
                            },
                            {
                                stationNo: 3,
                                stationName: '郑州东',
                                arriveOffset: 55140,
                                departOffset: 55320,
                                stationTrainCode: {
                                    prefix: 'G',
                                    number: 512
                                },
                                isStart: false,
                                isEnd: false
                            },
                            {
                                stationNo: 4,
                                stationName: '高邑西',
                                arriveOffset: 60120,
                                departOffset: 60240,
                                stationTrainCode: {
                                    prefix: 'G',
                                    number: 512
                                },
                                isStart: false,
                                isEnd: false
                            },
                            {
                                stationNo: 5,
                                stationName: '石家庄',
                                arriveOffset: 61140,
                                departOffset: 61320,
                                stationTrainCode: {
                                    prefix: 'G',
                                    number: 512
                                },
                                isStart: false,
                                isEnd: false
                            },
                            {
                                stationNo: 6,
                                stationName: '保定东',
                                arriveOffset: 63420,
                                departOffset: 63540,
                                stationTrainCode: {
                                    prefix: 'G',
                                    number: 512
                                },
                                isStart: false,
                                isEnd: false
                            },
                            {
                                stationNo: 7,
                                stationName: '北京西',
                                arriveOffset: 66060,
                                stationTrainCode: {
                                    prefix: 'G',
                                    number: 512
                                },
                                isStart: false,
                                isEnd: true
                            }
                        ]
                    }
                }
            },
            error: ''
        },
        errors: commonQueryErrors()
    },
    {
        slug: 'timetable-station',
        operationName: 'GetStationTimetable',
        groupKey: 'timetable',
        sortOrder: 28,
        authModes: ['anonymous', 'cookie', 'apiKey'],
        summary: '按车站读取当日站内时刻表',
        description:
            '返回指定车站当日的计划车次列表，按列车到站时间升序排列，并附上每趟车的参考车型。适合做车站查询页。',
        successDescription: '指定车站的当日站内时刻表分页结果。',
        usageScenarios: [
            '做一个车站查询页，展示某站今天所有经停车次及时间。',
            '配合站点搜索，让用户从搜索结果直接跳到车站时刻表。'
        ],
        faq: [
            {
                question: '同一趟车在 stationName 里为什么会有多个 allCodes？',
                answer: 'allCodes 表示该趟车当天可能使用的全部车次号（例如中途换号），列表里的第一个通常就是当前显示的车次号。'
            },
            {
                question: '列表按什么顺序排列？',
                answer: '按列车到站时间升序排列。始发站没有到站时间时，会按发车时间参与排序。'
            }
        ],
        parameters: [
            STATION_NAME_PATH_PARAM,
            LIMIT_QUERY,
            STATION_CURSOR_QUERY
        ],
        examples: [
            {
                id: 'timetable-by-station',
                label: '车站页首屏',
                summary: '读取指定车站当日已发布时刻表中的首屏结果。',
                authMode: 'anonymous',
                pathParams: {
                    stationName: '北京南'
                },
                query: {
                    limit: '1'
                }
            },
            {
                id: 'timetable-by-station-next-page',
                label: '车站页下一页',
                summary:
                    '复用上一页返回的 cursor，继续读取同一车站的后续数据。',
                authMode: 'anonymous',
                pathParams: {
                    stationName: '北京南'
                },
                query: {
                    limit: '1',
                    cursor: '20679:6292081551810740'
                }
            }
        ],
        successExample: {
            ok: true,
            data: {
                stationName: '北京南',
                cursor: '',
                limit: 1,
                nextCursor: '20679:6292081551810740',
                items: [
                    {
                        trainCode: {
                            prefix: 'G',
                            number: 9418
                        },
                        allCodes: [
                            {
                                prefix: 'G',
                                number: 9418
                            }
                        ],
                        arriveAt: 1786723260,
                        startStation: '天津西',
                        endStation: '北京南',
                        updatedAt: 1786717003,
                        referenceModels: [
                            {
                                model: 'CR400AF-B',
                                weightedShare: 1
                            }
                        ]
                    }
                ]
            },
            error: ''
        },
        errors: commonQueryErrors({
            description: '指定车站暂无当日时刻表数据。',
            data: '当前暂无该车站的时刻表。'
        })
    },
    {
        slug: 'history-train',
        operationName: 'GetTrainHistory',
        groupKey: 'history',
        sortOrder: 30,
        authModes: ['anonymous', 'cookie', 'apiKey'],
        summary: '返回单个车次的历史担当记录',
        description:
            '按车次号分页查询历史担当记录，也就是“这趟车在过去每一天由哪个车组担当”。支持用时间范围过滤，也支持游标翻页。',
        successDescription: '一页车次历史记录。',
        usageScenarios: [
            '做“某车次近期担当车组”的时间线展示。',
            '统计某趟车在一段时间内使用过哪些车型或车组。'
        ],
        faq: [
            {
                question: 'start 和 end 都留空会怎样？',
                answer: '表示不限制时间范围，从最早记录开始读到最新记录。想限定范围时，两个参数都传会更可靠。'
            },
            {
                question: '为什么记录里只有 emuId 而不是车组编号？',
                answer: '车组编号放在 emuCodeMappings 里按 ID 查询，这样大量重复的车组编号只需要保存一次，响应体积更小。'
            }
        ],
        parameters: [
            TRAIN_CODE_PATH_PARAM,
            START_TIMESTAMP_QUERY,
            END_TIMESTAMP_QUERY,
            LIMIT_QUERY,
            TRAIN_HISTORY_CURSOR_QUERY
        ],
        examples: [
            {
                id: 'train-first-page',
                label: '第一页',
                summary: '读取单个车次最新的历史担当记录。',
                authMode: 'anonymous',
                pathParams: {
                    trainCode: 'G512'
                },
                query: {
                    limit: '2'
                }
            },
            {
                id: 'train-cursor',
                label: '游标翻页',
                summary: '使用 cursor 继续读取同一车次的后续历史记录。',
                authMode: 'anonymous',
                pathParams: {
                    trainCode: 'G512'
                },
                query: {
                    limit: '2',
                    cursor: '20678:1858368'
                }
            }
        ],
        successExample: {
            ok: true,
            data: {
                trainCode: {
                    prefix: 'G',
                    number: 512
                },
                cursor: '',
                limit: 2,
                nextCursor: '20678:1858368',
                items: [
                    {
                        id: 1886130,
                        serviceDay: 20679,
                        timetableId: 5479,
                        emuId: 1540
                    },
                    {
                        id: 1858368,
                        serviceDay: 20678,
                        timetableId: 5479,
                        emuId: 1544
                    }
                ],
                emuCodeMappings: {
                    '1540': 'CR400BF-AZ-0518',
                    '1544': 'CR400BF-AZ-5253'
                },
                timetableMappings: {
                    '5479': {
                        startStation: '汉口',
                        endStation: '北京西',
                        startOffset: 47340,
                        endOffset: 66060
                    }
                }
            },
            error: ''
        },
        errors: commonQueryErrors()
    },
    {
        slug: 'allocation-emu',
        operationName: 'GetEmuAllocation',
        groupKey: 'allocation',
        sortOrder: 35,
        authModes: ['anonymous', 'cookie', 'apiKey'],
        summary: '返回单一车组的配属信息',
        description:
            '返回一个动车组的配属基础信息，包括车型、配属路局、动车段/所、制造商、速度等级、座椅与服务设施，以及车厢布局。',
        successDescription: '动车组配属基础信息。',
        usageScenarios: [
            '做车组详情页，展示车型、配属和车厢布局。',
            '根据 designMaxSpeed 与 operatingMaxSpeed 判断车组适用线路。',
            '展示 coachLayouts，帮助乘客了解车厢座席类型与充电设施。'
        ],
        faq: [
            {
                question: 'emuCodeMappings 在这里有什么用？',
                answer: '接口支持别名查询：你传入的编号会被标准化成 emuId，然后通过 emuCodeMappings 返回对应的标准车组编号，方便确认查询结果。'
            },
            {
                question: '为什么有些字段是空字符串？',
                answer: 'v2 约定隐式字段（如 subModel、customType、note）总是返回，没有数据时返回默认值（空字符串、0 或 false），可选项才会省略。'
            }
        ],
        parameters: [EMU_CODE_PATH_PARAM],
        examples: [
            {
                id: 'emu-allocation-profile',
                label: '配属信息',
                summary: '读取单一车组的配属基础信息。',
                authMode: 'anonymous',
                pathParams: {
                    emuCode: 'CR400AF-C-2214'
                }
            }
        ],
        successExample: {
            ok: true,
            data: {
                emuId: 954,
                emuCodeMappings: {
                    '954': 'CR400AF-C-2214'
                },
                model: 'CR400AF-C',
                trainSetNo: '2214',
                bureau: '北京局集团',
                trainDepot: '北京动车段',
                depot: '雄安动车所',
                subModel: '',
                customType: '',
                trainsetManufacturer: '中车青岛四方',
                trailerManufacturer: '中车青岛四方',
                manufactureMonth: '2020-09',
                designMaxSpeed: 350,
                operatingMaxSpeed: 310,
                isPublic: true,
                railwayTravelCodeEnabled: true,
                firstClassPowerLegrest: true,
                toiletStatus: '蹲厕、马桶均有',
                socketLocation:
                    '洗手台（插座）；二等座：坐垫接缝处（插座、USB Type A），前排座椅后背（USB Type A）；一等座：座椅扶手前端（插座、USB Type A），前排座椅后背（USB Type A）',
                businessSeatType: '鱼骨式',
                modelRemark: '本车座椅靠背硬度较大，可能导致一定程度不适。',
                note: '',
                tags: ['京雄城际定制', 'ATO'],
                alias: [],
                coachLayouts: [
                    {
                        coachNo: 1,
                        coachTypeCode: 'ZYS',
                        coachTypeName: '一等/商务座车',
                        capacity: 34,
                        hasPower: false,
                        hasPantograph: false,
                        hasLargeLuggageArea: false,
                        hasAccessibleFacility: false
                    },
                    {
                        coachNo: 2,
                        coachTypeCode: 'ZE',
                        coachTypeName: '二等座车',
                        capacity: 90,
                        hasPower: true,
                        hasPantograph: false,
                        hasLargeLuggageArea: false,
                        hasAccessibleFacility: false
                    },
                    {
                        coachNo: 3,
                        coachTypeCode: 'ZE',
                        coachTypeName: '二等座车',
                        capacity: 90,
                        hasPower: false,
                        hasPantograph: true,
                        hasLargeLuggageArea: false,
                        hasAccessibleFacility: false
                    },
                    {
                        coachNo: 4,
                        coachTypeCode: 'ZE',
                        coachTypeName: '二等座车',
                        capacity: 75,
                        hasPower: true,
                        hasPantograph: false,
                        hasLargeLuggageArea: true,
                        hasAccessibleFacility: true
                    },
                    {
                        coachNo: 5,
                        coachTypeCode: 'ZEC',
                        coachTypeName: '二等座车/餐车',
                        capacity: 63,
                        hasPower: true,
                        hasPantograph: false,
                        hasLargeLuggageArea: false,
                        hasAccessibleFacility: false
                    },
                    {
                        coachNo: 6,
                        coachTypeCode: 'ZE',
                        coachTypeName: '二等座车',
                        capacity: 90,
                        hasPower: false,
                        hasPantograph: true,
                        hasLargeLuggageArea: false,
                        hasAccessibleFacility: false
                    },
                    {
                        coachNo: 7,
                        coachTypeCode: 'ZE',
                        coachTypeName: '二等座车',
                        capacity: 90,
                        hasPower: true,
                        hasPantograph: false,
                        hasLargeLuggageArea: false,
                        hasAccessibleFacility: false
                    },
                    {
                        coachNo: 8,
                        coachTypeCode: 'ZES',
                        coachTypeName: '二等/商务座车',
                        capacity: 46,
                        hasPower: false,
                        hasPantograph: false,
                        hasLargeLuggageArea: false,
                        hasAccessibleFacility: false
                    }
                ]
            },
            error: ''
        },
        errors: commonQueryErrors({
            description: '未找到该动车组的配属信息。',
            data: '未找到该动车组配属信息'
        })
    },
    {
        slug: 'history-emu',
        operationName: 'GetEmuHistory',
        groupKey: 'history',
        sortOrder: 40,
        authModes: ['anonymous', 'cookie', 'apiKey'],
        summary: '返回单一车组的历史担当记录',
        description:
            '按车组号分页查询历史担当记录，也就是“这个车组在过去每一天跑了哪些车次”。支持时间范围过滤和游标翻页。',
        successDescription: '一页车组历史记录。',
        usageScenarios: [
            '做车组详情页的历史担当时间线。',
            '追踪某个车组近期的运用轨迹，判断它常跑哪些线路。'
        ],
        faq: [
            {
                question: 'items 里的 trainCode 为什么是对象？',
                answer: 'v2 统一用 { prefix, number } 表示结构化车次号。需要展示时拼成字符串即可，例如 prefix 为 "G"、number 为 1824 时就是 G1824。'
            },
            {
                question: '为什么会出现同一服务日有多条记录？',
                answer: '同一车组一天可能担当多趟车次，每趟车都会产生一条记录，所以同一天出现多条是正常的。'
            }
        ],
        parameters: [
            EMU_CODE_PATH_PARAM,
            START_TIMESTAMP_QUERY,
            END_TIMESTAMP_QUERY,
            LIMIT_QUERY,
            EMU_HISTORY_CURSOR_QUERY
        ],
        examples: [
            {
                id: 'emu-first-page',
                label: '第一页',
                summary: '读取单一车组最新的历史担当记录。',
                authMode: 'anonymous',
                pathParams: {
                    emuCode: 'CR400BF-A-5156'
                },
                query: {
                    limit: '2'
                }
            },
            {
                id: 'emu-cursor',
                label: '游标翻页',
                summary: '使用 cursor 继续读取同一车组的后续历史记录。',
                authMode: 'anonymous',
                pathParams: {
                    emuCode: 'CR400BF-A-5156'
                },
                query: {
                    limit: '2',
                    cursor: '20679:1880201'
                }
            }
        ],
        successExample: {
            ok: true,
            data: {
                emuId: 1500,
                cursor: '',
                limit: 2,
                nextCursor: '20679:1880201',
                items: [
                    {
                        id: 1880202,
                        serviceDay: 20679,
                        timetableId: 18287,
                        trainCode: {
                            prefix: 'G',
                            number: 240
                        }
                    },
                    {
                        id: 1880201,
                        serviceDay: 20679,
                        timetableId: 18287,
                        trainCode: {
                            prefix: 'G',
                            number: 237
                        }
                    }
                ],
                emuCodeMappings: {
                    '1500': 'CR400BF-A-5156'
                },
                timetableMappings: {
                    '18287': {
                        startStation: '上海虹桥',
                        endStation: '成都东',
                        startOffset: 32640,
                        endOffset: 70500
                    }
                }
            },
            error: ''
        },
        errors: commonQueryErrors()
    },
    {
        slug: 'exports-daily-index',
        operationName: 'GetDailyExportIndex',
        groupKey: 'exports',
        sortOrder: 50,
        authModes: ['anonymous', 'cookie', 'apiKey'],
        summary: '列出可用的日导出文件',
        description:
            '按年和月列出已生成的日导出文件。接口会返回当前选中的年月、可选年份和月份，以及该月每一天是否有导出文件。',
        successDescription: '当前可用的导出日期索引。',
        usageScenarios: [
            '在接入前先查询哪些日期有导出文件，避免请求不存在的日期。',
            '给导出页做一个年月选择器，年份和月份直接来自 availableYears 和 availableMonths。'
        ],
        faq: [
            {
                question: '不传 year 和 month 会怎样？',
                answer: '服务端会自动选择最近有导出文件的一年一月，并把 selectedYear、selectedMonth 返回给你。'
            },
            {
                question: 'items 里的 serviceDay 是什么？',
                answer: '它表示有导出文件的日期，是按上海时间自 1970-01-01 起的天数（epoch day），例如 20679 对应 2026-08-14。需要展示日期时再换算，不要直接当日期字符串用。'
            }
        ],
        parameters: [EXPORT_YEAR_QUERY, EXPORT_MONTH_QUERY],
        examples: [
            {
                id: 'latest-month',
                label: '最近月份',
                summary: '不带筛选条件，读取最近可用的导出月份。',
                authMode: 'anonymous'
            },
            {
                id: 'selected-month',
                label: '指定月份',
                summary: '按年份和月份筛选导出索引。',
                authMode: 'anonymous',
                query: {
                    year: '2026',
                    month: '8'
                }
            }
        ],
        successExample: {
            meta: {
                remain: 159,
                cost: 10
            },
            data: {
                selectedYear: 2026,
                selectedMonth: 8,
                availableYears: [2024, 2025, 2026],
                availableMonths: [1, 2, 3, 4, 5, 6, 7, 8],
                items: [
                    {
                        serviceDay: 20679
                    },
                    {
                        serviceDay: 20678
                    }
                ]
            }
        },
        errors: commonQueryErrors()
    },
    {
        slug: 'exports-daily-date',
        operationName: 'GetDailyExport',
        groupKey: 'exports',
        sortOrder: 60,
        authModes: ['anonymous', 'cookie', 'apiKey'],
        summary: '读取单日导出文件',
        description:
            '读取某一天的车次-车组对应关系导出文件。默认返回 JSON 包装结构（CSV 文本放在 content 字段里），也可以让接口直接返回原始 CSV 文本并附带下载响应头。',
        successDescription: '单日导出内容：JSON 包装结构或原始 CSV 文本。',
        usageScenarios: [
            '下载某一天的完整担当数据做离线分析。',
            '把 CSV 直接交给数据库导入工具：使用 binary=true 会拿到干净的文件内容。'
        ],
        faq: [
            {
                question: '为什么导出格式只有 CSV？',
                answer: 'v2 的日导出统一为 CSV，不再提供 JSONL 选项。需要结构化数据时，可以先用索引接口确定日期，再解析 CSV 内容。'
            },
            {
                question: 'total 和 content 分别是什么？',
                answer: 'total 是当天导出文件里的记录条数，content 是 CSV 文本本身。JSON 包装模式下两者都会返回。'
            }
        ],
        parameters: [DATE_PATH_PARAM, EXPORT_BINARY_QUERY],
        examples: [
            {
                id: 'export-json',
                label: 'JSON 包装',
                summary: '以标准 JSON 包装结构读取导出内容。',
                authMode: 'anonymous',
                pathParams: {
                    date: '20260814'
                },
                query: {
                    binary: 'false'
                }
            },
            {
                id: 'export-binary',
                label: '原始 CSV',
                summary: '直接返回原始 CSV 文本和下载响应头，便于文件处理。',
                authMode: 'anonymous',
                pathParams: {
                    date: '20260814'
                },
                query: {
                    binary: 'true'
                }
            }
        ],
        successExample: {
            meta: {
                remain: 149,
                cost: 400
            },
            data: {
                serviceDay: 20679,
                total: 2,
                content:
                    'trainCode,emuCode,startStation,endStation,startAt,endAt\nG1,CR400AF-2149,北京南,上海虹桥,1786665600,1786680000\nG2,CR400BF-5028,北京南,上海虹桥,1786665600,1786680000'
            }
        },
        rawContentTypes: ['text/csv'],
        rawExample:
            'trainCode,emuCode,startStation,endStation,startAt,endAt\nG1,CR400AF-2149,北京南,上海虹桥,1786665600,1786680000\nG2,CR400BF-5028,北京南,上海虹桥,1786665600,1786680000',
        rawErrorShape: true,
        errors: [
            error(
                '400',
                '路径参数或查询参数不合法。',
                'date 必须使用 YYYYMMDD 格式。',
                'invalid_param'
            ),
            error(
                '401',
                '请求未携带有效的认证信息，或提供的 API Key 已失效。',
                'API Key 无效或已过期。',
                'invalid_api_key'
            ),
            error(
                '403',
                '当前凭证缺少调用该接口所需的 scope。',
                '缺少调用该接口所需的权限。',
                'forbidden'
            ),
            error(
                '404',
                '目标导出文件暂不可用。',
                '20260814.csv 尚未生成。',
                'not_found'
            ),
            error(
                '429',
                '额度不足或请求过于频繁。',
                '额度不足，请稍后再试。',
                'rate_limited'
            )
        ]
    }
];

export const V2_DOC_GROUP_MAP: Record<string, V2DocGroup> = Object.fromEntries(
    V2_DOC_GROUPS.map((group) => [group.key, group])
);
