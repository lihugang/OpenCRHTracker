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
            name: '身份',
            description: '查看当前鉴权会话的信息。'
        },
        {
            name: '记录',
            description: '分页读取每日运行记录。'
        },
        {
            name: '历史',
            description: '查询车次和车组的担当历史。'
        },
        {
            name: '导出',
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
                example: formatShanghaiDateString(Date.now())
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
                    'startAt',
                    'endAt',
                    'id',
                    'emuCode',
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
                                example: 'G8388'
                            },
                            start: {
                                type: 'integer',
                                nullable: true,
                                example: 1774060020
                            },
                            end: {
                                type: 'integer',
                                nullable: true,
                                example: 1774089060
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
                                example: '1741996800:913251'
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
                    'startAt',
                    'endAt',
                    'id',
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
                                example: 'CR400AF-C-2214'
                            },
                            start: {
                                type: 'integer',
                                nullable: true,
                                example: 1774076820
                            },
                            end: {
                                type: 'integer',
                                nullable: true,
                                example: 1774080540
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
                                example: '1741996800:913251'
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
                summary: '璇诲彇褰撳墠閴存潈浼氳瘽',
                description:
                    '杩斿洖褰撳墠鐢ㄦ埛銆佹鍦ㄤ娇鐢ㄧ殑 API Key 鎽樿浠ュ強褰撳墠棰濆害妗剁姸鎬併€?',
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
                        description: '褰撳墠閴存潈浼氳瘽璇︽儏銆?',
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
                            '缂哄皯鍑嵁锛屾垨鍑嵁鏃犳晥銆佸凡杩囨湡銆?',
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
                                    data: 'API Key 鏃犳晥鎴栧凡杩囨湡銆?',
                                    error: 'invalid_api_key'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'auth-me',
                'x-group': '韬唤',
                'x-sort-order': 10,
                'x-auth-modes': ['cookie', 'apiKey'],
                'x-required-scopes': ['api.auth.me.read'],
                'x-examples': [
                    {
                        id: 'auth-me-cookie',
                        label: 'cookie',
                        summary: '浣跨敤褰撳墠鐧诲綍浼氳瘽璇诲彇浼氳瘽淇℃伅銆?',
                        authMode: 'cookie'
                    }
                ]
            }
        },
        '/auth/password': {
            patch: {
                operationId: 'authChangePassword',
                tags: ['Auth'],
                summary: '淇敼褰撳墠璐﹀彿瀵嗙爜',
                description:
                    '楠岃瘉褰撳墠瀵嗙爜鎽樿锛屽悗绔洿鏂板瘑鐮佸苟鍚婇攢鍚屼竴璐﹀彿鐨勫叾浠?webapp 浼氳瘽锛岀劧鍚庤繑鍥炴柊鐨勫叕寮€浼氳瘽淇℃伅銆?',
                security: [
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: [
                                    'currentPasswordDigest',
                                    'newPasswordDigest'
                                ],
                                properties: {
                                    currentPasswordDigest: {
                                        type: 'string',
                                        pattern: '^[a-f0-9]{64}$',
                                        example:
                                            '8d969eef6ecad3c29a3a629280e686cff8fabdcbf6dc2c5d20d6f7d9d4b5f9f1'
                                    },
                                    newPasswordDigest: {
                                        type: 'string',
                                        pattern: '^[a-f0-9]{64}$',
                                        example:
                                            '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'
                                    }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '200': {
                        description:
                            '瀵嗙爜淇敼鎴愬姛锛屽苟杩斿洖鏂扮殑浼氳瘽淇℃伅銆?',
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
                                    $ref: '#/components/schemas/AuthSessionResponse'
                                }
                            }
                        }
                    },
                    '400': {
                        description: '璇锋眰浣撴牸寮忎笉鍚堟硶銆?',
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
                                    data: 'newPasswordDigest 鏍煎紡涓嶆纭€?',
                                    error: 'invalid_param'
                                }
                            }
                        }
                    },
                    '401': {
                        description: '褰撳墠瀵嗙爜閿欒銆?',
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
                                    data: '鏃у瘑鐮侀敊璇€?',
                                    error: 'invalid_credentials'
                                }
                            }
                        }
                    },
                    '403': {
                        description: '褰撳墠浼氳瘽缂哄皯蹇呰鏉冮檺銆?',
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
                                }
                            }
                        }
                    },
                    '429': {
                        description: '当前身份额度不足，请等待额度恢复后重试。',
                        headers: {
                            'x-api-remain': {
                                $ref: '#/components/headers/ApiRemain'
                            },
                            'x-api-cost': {
                                $ref: '#/components/headers/ApiCost'
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ApiFailureResponse'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'auth-password-change',
                'x-group': '韬唤',
                'x-sort-order': 15,
                'x-auth-modes': ['cookie', 'apiKey'],
                'x-required-scopes': ['api.auth.password.update'],
                'x-examples': [
                    {
                        id: 'auth-password-change-cookie',
                        label: 'cookie',
                        summary: '浣跨敤褰撳墠浼氳瘽淇敼瀵嗙爜銆?',
                        authMode: 'cookie',
                        body: {
                            currentPasswordDigest:
                                '8d969eef6ecad3c29a3a629280e686cff8fabdcbf6dc2c5d20d6f7d9d4b5f9f1',
                            newPasswordDigest:
                                '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'
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
                description:
                    '按日期返回分页后的每日担当记录。只要具备对应公开权限，也可以匿名访问。',
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
                            date: '20260321',
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
                            date: '20260321',
                            limit: '20',
                            cursor: '1741996800:15231'
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
                    '返回单个车次的分页历史记录。只要具备对应公开权限，也可以匿名访问。',
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
                        id: 'train-window',
                        label: '时间窗口',
                        summary: '按时间范围查询单个车次的历史记录。',
                        authMode: 'anonymous',
                        pathParams: {
                            trainCode: 'G8388'
                        },
                        query: {
                            start: '0',
                            end: '9999999999',
                            limit: '20'
                        }
                    },
                    {
                        id: 'train-cursor',
                        label: '游标翻页',
                        summary: '使用 cursor 继续读取同一车次的后续历史记录。',
                        authMode: 'anonymous',
                        pathParams: {
                            trainCode: 'C2725'
                        },
                        query: {
                            limit: '20',
                            cursor: '1773731220:59054'
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
                    '返回单个车组的分页历史记录。只要具备对应公开权限，也可以匿名访问。',
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
                        id: 'emu-window',
                        label: '时间窗口',
                        summary: '按时间范围查询单个车组的历史记录。',
                        authMode: 'anonymous',
                        pathParams: {
                            emuCode: 'CR400AF-C-2214'
                        },
                        query: {
                            start: '0',
                            end: '9999999999',
                            limit: '20'
                        }
                    },
                    {
                        id: 'emu-cursor',
                        label: '游标翻页',
                        summary:
                            '使用服务端 cursor 继续读取同一车组的后续历史记录。',
                        authMode: 'anonymous',
                        pathParams: {
                            emuCode: 'CR400AF-C-2214'
                        },
                        query: {
                            limit: '20',
                            cursor: '1773731220:59054'
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
                description:
                    '按年和月列出已生成的日导出文件。只要具备对应公开权限，也可以匿名访问。',
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
                    '读取某天已生成的导出文件；开启 binary 模式时返回原始文本，否则返回 JSON 包裹结构。',
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
                            date: '20260320'
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
                            date: '20260320'
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
