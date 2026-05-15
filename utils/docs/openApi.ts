import type { OpenApiDocument } from '~/types/docs';
import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';

export const developerDocsOpenApi = {
    openapi: '3.1.0',
    info: {
        title: 'OpenCRHTracker 开发者 API',
        version: '1.0.0',
        description:
            '面向开发者的 API 文档，覆盖鉴权、每日记录、历史查询与每日数据导出接口。'
    },
    servers: [
        {
            url: '/api/v1',
            description: 'Same-origin API server'
        }
    ],
    tags: [
        {
            name: 'Auth',
            description: '查看当前鉴权会话的信息。'
        },
        {
            name: 'Records',
            description: '分页读取每日运行记录。'
        },
        {
            name: 'History',
            description: '查询车次和车组的担当历史。'
        },
        {
            name: 'Timetable',
            description: '读取当前日期下的完整车次时刻表。'
        },
        {
            name: 'Exports',
            description: '列出并下载已生成的每日数据导出文件。'
        }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'API Key'
            },
            cookieAuth: {
                type: 'apiKey',
                in: 'cookie',
                name: 'token'
            }
        },
        parameters: {
            TrainCodeParam: {
                name: 'trainCode',
                in: 'path',
                required: true,
                description: '要查询的车次号，例如 D2212。',
                schema: {
                    type: 'string'
                },
                example: 'D2212'
            },
            StationNameParam: {
                name: 'stationName',
                in: 'path',
                required: true,
                description: '要查询的车站名，例如 北京南。',
                schema: {
                    type: 'string'
                },
                example: '北京南'
            },
            EmuCodeParam: {
                name: 'emuCode',
                in: 'path',
                required: true,
                description: '要查询的车组编号，例如 CR400AF-C-2214。',
                schema: {
                    type: 'string'
                },
                example: 'CR400AF-C-2214'
            },
            DateParam: {
                name: 'date',
                in: 'path',
                required: true,
                description: '日期，格式为 YYYYMMDD。',
                schema: {
                    type: 'string',
                    pattern: '^\\d{8}$'
                },
                example: '20260401'
            },
            CursorQuery: {
                name: 'cursor',
                in: 'query',
                description: '分页游标。',
                schema: {
                    type: 'string'
                },
                example: '1741996800:1024'
            },
            LimitQuery: {
                name: 'limit',
                in: 'query',
                description:
                    '正整数分页大小；当请求值超过服务端配置上限时，服务端会自动截断。',
                schema: {
                    type: 'integer',
                    minimum: 1,
                    default: 20
                },
                example: 20
            },
            StartTimestampQuery: {
                name: 'start',
                in: 'query',
                description:
                    '起始时间戳，单位秒，包含边界；留空表示从最早记录开始。',
                schema: {
                    type: 'integer',
                    minimum: 0
                },
                example: 1735689600
            },
            EndTimestampQuery: {
                name: 'end',
                in: 'query',
                description:
                    '结束时间戳，单位秒，包含边界；留空表示读到最新记录。',
                schema: {
                    type: 'integer',
                    minimum: 0
                },
                example: 1738367999
            },
            DailyDateQuery: {
                name: 'date',
                in: 'query',
                required: true,
                description: '日期，格式为 YYYYMMDD。',
                schema: {
                    type: 'string',
                    pattern: '^\\d{8}$'
                },
                example: formatShanghaiDateString(Date.now())
            },
            ExportYearQuery: {
                name: 'year',
                in: 'query',
                description: '可选的导出年份筛选；留空时自动选择最近可用月份。',
                schema: {
                    type: 'integer',
                    minimum: 1
                },
                example: new Date().getFullYear()
            },
            ExportMonthQuery: {
                name: 'month',
                in: 'query',
                description: '可选的导出月份筛选；留空时自动选择最近可用月份。',
                schema: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 12
                },
                example: new Date().getMonth() + 1
            },
            ExportFormatQuery: {
                name: 'format',
                in: 'query',
                description: '导出格式；留空时默认使用 csv。',
                schema: {
                    type: 'string',
                    enum: ['csv', 'jsonl'],
                    default: 'csv'
                },
                example: 'csv'
            },
            ExportBinaryQuery: {
                name: 'binary',
                in: 'query',
                description:
                    '当值为 true 时，接口直接返回原始导出文本和下载头，而不是 JSON 包裹结构。',
                schema: {
                    type: 'string',
                    enum: ['true', 'false'],
                    default: 'false'
                },
                example: 'false'
            }
        },
        headers: {
            ApiRemain: {
                description: '本次请求完成后的剩余额度。',
                schema: {
                    type: 'string'
                },
                example: '24'
            },
            ApiCost: {
                description: '本次请求实际扣除的额度成本。',
                schema: {
                    type: 'string'
                },
                example: '1'
            },
            RetryAfter: {
                description: '请求被限流时建议等待的秒数。',
                schema: {
                    type: 'string'
                },
                example: '300'
            }
        },
        schemas: {
            ApiFailureResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: false
                    },
                    data: {
                        type: 'string',
                        example: 'API Key 无效或已过期。'
                    },
                    error: {
                        type: 'string',
                        example: 'invalid_api_key'
                    }
                }
            },
            AuthSessionResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: [
                            'userId',
                            'revokeId',
                            'issuer',
                            'maskedApiKey',
                            'scopes',
                            'activeFrom',
                            'expiresAt',
                            'dailyTokenLimit'
                        ],
                        properties: {
                            userId: {
                                type: 'string',
                                example: 'example-user'
                            },
                            revokeId: {
                                type: 'string',
                                example: '6cbf6ef0-27c7-43ee-9833-demo'
                            },
                            issuer: {
                                type: 'string',
                                enum: ['webapp', 'api'],
                                example: 'webapp'
                            },
                            maskedApiKey: {
                                type: 'string',
                                example:
                                    'ocrh_webapp_abcd1234************************'
                            },
                            scopes: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                },
                                example: [
                                    'api.auth.me.read',
                                    'api.auth.password.update'
                                ]
                            },
                            activeFrom: {
                                type: 'integer',
                                example: 1741968000
                            },
                            expiresAt: {
                                type: 'integer',
                                example: 1744560000
                            },
                            dailyTokenLimit: {
                                type: 'integer',
                                example: 1000
                            }
                        }
                    },
                    error: {
                        type: 'string',
                        example: ''
                    }
                }
            },
            AuthMeResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: ['user', 'apiKey', 'quota'],
                        properties: {
                            user: {
                                type: 'object',
                                required: ['userId'],
                                properties: {
                                    userId: {
                                        type: 'string',
                                        example: 'example-user'
                                    }
                                }
                            },
                            apiKey: {
                                type: 'object',
                                required: [
                                    'revokeId',
                                    'issuer',
                                    'maskedApiKey',
                                    'activeFrom',
                                    'expiresAt',
                                    'dailyTokenLimit',
                                    'scopes'
                                ],
                                properties: {
                                    revokeId: {
                                        type: 'string',
                                        example: '6cbf6ef0-27c7-43ee-9833-demo'
                                    },
                                    issuer: {
                                        type: 'string',
                                        enum: ['webapp', 'api'],
                                        example: 'api'
                                    },
                                    maskedApiKey: {
                                        type: 'string',
                                        example:
                                            'ocrh_api_abcd1234************************'
                                    },
                                    activeFrom: {
                                        type: 'integer',
                                        example: 1741968000
                                    },
                                    expiresAt: {
                                        type: 'integer',
                                        example: 1744560000
                                    },
                                    dailyTokenLimit: {
                                        type: 'integer',
                                        example: 1000
                                    },
                                    scopes: {
                                        type: 'array',
                                        items: {
                                            type: 'string'
                                        },
                                        example: [
                                            'api.auth.me.read',
                                            'api.records.daily.read'
                                        ]
                                    }
                                }
                            },
                            quota: {
                                type: 'object',
                                required: [
                                    'tokenLimit',
                                    'remain',
                                    'refillAmount',
                                    'refillIntervalSeconds',
                                    'nextRefillAt'
                                ],
                                properties: {
                                    tokenLimit: {
                                        type: 'integer',
                                        example: 1000
                                    },
                                    remain: {
                                        type: 'integer',
                                        example: 998
                                    },
                                    refillAmount: {
                                        type: 'integer',
                                        example: 5
                                    },
                                    refillIntervalSeconds: {
                                        type: 'integer',
                                        example: 300
                                    },
                                    nextRefillAt: {
                                        type: 'integer',
                                        nullable: true,
                                        example: 1744560300
                                    }
                                }
                            }
                        }
                    },
                    error: {
                        type: 'string',
                        example: ''
                    }
                }
            },
            AuthSubscriptionItem: {
                type: 'object',
                required: [
                    'id',
                    'name',
                    'endpoint',
                    'endpointPreview',
                    'expirationTime',
                    'createdAt',
                    'updatedAt',
                    'userAgent'
                ],
                properties: {
                    id: {
                        type: 'string',
                        example: 'e8f0d2a8-1c2e-4a36-8c2b-demo'
                    },
                    name: {
                        type: 'string',
                        example: 'Windows / Chrome / PWA'
                    },
                    endpoint: {
                        type: 'string',
                        example:
                            'https://updates.push.services.mozilla.com/wpush/v2/example-endpoint'
                    },
                    endpointPreview: {
                        type: 'string',
                        example: 'https://updates.push.s...example-endpoint'
                    },
                    expirationTime: {
                        type: 'integer',
                        nullable: true,
                        example: null
                    },
                    createdAt: {
                        type: 'integer',
                        example: 1741968000
                    },
                    updatedAt: {
                        type: 'integer',
                        example: 1744560000
                    },
                    userAgent: {
                        type: 'string',
                        example:
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36'
                    }
                }
            },
            AuthSubscriptionListResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: [
                            'userId',
                            'maxDevices',
                            'vapidPublicKey',
                            'syncTimeoutSeconds',
                            'items'
                        ],
                        properties: {
                            userId: {
                                type: 'string',
                                example: 'example-user'
                            },
                            maxDevices: {
                                type: 'integer',
                                example: 5
                            },
                            vapidPublicKey: {
                                type: 'string',
                                example: 'BAExamplePublicKey'
                            },
                            syncTimeoutSeconds: {
                                type: 'integer',
                                description:
                                    '客户端启用或同步当前设备订阅时使用的超时秒数。',
                                example: 30
                            },
                            items: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/AuthSubscriptionItem'
                                }
                            }
                        }
                    },
                    error: {
                        type: 'string',
                        example: ''
                    }
                }
            },
            DailyRecordItem: {
                type: 'object',
                required: [
                    'startAt',
                    'endAt',
                    'id',
                    'emuCode',
                    'trainCode',
                    'startStation',
                    'endStation',
                    'line'
                ],
                properties: {
                    startAt: {
                        type: 'integer',
                        example: 1774060020
                    },
                    endAt: {
                        type: 'integer',
                        example: 1774089060
                    },
                    id: {
                        type: 'string',
                        example: '5201314'
                    },
                    emuCode: {
                        type: 'string',
                        example: 'CRH2C-1-2070'
                    },
                    trainCode: {
                        type: 'string',
                        example: 'G8388'
                    },
                    startStation: {
                        type: 'string',
                        example: '上海'
                    },
                    endStation: {
                        type: 'string',
                        example: '上海南'
                    },
                    line: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        example: []
                    }
                }
            },
            DailyRecordsResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: [
                            'date',
                            'cursor',
                            'limit',
                            'nextCursor',
                            'items'
                        ],
                        properties: {
                            date: {
                                type: 'string',
                                example: '20260321'
                            },
                            cursor: {
                                type: 'string',
                                example: ''
                            },
                            limit: {
                                type: 'integer',
                                example: 20
                            },
                            nextCursor: {
                                type: 'string',
                                example: '1741996800:15231'
                            },
                            items: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/DailyRecordItem'
                                }
                            }
                        }
                    },
                    error: {
                        type: 'string',
                        example: ''
                    }
                }
            },
            TrainHistoryItem: {
                type: 'object',
                required: [
                    'id',
                    'serviceDate',
                    'timetableId',
                    'emuCode',
                    'line'
                ],
                properties: {
                    id: {
                        type: 'string',
                        example: '512596'
                    },
                    serviceDate: {
                        type: 'string',
                        pattern: '^\\d{8}$',
                        example: '20260424'
                    },
                    timetableId: {
                        type: 'integer',
                        nullable: true,
                        example: 5479
                    },
                    emuCode: {
                        type: 'string',
                        example: 'CR400BF-A-5156'
                    },
                    line: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        example: []
                    }
                }
            },
            TrainHistoryResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: [
                            'trainCode',
                            'cursor',
                            'limit',
                            'nextCursor',
                            'items'
                        ],
                        properties: {
                            trainCode: {
                                type: 'string',
                                example: 'G512'
                            },
                            start: {
                                type: 'integer',
                                nullable: true,
                                example: null
                            },
                            end: {
                                type: 'integer',
                                nullable: true,
                                example: null
                            },
                            cursor: {
                                type: 'string',
                                example: ''
                            },
                            limit: {
                                type: 'integer',
                                example: 2
                            },
                            nextCursor: {
                                type: 'string',
                                example: '20260423:496651'
                            },
                            items: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/TrainHistoryItem'
                                }
                            }
                        }
                    },
                    error: {
                        type: 'string',
                        example: ''
                    }
                }
            },
            EmuHistoryItem: {
                type: 'object',
                required: [
                    'id',
                    'serviceDate',
                    'timetableId',
                    'trainCode',
                    'line'
                ],
                properties: {
                    id: {
                        type: 'string',
                        example: '528425'
                    },
                    serviceDate: {
                        type: 'string',
                        pattern: '^\\d{8}$',
                        example: '20260425'
                    },
                    timetableId: {
                        type: 'integer',
                        nullable: true,
                        example: 6373
                    },
                    trainCode: {
                        type: 'string',
                        example: 'G1824'
                    },
                    line: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        example: []
                    }
                }
            },
            EmuHistoryResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: [
                            'emuCode',
                            'cursor',
                            'limit',
                            'nextCursor',
                            'items'
                        ],
                        properties: {
                            emuCode: {
                                type: 'string',
                                example: 'CR400BF-A-5156'
                            },
                            start: {
                                type: 'integer',
                                nullable: true,
                                example: null
                            },
                            end: {
                                type: 'integer',
                                nullable: true,
                                example: null
                            },
                            cursor: {
                                type: 'string',
                                example: ''
                            },
                            limit: {
                                type: 'integer',
                                example: 2
                            },
                            nextCursor: {
                                type: 'string',
                                example: '20260425:528424'
                            },
                            items: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/EmuHistoryItem'
                                }
                            }
                        }
                    },
                    error: {
                        type: 'string',
                        example: ''
                    }
                }
            },
            CurrentTrainTimetableStop: {
                type: 'object',
                required: [
                    'stationNo',
                    'stationName',
                    'arriveAt',
                    'departAt',
                    'stationTrainCode',
                    'wicket',
                    'isStart',
                    'isEnd'
                ],
                properties: {
                    stationNo: {
                        type: 'integer',
                        example: 1
                    },
                    stationName: {
                        type: 'string',
                        example: '北京南'
                    },
                    arriveAt: {
                        type: 'integer',
                        nullable: true,
                        example: null
                    },
                    departAt: {
                        type: 'integer',
                        nullable: true,
                        example: 1774060020
                    },
                    stationTrainCode: {
                        type: 'string',
                        nullable: true,
                        example: 'G8388'
                    },
                    wicket: {
                        type: 'string',
                        nullable: true,
                        example: '检票口 12A'
                    },
                    isStart: {
                        type: 'boolean',
                        example: true
                    },
                    isEnd: {
                        type: 'boolean',
                        example: false
                    }
                }
            },
            ReferenceModelItem: {
                type: 'object',
                required: ['model', 'weightedShare'],
                properties: {
                    model: {
                        type: 'string',
                        example: 'CR400AF-Z'
                    },
                    weightedShare: {
                        type: 'number',
                        example: 0.625
                    }
                }
            },
            TrainCirculationNode: {
                type: 'object',
                required: [
                    'internalCode',
                    'allCodes',
                    'startStation',
                    'endStation',
                    'startAt',
                    'endAt'
                ],
                properties: {
                    internalCode: {
                        type: 'string',
                        example: '33000G249204'
                    },
                    allCodes: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        example: ['G2492']
                    },
                    startStation: {
                        type: 'string',
                        example: '包头'
                    },
                    endStation: {
                        type: 'string',
                        example: '北京北'
                    },
                    startAt: {
                        type: 'integer',
                        description:
                            '交路内的日内偏移秒数，不是绝对 Unix 时间戳。',
                        example: 27120
                    },
                    endAt: {
                        type: 'integer',
                        description:
                            '交路内的日内偏移秒数，不是绝对 Unix 时间戳。',
                        example: 39000
                    }
                }
            },
            TrainCirculationMetadata: {
                type: 'object',
                required: [
                    'routeId',
                    'windowStart',
                    'windowEnd',
                    'threshold',
                    'lowestLinkWeight',
                    'lowestLinkSupportCount',
                    'containsLoopBreak',
                    'nodes'
                ],
                properties: {
                    routeId: {
                        type: 'string',
                        example: 'circulation_a1b2c3d4'
                    },
                    windowStart: {
                        type: 'integer',
                        example: 1775347200
                    },
                    windowEnd: {
                        type: 'integer',
                        example: 1776556799
                    },
                    threshold: {
                        type: 'number',
                        example: 0.8
                    },
                    lowestLinkWeight: {
                        type: 'number',
                        nullable: true,
                        example: 1
                    },
                    lowestLinkSupportCount: {
                        type: 'integer',
                        nullable: true,
                        example: 3
                    },
                    containsLoopBreak: {
                        type: 'boolean',
                        example: false
                    },
                    nodes: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/TrainCirculationNode'
                        }
                    }
                }
            },
            TrainCirculation: {
                type: 'object',
                required: ['source', 'refreshAt', 'nodes'],
                properties: {
                    source: {
                        type: 'string',
                        enum: ['official', 'inferred'],
                        example: 'official'
                    },
                    refreshAt: {
                        type: 'integer',
                        nullable: true,
                        example: 1778868346
                    },
                    nodes: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/TrainCirculationNode'
                        }
                    },
                    metadata: {
                        $ref: '#/components/schemas/TrainCirculationMetadata'
                    }
                }
            },
            CurrentTrainTimetableResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: [
                            'updatedAt',
                            'requestTrainCode',
                            'trainCode',
                            'internalCode',
                            'allCodes',
                            'bureauCode',
                            'bureauName',
                            'trainDepartment',
                            'passengerDepartment',
                            'referenceModels',
                            'startStation',
                            'endStation',
                            'startAt',
                            'endAt',
                            'circulation',
                            'stops'
                        ],
                        properties: {
                            updatedAt: {
                                type: 'integer',
                                nullable: true,
                                example: 1774059000
                            },
                            requestTrainCode: {
                                type: 'string',
                                example: 'G8388'
                            },
                            trainCode: {
                                type: 'string',
                                example: 'G8388'
                            },
                            internalCode: {
                                type: 'string',
                                example: '2400000G8388B'
                            },
                            allCodes: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                },
                                example: ['G8388', 'G8385']
                            },
                            bureauCode: {
                                type: 'string',
                                example: 'P'
                            },
                            bureauName: {
                                type: 'string',
                                example: '北京局集团'
                            },
                            trainDepartment: {
                                type: 'string',
                                example: '北京动车段'
                            },
                            passengerDepartment: {
                                type: 'string',
                                example: '北京客运段'
                            },
                            referenceModels: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/ReferenceModelItem'
                                },
                                example: [
                                    {
                                        model: 'CR400AF-Z',
                                        weightedShare: 0.625
                                    }
                                ]
                            },
                            startStation: {
                                type: 'string',
                                example: '北京南'
                            },
                            endStation: {
                                type: 'string',
                                example: '上海虹桥'
                            },
                            startAt: {
                                type: 'integer',
                                description:
                                    '当前车次始发时间，Unix 时间戳（秒）。',
                                example: 1774060020
                            },
                            endAt: {
                                type: 'integer',
                                description:
                                    '当前车次终到时间，Unix 时间戳（秒）。',
                                example: 1774076820
                            },
                            circulation: {
                                oneOf: [
                                    {
                                        $ref: '#/components/schemas/TrainCirculation'
                                    }
                                ],
                                nullable: true,
                                example: {
                                    source: 'official',
                                    refreshAt: 1778868346,
                                    nodes: [
                                        {
                                            internalCode: '33000G249204',
                                            allCodes: ['G2492'],
                                            startStation: '包头',
                                            endStation: '北京北',
                                            startAt: 27120,
                                            endAt: 39000
                                        },
                                        {
                                            internalCode: '24000G249307',
                                            allCodes: ['G2493'],
                                            startStation: '北京北',
                                            endStation: '包头',
                                            startAt: 42840,
                                            endAt: 56220
                                        },
                                        {
                                            internalCode: '33000G249608',
                                            allCodes: ['G2496'],
                                            startStation: '包头',
                                            endStation: '北京北',
                                            startAt: 58560,
                                            endAt: 73080
                                        }
                                    ]
                                }
                            },
                            stops: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/CurrentTrainTimetableStop'
                                }
                            }
                        }
                    },
                    error: {
                        type: 'string',
                        example: ''
                    }
                }
            },
            TrainTimetableHistoryListItem: {
                type: 'object',
                required: [
                    'id',
                    'historyId',
                    'serviceDateStart',
                    'serviceDateEndExclusive'
                ],
                properties: {
                    id: {
                        type: 'integer',
                        example: 6845
                    },
                    historyId: {
                        type: 'integer',
                        example: 5479
                    },
                    serviceDateStart: {
                        type: 'string',
                        pattern: '^\\d{8}$',
                        example: '20260502'
                    },
                    serviceDateEndExclusive: {
                        type: 'string',
                        pattern: '^\\d{8}$',
                        example: '20260503'
                    }
                }
            },
            TrainTimetableHistoryListResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: [
                            'trainCode',
                            'cursor',
                            'limit',
                            'nextCursor',
                            'items'
                        ],
                        properties: {
                            trainCode: {
                                type: 'string',
                                example: 'G512'
                            },
                            cursor: {
                                type: 'string',
                                example: ''
                            },
                            limit: {
                                type: 'integer',
                                example: 2
                            },
                            nextCursor: {
                                type: 'string',
                                example: ''
                            },
                            items: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/TrainTimetableHistoryListItem'
                                }
                            }
                        }
                    },
                    error: {
                        type: 'string',
                        example: ''
                    }
                }
            },
            HistoricalTimetableStop: {
                type: 'object',
                required: [
                    'stationNo',
                    'stationName',
                    'arriveOffset',
                    'departOffset',
                    'stationTrainCode',
                    'isStart',
                    'isEnd'
                ],
                properties: {
                    stationNo: {
                        type: 'integer',
                        example: 1
                    },
                    stationName: {
                        type: 'string',
                        example: '汉口'
                    },
                    arriveOffset: {
                        type: 'integer',
                        nullable: true,
                        example: null
                    },
                    departOffset: {
                        type: 'integer',
                        nullable: true,
                        example: 47340
                    },
                    stationTrainCode: {
                        type: 'string',
                        example: 'G512'
                    },
                    isStart: {
                        type: 'boolean',
                        example: true
                    },
                    isEnd: {
                        type: 'boolean',
                        example: false
                    }
                }
            },
            HistoricalTimetableDetailResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: [
                            'historyId',
                            'startStation',
                            'endStation',
                            'startOffset',
                            'endOffset',
                            'stops'
                        ],
                        properties: {
                            historyId: {
                                type: 'integer',
                                example: 5479
                            },
                            startStation: {
                                type: 'string',
                                nullable: true,
                                example: '汉口'
                            },
                            endStation: {
                                type: 'string',
                                nullable: true,
                                example: '北京西'
                            },
                            startOffset: {
                                type: 'integer',
                                nullable: true,
                                example: 47340
                            },
                            endOffset: {
                                type: 'integer',
                                nullable: true,
                                example: 66060
                            },
                            stops: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/HistoricalTimetableStop'
                                }
                            }
                        }
                    },
                    error: {
                        type: 'string',
                        example: ''
                    }
                }
            },
            StationTimetableItem: {
                type: 'object',
                required: [
                    'trainCode',
                    'allCodes',
                    'arriveAt',
                    'departAt',
                    'startStation',
                    'endStation',
                    'updatedAt',
                    'referenceModels'
                ],
                properties: {
                    trainCode: {
                        type: 'string',
                        example: 'C2001'
                    },
                    allCodes: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        example: ['C2001']
                    },
                    arriveAt: {
                        type: 'integer',
                        nullable: true,
                        example: 1777673640
                    },
                    departAt: {
                        type: 'integer',
                        nullable: true,
                        example: 1777673640
                    },
                    startStation: {
                        type: 'string',
                        example: '北京南'
                    },
                    endStation: {
                        type: 'string',
                        example: '天津'
                    },
                    updatedAt: {
                        type: 'integer',
                        nullable: true,
                        example: 1776492498
                    },
                    referenceModels: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/ReferenceModelItem'
                        },
                        example: [
                            {
                                model: 'CR400BF-S',
                                weightedShare: 1
                            }
                        ]
                    }
                }
            },
            StationTimetableResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: [
                            'stationName',
                            'cursor',
                            'limit',
                            'nextCursor',
                            'items'
                        ],
                        properties: {
                            stationName: {
                                type: 'string',
                                example: '北京南'
                            },
                            cursor: {
                                type: 'string',
                                example: ''
                            },
                            limit: {
                                type: 'integer',
                                example: 1
                            },
                            nextCursor: {
                                type: 'string',
                                nullable: true,
                                example: '22440:1777673640:C2001:1:1777673640'
                            },
                            items: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/StationTimetableItem'
                                }
                            }
                        }
                    },
                    error: {
                        type: 'string',
                        example: ''
                    }
                }
            },
            DailyExportIndexItem: {
                type: 'object',
                required: ['date', 'formats'],
                properties: {
                    date: {
                        type: 'string',
                        example: '20260321'
                    },
                    formats: {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: ['csv', 'jsonl']
                        },
                        example: ['csv', 'jsonl']
                    }
                }
            },
            DailyExportIndexResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: [
                            'selectedYear',
                            'selectedMonth',
                            'availableYears',
                            'availableMonths',
                            'items'
                        ],
                        properties: {
                            selectedYear: {
                                type: 'integer',
                                example: 2026
                            },
                            selectedMonth: {
                                type: 'integer',
                                example: 3
                            },
                            availableYears: {
                                type: 'array',
                                items: {
                                    type: 'integer'
                                },
                                example: [2027, 2026, 2025]
                            },
                            availableMonths: {
                                type: 'array',
                                items: {
                                    type: 'integer'
                                },
                                example: [3, 2, 1]
                            },
                            items: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/DailyExportIndexItem'
                                }
                            }
                        }
                    },
                    error: {
                        type: 'string',
                        example: ''
                    }
                }
            },
            DailyExportJsonResponse: {
                type: 'object',
                required: ['ok', 'data', 'error'],
                properties: {
                    ok: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: ['date', 'format', 'total', 'content'],
                        properties: {
                            date: {
                                type: 'string',
                                example: '20260321'
                            },
                            format: {
                                type: 'string',
                                enum: ['csv', 'jsonl'],
                                example: 'csv'
                            },
                            total: {
                                type: 'integer',
                                example: 1245
                            },
                            content: {
                                type: 'string',
                                example:
                                    'trainCode,emuCode,startStation,endStation,startAt,endAt\\nC2724,CR400AF-C-2214,雄安,北京西,1774076820,1774091220'
                            }
                        }
                    },
                    error: {
                        type: 'string',
                        example: ''
                    }
                }
            }
        }
    },
    paths: {
        '/auth/me': {
            get: {
                operationId: 'authMe',
                tags: ['Auth'],
                summary: '读取当前鉴权会话',
                description:
                    '返回当前用户、正在使用的 API Key 摘要以及当前额度桶状态。',
                security: [
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: '当前鉴权会话信息。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/AuthMeResponse'
                                }
                            }
                        }
                    },
                    '401': {
                        description:
                            '请求未携带有效的认证信息，或提供的 API Key 已失效。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'API Key 无效或已过期。',
                                    error: 'invalid_api_key'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'auth-me',
                'x-group': '身份',
                'x-sort-order': 10,
                'x-auth-modes': ['cookie', 'apiKey'],
                'x-required-scopes': ['api.auth.me.read'],
                'x-examples': [
                    {
                        id: 'auth-me-cookie',
                        label: 'cookie',
                        summary: '使用当前登录会话读取会话信息。',
                        authMode: 'cookie'
                    }
                ]
            }
        },
        '/auth/subscriptions': {
            get: {
                operationId: 'authListSubscriptions',
                tags: ['Auth'],
                summary: 'List push subscription devices',
                description:
                    "Returns the current user's stored PushSubscription endpoints and the configured device cap.",
                security: [
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: 'Push subscription device list.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/AuthSubscriptionListResponse'
                                }
                            }
                        }
                    },
                    '401': {
                        description: 'Missing or invalid authentication.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'API Key invalid or expired.',
                                    error: 'invalid_api_key'
                                }
                            }
                        }
                    },
                    '403': {
                        description:
                            'Missing required subscription read scope.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'Missing required scope api.auth.subscriptions.read.',
                                    error: 'forbidden'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'auth-subscriptions-list',
                'x-group': 'Auth',
                'x-sort-order': 12,
                'x-auth-modes': ['cookie', 'apiKey'],
                'x-required-scopes': ['api.auth.subscriptions.read'],
                'x-examples': [
                    {
                        id: 'auth-subscriptions-list-cookie',
                        label: 'cookie',
                        summary:
                            'List stored PushSubscription endpoints from the current browser session.',
                        authMode: 'cookie'
                    }
                ]
            },
            put: {
                operationId: 'authUpsertSubscription',
                tags: ['Auth'],
                summary: 'Create or refresh a push subscription device',
                description:
                    "Stores the current browser's PushSubscription endpoint and returns the refreshed device list.",
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['subscription'],
                                properties: {
                                    name: {
                                        type: 'string',
                                        example: 'Windows / Chrome / PWA'
                                    },
                                    subscription: {
                                        type: 'object',
                                        required: ['endpoint', 'keys'],
                                        properties: {
                                            endpoint: {
                                                type: 'string',
                                                example:
                                                    'https://updates.push.services.mozilla.com/wpush/v2/example-endpoint'
                                            },
                                            expirationTime: {
                                                type: 'integer',
                                                nullable: true,
                                                example: null
                                            },
                                            keys: {
                                                type: 'object',
                                                required: ['p256dh', 'auth'],
                                                properties: {
                                                    p256dh: {
                                                        type: 'string',
                                                        example:
                                                            'p256dh-example'
                                                    },
                                                    auth: {
                                                        type: 'string',
                                                        example: 'auth-example'
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            example: {
                                name: 'Windows / Chrome / PWA',
                                subscription: {
                                    endpoint:
                                        'https://updates.push.services.mozilla.com/wpush/v2/example-endpoint',
                                    expirationTime: null,
                                    keys: {
                                        p256dh: 'p256dh-example',
                                        auth: 'auth-example'
                                    }
                                }
                            }
                        }
                    }
                },
                security: [
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: 'Device stored successfully.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/AuthSubscriptionListResponse'
                                }
                            }
                        }
                    },
                    '400': {
                        description: 'Invalid request body.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'subscription.endpoint must not be empty.',
                                    error: 'invalid_param'
                                }
                            }
                        }
                    },
                    '401': {
                        description: 'Missing or invalid authentication.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'API Key invalid or expired.',
                                    error: 'invalid_api_key'
                                }
                            }
                        }
                    },
                    '403': {
                        description:
                            'Missing required subscription write scope.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'Missing required scope api.auth.subscriptions.write.',
                                    error: 'forbidden'
                                }
                            }
                        }
                    },
                    '409': {
                        description: 'The device cap has been reached.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'Subscription device limit exceeded.',
                                    error: 'subscriptions_limit_exceeded'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'auth-subscriptions-upsert',
                'x-group': 'Auth',
                'x-sort-order': 13,
                'x-auth-modes': ['cookie', 'apiKey'],
                'x-required-scopes': ['api.auth.subscriptions.write'],
                'x-examples': [
                    {
                        id: 'auth-subscriptions-upsert',
                        label: 'save current device',
                        summary:
                            "Create or refresh the current browser's PushSubscription record.",
                        authMode: 'cookie',
                        body: {
                            name: 'Windows / Chrome / PWA',
                            subscription: {
                                endpoint:
                                    'https://updates.push.services.mozilla.com/wpush/v2/example-endpoint',
                                expirationTime: null,
                                keys: {
                                    p256dh: 'p256dh-example',
                                    auth: 'auth-example'
                                }
                            }
                        }
                    }
                ]
            }
        },
        '/auth/subscriptions/{id}': {
            patch: {
                operationId: 'authRenameSubscription',
                tags: ['Auth'],
                summary: 'Rename a stored push subscription device',
                description:
                    'Updates the display name of one stored PushSubscription device record.',
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        description: 'Subscription device identifier.',
                        schema: {
                            type: 'string'
                        },
                        example: 'e8f0d2a8-1c2e-4a36-8c2b-demo'
                    }
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name'],
                                properties: {
                                    name: {
                                        type: 'string',
                                        example: 'Office Chrome'
                                    }
                                }
                            },
                            example: {
                                name: 'Office Chrome'
                            }
                        }
                    }
                },
                security: [
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: 'Device renamed successfully.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/AuthSubscriptionListResponse'
                                }
                            }
                        }
                    },
                    '400': {
                        description: 'Invalid path parameter or request body.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'name must be a string.',
                                    error: 'invalid_param'
                                }
                            }
                        }
                    },
                    '401': {
                        description: 'Missing or invalid authentication.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'API Key invalid or expired.',
                                    error: 'invalid_api_key'
                                }
                            }
                        }
                    },
                    '403': {
                        description:
                            'Missing required subscription write scope.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'Missing required scope api.auth.subscriptions.write.',
                                    error: 'forbidden'
                                }
                            }
                        }
                    },
                    '404': {
                        description: 'The target device record does not exist.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'Subscription device not found.',
                                    error: 'not_found'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'auth-subscriptions-rename',
                'x-group': 'Auth',
                'x-sort-order': 14,
                'x-auth-modes': ['cookie', 'apiKey'],
                'x-required-scopes': ['api.auth.subscriptions.write'],
                'x-examples': [
                    {
                        id: 'auth-subscriptions-rename',
                        label: 'rename device',
                        summary:
                            'Change the display name of one stored device record.',
                        authMode: 'cookie',
                        pathParams: {
                            id: 'e8f0d2a8-1c2e-4a36-8c2b-demo'
                        },
                        body: {
                            name: 'Office Chrome'
                        }
                    }
                ]
            },
            delete: {
                operationId: 'authDeleteSubscription',
                tags: ['Auth'],
                summary: 'Delete a stored push subscription device',
                description:
                    'Removes one stored PushSubscription device record and returns the refreshed device list.',
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        description: 'Subscription device identifier.',
                        schema: {
                            type: 'string'
                        },
                        example: 'e8f0d2a8-1c2e-4a36-8c2b-demo'
                    }
                ],
                security: [
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: 'Device deleted successfully.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/AuthSubscriptionListResponse'
                                }
                            }
                        }
                    },
                    '400': {
                        description: 'Invalid path parameter.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'id must not be empty.',
                                    error: 'invalid_param'
                                }
                            }
                        }
                    },
                    '401': {
                        description: 'Missing or invalid authentication.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'API Key invalid or expired.',
                                    error: 'invalid_api_key'
                                }
                            }
                        }
                    },
                    '403': {
                        description:
                            'Missing required subscription write scope.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'Missing required scope api.auth.subscriptions.write.',
                                    error: 'forbidden'
                                }
                            }
                        }
                    },
                    '404': {
                        description: 'The target device record does not exist.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'Subscription device not found.',
                                    error: 'not_found'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'auth-subscriptions-delete',
                'x-group': 'Auth',
                'x-sort-order': 15,
                'x-auth-modes': ['cookie', 'apiKey'],
                'x-required-scopes': ['api.auth.subscriptions.write'],
                'x-examples': [
                    {
                        id: 'auth-subscriptions-delete',
                        label: 'delete device',
                        summary:
                            'Delete one stored PushSubscription device record.',
                        authMode: 'cookie',
                        pathParams: {
                            id: 'e8f0d2a8-1c2e-4a36-8c2b-demo'
                        }
                    }
                ]
            }
        },
        '/records/daily': {
            get: {
                operationId: 'recordsDaily',
                tags: ['Records'],
                summary: '分页读取每日记录',
                description: '读取该日的车次车组担当记录。',
                parameters: [
                    {
                        $ref: '#/components/parameters/DailyDateQuery'
                    },
                    {
                        $ref: '#/components/parameters/LimitQuery'
                    },
                    {
                        $ref: '#/components/parameters/CursorQuery'
                    }
                ],
                security: [{}, { bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    '200': {
                        description: '一页每日记录数据。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/DailyRecordsResponse'
                                }
                            }
                        }
                    },
                    '400': {
                        description: '查询参数不合法。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'date 必须使用 YYYYMMDD 格式。',
                                    error: 'invalid_param'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'records-daily',
                'x-group': '记录',
                'x-sort-order': 20,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': ['api.records.daily.read'],
                'x-examples': [
                    {
                        id: 'daily-first-page',
                        label: '第一页',
                        summary:
                            '不额外携带身份信息，直接读取某一天的第一页数据。',
                        authMode: 'anonymous',
                        query: {
                            date: '20260401',
                            limit: '20'
                        }
                    },
                    {
                        id: 'daily-next-page',
                        label: '下一页',
                        summary:
                            '复用服务端返回的 cursor，继续读取下一页每日记录。',
                        authMode: 'anonymous',
                        query: {
                            date: '20260401',
                            limit: '20',
                            cursor: '1775054700:133827'
                        }
                    }
                ]
            }
        },
        '/timetable/train/{trainCode}/current': {
            get: {
                operationId: 'currentTrainTimetable',
                tags: ['Timetable'],
                summary: '按车次读取当前完整时刻表',
                description:
                    '返回该车次的时刻表，包括经停站、当前站车次、检票口信息、参考车型和交路信息。顶层 startAt/endAt 与 stops 中的时间字段是 Unix 秒；circulation.nodes 中的 startAt/endAt 是交路内日内偏移秒。',
                parameters: [
                    {
                        $ref: '#/components/parameters/TrainCodeParam'
                    }
                ],
                security: [{}, { bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    '200': {
                        description: '当前日期下的完整车次时刻表。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/CurrentTrainTimetableResponse'
                                },
                                example: {
                                    ok: true,
                                    data: {
                                        updatedAt: 1778692621,
                                        requestTrainCode: 'G2492',
                                        trainCode: 'G2492',
                                        internalCode: '33000G249204',
                                        allCodes: ['G2492'],
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
                                        startAt: 1778887920,
                                        endAt: 1778899800,
                                        circulation: {
                                            source: 'official',
                                            refreshAt: 1778868346,
                                            nodes: [
                                                {
                                                    internalCode:
                                                        '33000G249204',
                                                    allCodes: ['G2492'],
                                                    startStation: '包头',
                                                    endStation: '北京北',
                                                    startAt: 27120,
                                                    endAt: 39000
                                                },
                                                {
                                                    internalCode:
                                                        '24000G249307',
                                                    allCodes: ['G2493'],
                                                    startStation: '北京北',
                                                    endStation: '包头',
                                                    startAt: 42840,
                                                    endAt: 56220
                                                },
                                                {
                                                    internalCode:
                                                        '33000G249608',
                                                    allCodes: ['G2496'],
                                                    startStation: '包头',
                                                    endStation: '北京北',
                                                    startAt: 58560,
                                                    endAt: 73080
                                                },
                                                {
                                                    internalCode:
                                                        '24000G249108',
                                                    allCodes: ['G2491'],
                                                    startStation: '北京北',
                                                    endStation: '包头',
                                                    startAt: 117120,
                                                    endAt: 129960
                                                },
                                                {
                                                    internalCode:
                                                        '33000G249408',
                                                    allCodes: ['G2494'],
                                                    startStation: '包头',
                                                    endStation: '北京北',
                                                    startAt: 131640,
                                                    endAt: 145560
                                                },
                                                {
                                                    internalCode:
                                                        '24000G249505',
                                                    allCodes: ['G2495'],
                                                    startStation: '北京北',
                                                    endStation: '包头',
                                                    startAt: 147300,
                                                    endAt: 159120
                                                },
                                                {
                                                    internalCode:
                                                        '33000D67580J',
                                                    allCodes: ['D6758'],
                                                    startStation: '包头',
                                                    endStation: '呼和浩特东',
                                                    startAt: 160680,
                                                    endAt: 165300
                                                }
                                            ]
                                        },
                                        stops: [
                                            {
                                                stationNo: 1,
                                                stationName: '包头',
                                                arriveAt: 1778887920,
                                                departAt: 1778887920,
                                                stationTrainCode: 'G2492',
                                                wicket: '一层2检票口',
                                                isStart: true,
                                                isEnd: false
                                            },
                                            {
                                                stationNo: 2,
                                                stationName: '呼和浩特',
                                                arriveAt: 1778891460,
                                                departAt: 1778891760,
                                                stationTrainCode: 'G2492',
                                                wicket: '4检票口',
                                                isStart: false,
                                                isEnd: false
                                            },
                                            {
                                                stationNo: 3,
                                                stationName: '北京北',
                                                arriveAt: 1778899800,
                                                departAt: 1778899800,
                                                stationTrainCode: 'G2492',
                                                wicket: '',
                                                isStart: false,
                                                isEnd: true
                                            }
                                        ]
                                    },
                                    error: ''
                                }
                            }
                        }
                    },
                    '400': {
                        description: 'Invalid path parameters.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'trainCode 不能为空。',
                                    error: 'invalid_param'
                                }
                            }
                        }
                    },
                    '404': {
                        description: '当前时刻表暂不可用。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: '当前暂无时刻表。',
                                    error: 'not_found'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'timetable-train-current',
                'x-group': '时刻表',
                'x-sort-order': 25,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': ['api.timetable.train.current.read'],
                'x-examples': [
                    {
                        id: 'timetable-by-train-code',
                        label: '当前时刻表',
                        summary:
                            '读取当天一趟车次的完整经停表，可用于详情页弹窗展示。',
                        authMode: 'anonymous',
                        pathParams: {
                            trainCode: 'G2492'
                        }
                    }
                ]
            }
        },
        '/timetable/train/{trainCode}/history': {
            get: {
                operationId: 'trainTimetableHistory',
                tags: ['Timetable'],
                summary: '按车次分页读取历史时刻表清单',
                description: '返回指定车次的历史时刻表覆盖范围列表。',
                parameters: [
                    {
                        $ref: '#/components/parameters/TrainCodeParam'
                    },
                    {
                        $ref: '#/components/parameters/LimitQuery'
                    },
                    {
                        $ref: '#/components/parameters/CursorQuery'
                    }
                ],
                security: [{}, { bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    '200': {
                        description: '一页历史时刻表清单数据。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/TrainTimetableHistoryListResponse'
                                },
                                example: {
                                    ok: true,
                                    data: {
                                        trainCode: 'G512',
                                        cursor: '',
                                        limit: 2,
                                        nextCursor: '',
                                        items: [
                                            {
                                                id: 6845,
                                                historyId: 5479,
                                                serviceDateStart: '20260502',
                                                serviceDateEndExclusive:
                                                    '20260503'
                                            }
                                        ]
                                    },
                                    error: ''
                                }
                            }
                        }
                    },
                    '400': {
                        description: '路径参数或分页参数无效。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'cursor 必须是 "serviceDate:id" 格式',
                                    error: 'invalid_param'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'timetable-train-history',
                'x-group': '时刻表',
                'x-sort-order': 26,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': ['api.timetable.train.history.read'],
                'x-examples': [
                    {
                        id: 'train-history-first-page',
                        label: '历史清单',
                        summary:
                            '读取指定车次最近可用的历史时刻表覆盖范围列表。',
                        authMode: 'anonymous',
                        pathParams: {
                            trainCode: 'G512'
                        },
                        query: {
                            limit: '2'
                        }
                    }
                ]
            }
        },
        '/timetable/train/{trainCode}/history/{historyId}': {
            get: {
                operationId: 'historicalTrainTimetableDetail',
                tags: ['Timetable'],
                summary: '读取车次历史时刻表内容',
                description: '读取时刻表内容。',
                parameters: [
                    {
                        $ref: '#/components/parameters/TrainCodeParam'
                    },
                    {
                        name: 'historyId',
                        in: 'path',
                        required: true,
                        description:
                            '历史时刻表内容 ID，由历史时刻表清单接口返回。',
                        schema: {
                            type: 'integer',
                            minimum: 1
                        },
                        example: 5479
                    }
                ],
                security: [{}, { bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    '200': {
                        description: '历史时刻表详情。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/HistoricalTimetableDetailResponse'
                                },
                                example: {
                                    ok: true,
                                    data: {
                                        historyId: 5479,
                                        startStation: '汉口',
                                        endStation: '北京西',
                                        startOffset: 47340,
                                        endOffset: 66060,
                                        stops: [
                                            {
                                                stationNo: 1,
                                                stationName: '汉口',
                                                arriveOffset: 47340,
                                                departOffset: 47340,
                                                stationTrainCode: 'G512',
                                                isStart: true,
                                                isEnd: false
                                            },
                                            {
                                                stationNo: 2,
                                                stationName: '许昌东',
                                                arriveOffset: 53040,
                                                departOffset: 53760,
                                                stationTrainCode: 'G512',
                                                isStart: false,
                                                isEnd: false
                                            },
                                            {
                                                stationNo: 3,
                                                stationName: '郑州东',
                                                arriveOffset: 55140,
                                                departOffset: 55320,
                                                stationTrainCode: 'G512',
                                                isStart: false,
                                                isEnd: false
                                            },
                                            {
                                                stationNo: 4,
                                                stationName: '高邑西',
                                                arriveOffset: 60120,
                                                departOffset: 60240,
                                                stationTrainCode: 'G512',
                                                isStart: false,
                                                isEnd: false
                                            },
                                            {
                                                stationNo: 5,
                                                stationName: '石家庄',
                                                arriveOffset: 61140,
                                                departOffset: 61320,
                                                stationTrainCode: 'G512',
                                                isStart: false,
                                                isEnd: false
                                            },
                                            {
                                                stationNo: 6,
                                                stationName: '保定东',
                                                arriveOffset: 63420,
                                                departOffset: 63540,
                                                stationTrainCode: 'G512',
                                                isStart: false,
                                                isEnd: false
                                            },
                                            {
                                                stationNo: 7,
                                                stationName: '北京西',
                                                arriveOffset: 66060,
                                                departOffset: 66060,
                                                stationTrainCode: 'G512',
                                                isStart: false,
                                                isEnd: true
                                            }
                                        ]
                                    },
                                    error: ''
                                }
                            }
                        }
                    },
                    '400': {
                        description: '路径参数无效。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'historyId 必须是正整数。',
                                    error: 'invalid_param'
                                }
                            }
                        }
                    },
                    '404': {
                        description: '指定的历史时刻表不存在。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: '历史时刻表不存在',
                                    error: 'not_found'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'timetable-train-history-detail',
                'x-group': '时刻表',
                'x-sort-order': 27,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': ['api.timetable.train.history.read'],
                'x-examples': [
                    {
                        id: 'train-history-detail',
                        label: '历史详情',
                        summary:
                            '根据历史清单返回的 historyId 读取一份不可变的历史时刻表内容。',
                        authMode: 'anonymous',
                        pathParams: {
                            trainCode: 'G512',
                            historyId: '5479'
                        }
                    }
                ]
            }
        },
        '/timetable/station/{stationName}': {
            get: {
                operationId: 'stationTimetable',
                tags: ['Timetable'],
                summary: '按车站读取当日站内时刻表',
                description:
                    '返回指定车站的计划车次列表，按列车到站时间升序排序。',
                parameters: [
                    {
                        $ref: '#/components/parameters/StationNameParam'
                    },
                    {
                        $ref: '#/components/parameters/LimitQuery'
                    },
                    {
                        $ref: '#/components/parameters/CursorQuery'
                    }
                ],
                security: [{}, { bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    '200': {
                        description: '指定车站的当日站内时刻表分页结果。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/StationTimetableResponse'
                                },
                                example: {
                                    ok: true,
                                    data: {
                                        stationName: '北京南',
                                        cursor: '',
                                        limit: 1,
                                        nextCursor:
                                            '22440:1777673640:C2001:1:1777673640',
                                        items: [
                                            {
                                                trainCode: 'C2001',
                                                allCodes: ['C2001'],
                                                arriveAt: 1777673640,
                                                departAt: 1777673640,
                                                startStation: '北京南',
                                                endStation: '天津',
                                                updatedAt: 1776492498,
                                                referenceModels: [
                                                    {
                                                        model: 'CR400BF-S',
                                                        weightedShare: 1
                                                    }
                                                ]
                                            }
                                        ]
                                    },
                                    error: ''
                                }
                            }
                        }
                    },
                    '400': {
                        description: '路径参数或分页参数无效。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'stationName 不能为空。',
                                    error: 'invalid_param'
                                }
                            }
                        }
                    },
                    '404': {
                        description: '指定车站暂无当日时刻表数据。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: '当前暂无该车站的时刻表。',
                                    error: 'not_found'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'timetable-station',
                'x-group': '时刻表',
                'x-sort-order': 26,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': ['api.timetable.station.read'],
                'x-examples': [
                    {
                        id: 'timetable-by-station',
                        label: '车站页首屏',
                        summary:
                            '读取指定车站当日已发布时刻表中的首屏结果，可用于站点页和站点搜索跳转。',
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
                            '复用上一页返回的 cursor，继续读取同一车站的后续时刻表数据。',
                        authMode: 'anonymous',
                        pathParams: {
                            stationName: '北京南'
                        },
                        query: {
                            limit: '1',
                            cursor: '22440:1777673640:C2001:1:1777673640'
                        }
                    }
                ]
            }
        },
        '/history/train/{trainCode}': {
            get: {
                operationId: 'historyTrain',
                tags: ['History'],
                summary: '按车次查询历史',
                description:
                    '返回单个车次的历史担当轻量记录，包含 serviceDate、timetableId 和 emuCode。',
                parameters: [
                    {
                        $ref: '#/components/parameters/TrainCodeParam'
                    },
                    {
                        $ref: '#/components/parameters/StartTimestampQuery'
                    },
                    {
                        $ref: '#/components/parameters/EndTimestampQuery'
                    },
                    {
                        $ref: '#/components/parameters/LimitQuery'
                    },
                    {
                        $ref: '#/components/parameters/CursorQuery'
                    }
                ],
                security: [{}, { bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    '200': {
                        description: '一页车次历史记录。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/TrainHistoryResponse'
                                },
                                example: {
                                    ok: true,
                                    data: {
                                        trainCode: 'G512',
                                        start: null,
                                        end: null,
                                        cursor: '',
                                        limit: 2,
                                        nextCursor: '20260423:496651',
                                        items: [
                                            {
                                                id: '512596',
                                                serviceDate: '20260424',
                                                timetableId: 5479,
                                                emuCode: 'CR400BF-A-5156',
                                                line: []
                                            },
                                            {
                                                id: '496651',
                                                serviceDate: '20260423',
                                                timetableId: 5479,
                                                emuCode: 'CR400BF-A-5159',
                                                line: []
                                            }
                                        ]
                                    },
                                    error: ''
                                }
                            }
                        }
                    },
                    '400': {
                        description: 'Invalid path or query parameters.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'trainCode 不能为空。',
                                    error: 'invalid_param'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'history-train',
                'x-group': '历史',
                'x-sort-order': 30,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': ['api.history.train.read'],
                'x-examples': [
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
                            cursor: '20260423:496651'
                        }
                    }
                ]
            }
        },
        '/history/emu/{emuCode}': {
            get: {
                operationId: 'historyEmu',
                tags: ['History'],
                summary: '按车组查询历史',
                description:
                    '返回单个车组的历史担当轻量记录，包含 serviceDate、timetableId 和 trainCode。',
                parameters: [
                    {
                        $ref: '#/components/parameters/EmuCodeParam'
                    },
                    {
                        $ref: '#/components/parameters/StartTimestampQuery'
                    },
                    {
                        $ref: '#/components/parameters/EndTimestampQuery'
                    },
                    {
                        $ref: '#/components/parameters/LimitQuery'
                    },
                    {
                        $ref: '#/components/parameters/CursorQuery'
                    }
                ],
                security: [{}, { bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    '200': {
                        description: '一页车组历史记录。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/EmuHistoryResponse'
                                },
                                example: {
                                    ok: true,
                                    data: {
                                        emuCode: 'CR400BF-A-5156',
                                        start: null,
                                        end: null,
                                        cursor: '',
                                        limit: 2,
                                        nextCursor: '20260425:528424',
                                        items: [
                                            {
                                                id: '528425',
                                                serviceDate: '20260425',
                                                timetableId: 6373,
                                                trainCode: 'G1824',
                                                line: []
                                            },
                                            {
                                                id: '528424',
                                                serviceDate: '20260425',
                                                timetableId: 6373,
                                                trainCode: 'G1821',
                                                line: []
                                            }
                                        ]
                                    },
                                    error: ''
                                }
                            }
                        }
                    },
                    '400': {
                        description: 'Invalid path or query parameters.',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'emuCode 不能为空。',
                                    error: 'invalid_param'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'history-emu',
                'x-group': '历史',
                'x-sort-order': 40,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': ['api.history.emu.read'],
                'x-examples': [
                    {
                        id: 'emu-first-page',
                        label: '第一页',
                        summary: '读取单个车组最新的历史担当记录。',
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
                        summary:
                            '使用服务端 cursor 继续读取同一车组的后续历史记录。',
                        authMode: 'anonymous',
                        pathParams: {
                            emuCode: 'CR400BF-A-5156'
                        },
                        query: {
                            limit: '2',
                            cursor: '20260425:528424'
                        }
                    }
                ]
            }
        },
        '/exports/daily': {
            get: {
                operationId: 'dailyExportIndex',
                tags: ['Exports'],
                summary: '列出可用的日导出文件',
                description: '按年和月列出已生成的日导出文件。',
                parameters: [
                    {
                        $ref: '#/components/parameters/ExportYearQuery'
                    },
                    {
                        $ref: '#/components/parameters/ExportMonthQuery'
                    }
                ],
                security: [{}, { bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    '200': {
                        description: '当前可用的导出日期和格式。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/DailyExportIndexResponse'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'exports-daily-index',
                'x-group': '导出',
                'x-sort-order': 50,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': ['api.exports.daily.read'],
                'x-examples': [
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
                            month: '3'
                        }
                    }
                ]
            }
        },
        '/exports/daily/{date}': {
            get: {
                operationId: 'dailyExportByDate',
                tags: ['Exports'],
                summary: '读取单日导出文件',
                description:
                    '读取某日已生成的车次车底对应关系导出文件；开启 binary 模式时返回原始文本，否则返回 JSON 包裹结构。',
                parameters: [
                    {
                        $ref: '#/components/parameters/DateParam'
                    },
                    {
                        $ref: '#/components/parameters/ExportFormatQuery'
                    },
                    {
                        $ref: '#/components/parameters/ExportBinaryQuery'
                    }
                ],
                security: [{}, { bearerAuth: [] }, { cookieAuth: [] }],
                responses: {
                    '200': {
                        description: '日导出内容。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/DailyExportJsonResponse'
                                }
                            },
                            'text/csv': {
                                schema: {
                                    type: 'string'
                                },
                                example:
                                    'trainCode,emuCode,startStation,endStation,startAt,endAt\nG1,CR400AF-2149,Beijing South,Shanghai Hongqiao,1741996800,1742019960'
                            },
                            'application/x-ndjson': {
                                schema: {
                                    type: 'string'
                                },
                                example:
                                    '{"trainCode":"G1","emuCode":"CR400AF-2149","startStation":"Beijing South","endStation":"Shanghai Hongqiao","startAt":1741996800,"endAt":1742019960}'
                            }
                        }
                    },
                    '400': {
                        description: '日期或查询参数不合法。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: 'format 必须是 csv 或 jsonl。',
                                    error: 'invalid_param'
                                }
                            }
                        }
                    },
                    '404': {
                        description: '目标导出文件暂不可用。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                },
                                example: {
                                    ok: false,
                                    data: '20250315.csv 尚未生成。',
                                    error: 'not_found'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'exports-daily-date',
                'x-group': '导出',
                'x-sort-order': 60,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': ['api.exports.daily.read'],
                'x-examples': [
                    {
                        id: 'export-json',
                        label: 'JSON 包裹结构',
                        summary: '以标准 JSON 包裹结构读取导出内容。',
                        authMode: 'anonymous',
                        pathParams: {
                            date: '20260401'
                        },
                        query: {
                            format: 'csv',
                            binary: 'false'
                        }
                    },
                    {
                        id: 'export-binary',
                        label: '原始下载内容',
                        summary:
                            '直接返回原始导出文本和下载响应头，便于文件处理。',
                        authMode: 'anonymous',
                        pathParams: {
                            date: '20260401'
                        },
                        query: {
                            format: 'jsonl',
                            binary: 'true'
                        }
                    }
                ]
            }
        }
    }
} satisfies OpenApiDocument;

export default developerDocsOpenApi;
