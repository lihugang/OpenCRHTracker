// 由 scripts/generate-v2-docs.mjs 生成，请勿手动编辑。
import type { OpenApiDocument } from '~/types/docs';

export const developerDocsOpenApi: OpenApiDocument = {
    openapi: '3.1.0',
    info: {
        title: 'OpenCRHTracker 开发者 API',
        version: '2.0.0',
        description:
            '面向开发者的 v2 API 文档，覆盖鉴权、每日记录、历史查询、时刻表、配属与导出接口。'
    },
    servers: [
        {
            url: '/api/v2',
            description: '同源 API 服务'
        }
    ],
    tags: [
        {
            name: 'Auth',
            description: '与当前登录会话、API Key 和额度状态相关的接口。'
        },
        {
            name: 'Records',
            description: '按日期分页读取车次与车组的担当记录。'
        },
        {
            name: 'Timetable',
            description:
                '读取车次当前时刻表、历史时刻表、车站时刻表，以及交路图图片。'
        },
        {
            name: 'History',
            description: '按车次号或车组号查询历史担当记录。'
        },
        {
            name: 'Allocation',
            description: '查询动车组的配属基础信息。'
        },
        {
            name: 'Exports',
            description: '列出并下载按日生成的 CSV 导出文件。'
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
        headers: {
            ApiRemain: {
                description: '本次请求完成后的剩余额度。',
                schema: {
                    type: 'integer',
                    format: 'int64'
                },
                example: 159
            },
            ApiCost: {
                description: '本次请求实际扣除的额度成本。',
                schema: {
                    type: 'integer',
                    format: 'int64'
                },
                example: 1
            },
            RetryAfter: {
                description: '请求被限流时建议等待的秒数。',
                schema: {
                    type: 'integer',
                    format: 'int64'
                },
                example: 300
            }
        },
        schemas: {
            ApiMeta: {
                type: 'object',
                properties: {
                    remain: {
                        type: 'integer',
                        format: 'int64'
                    },
                    cost: {
                        type: 'integer',
                        format: 'int64'
                    },
                    retryAfter: {
                        type: 'integer',
                        format: 'int64'
                    }
                },
                required: ['remain', 'cost']
            },
            ApiError: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string'
                    },
                    message: {
                        type: 'string'
                    }
                },
                required: ['code', 'message']
            },
            GetAuthMeData: {
                type: 'object',
                properties: {
                    user: {
                        $ref: '#/components/schemas/GetAuthMeData_User'
                    },
                    apiKey: {
                        $ref: '#/components/schemas/GetAuthMeData_ApiKey'
                    },
                    quota: {
                        $ref: '#/components/schemas/AuthQuotaSummary'
                    }
                }
            },
            GetAuthMeData_User: {
                type: 'object',
                properties: {
                    userId: {
                        type: 'string'
                    }
                },
                required: ['userId']
            },
            GetAuthMeData_ApiKey: {
                type: 'object',
                properties: {
                    revokeId: {
                        type: 'string'
                    },
                    issuer: {
                        $ref: '#/components/schemas/AuthApiKeyIssuer'
                    },
                    maskedApiKey: {
                        type: 'string'
                    },
                    activeFrom: {
                        type: 'integer',
                        format: 'int64'
                    },
                    expiresAt: {
                        type: 'integer',
                        format: 'int64'
                    },
                    dailyTokenLimit: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    scopes: {
                        type: 'array',
                        items: {
                            type: 'string'
                        }
                    }
                },
                required: [
                    'revokeId',
                    'issuer',
                    'maskedApiKey',
                    'activeFrom',
                    'expiresAt',
                    'dailyTokenLimit',
                    'scopes'
                ]
            },
            AuthApiKeyIssuer: {
                type: 'string',
                enum: ['unspecified', 'webapp', 'api', 'oauth']
            },
            AuthQuotaSummary: {
                type: 'object',
                properties: {
                    tokenLimit: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    remain: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    refillAmount: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    refillIntervalSeconds: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    nextRefillAt: {
                        type: 'integer',
                        format: 'int64'
                    }
                },
                required: [
                    'tokenLimit',
                    'remain',
                    'refillAmount',
                    'refillIntervalSeconds'
                ]
            },
            GetDailyRecordsData: {
                type: 'object',
                properties: {
                    serviceDay: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    cursor: {
                        type: 'string'
                    },
                    limit: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    nextCursor: {
                        type: 'string'
                    },
                    items: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/DailyRecordItem'
                        }
                    },
                    emuCodeMappings: {
                        type: 'object',
                        additionalProperties: {
                            type: 'string'
                        }
                    },
                    timetableMappings: {
                        type: 'object',
                        additionalProperties: {
                            $ref: '#/components/schemas/HistoricalTimetableSummary'
                        }
                    }
                },
                required: [
                    'serviceDay',
                    'cursor',
                    'limit',
                    'nextCursor',
                    'items'
                ]
            },
            DailyRecordItem: {
                type: 'object',
                properties: {
                    id: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    serviceDay: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    timetableId: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    emuId: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    trainCode: {
                        $ref: '#/components/schemas/TrainCode'
                    }
                },
                required: ['id', 'serviceDay', 'emuId']
            },
            TrainCode: {
                type: 'object',
                properties: {
                    prefix: {
                        type: 'string'
                    },
                    number: {
                        type: 'integer',
                        format: 'uint32'
                    }
                },
                required: ['prefix', 'number']
            },
            HistoricalTimetableSummary: {
                type: 'object',
                properties: {
                    startStation: {
                        type: 'string'
                    },
                    endStation: {
                        type: 'string'
                    },
                    startOffset: {
                        type: 'integer',
                        format: 'int64'
                    },
                    endOffset: {
                        type: 'integer',
                        format: 'int64'
                    }
                }
            },
            GetCurrentTrainTimetableData: {
                type: 'object',
                properties: {
                    updatedAt: {
                        type: 'integer',
                        format: 'int64'
                    },
                    requestTrainCode: {
                        $ref: '#/components/schemas/TrainCode'
                    },
                    trainCode: {
                        $ref: '#/components/schemas/TrainCode'
                    },
                    internalCode: {
                        type: 'string'
                    },
                    allCodes: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/TrainCode'
                        }
                    },
                    bureauCode: {
                        type: 'string'
                    },
                    bureauName: {
                        type: 'string'
                    },
                    trainDepartment: {
                        type: 'string'
                    },
                    passengerDepartment: {
                        type: 'string'
                    },
                    referenceModels: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/ReferenceModelItem'
                        }
                    },
                    startStation: {
                        type: 'string'
                    },
                    endStation: {
                        type: 'string'
                    },
                    startAt: {
                        type: 'integer',
                        format: 'int64'
                    },
                    endAt: {
                        type: 'integer',
                        format: 'int64'
                    },
                    circulation: {
                        $ref: '#/components/schemas/TrainCirculation'
                    },
                    stops: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/CurrentTrainTimetableStop'
                        }
                    },
                    serviceDay: {
                        type: 'integer',
                        format: 'uint32'
                    }
                },
                required: [
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
                    'stops',
                    'serviceDay'
                ]
            },
            ReferenceModelItem: {
                type: 'object',
                properties: {
                    model: {
                        type: 'string'
                    },
                    weightedShare: {
                        type: 'number'
                    }
                },
                required: ['model', 'weightedShare']
            },
            TrainCirculation: {
                type: 'object',
                properties: {
                    source: {
                        $ref: '#/components/schemas/TrainCirculationSource'
                    },
                    refreshAt: {
                        type: 'integer',
                        format: 'int64'
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
                },
                required: ['source', 'nodes']
            },
            TrainCirculationSource: {
                type: 'string',
                enum: ['unspecified', 'official', 'inferred']
            },
            TrainCirculationNode: {
                type: 'object',
                properties: {
                    internalCode: {
                        type: 'string'
                    },
                    allCodes: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/TrainCode'
                        }
                    },
                    startStation: {
                        type: 'string'
                    },
                    endStation: {
                        type: 'string'
                    },
                    startAt: {
                        type: 'integer',
                        format: 'int64'
                    },
                    endAt: {
                        type: 'integer',
                        format: 'int64'
                    }
                },
                required: [
                    'internalCode',
                    'allCodes',
                    'startStation',
                    'endStation',
                    'startAt',
                    'endAt'
                ]
            },
            TrainCirculationMetadata: {
                type: 'object',
                properties: {
                    routeId: {
                        type: 'string'
                    },
                    windowStart: {
                        type: 'integer',
                        format: 'int64'
                    },
                    windowEnd: {
                        type: 'integer',
                        format: 'int64'
                    },
                    threshold: {
                        type: 'number'
                    },
                    lowestLinkWeight: {
                        type: 'number'
                    },
                    lowestLinkSupportCount: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    containsLoopBreak: {
                        type: 'boolean'
                    },
                    validationState: {
                        $ref: '#/components/schemas/CirculationValidationState'
                    },
                    originalOfficialEntryKey: {
                        type: 'string'
                    },
                    splitSegmentIndex: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    splitSegmentCount: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    matchedInferredRouteId: {
                        type: 'string'
                    },
                    candidateInferredCirculation: {
                        $ref: '#/components/schemas/InferredTrainCirculationReference'
                    }
                }
            },
            CirculationValidationState: {
                type: 'string',
                enum: [
                    'unspecified',
                    'raw_official',
                    'split_official',
                    'unmatched_official'
                ]
            },
            InferredTrainCirculationReference: {
                type: 'object',
                properties: {
                    refreshAt: {
                        type: 'integer',
                        format: 'int64'
                    },
                    nodes: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/TrainCirculationNode'
                        }
                    },
                    metadata: {
                        $ref: '#/components/schemas/InferredTrainCirculationMetadata'
                    }
                },
                required: ['nodes']
            },
            InferredTrainCirculationMetadata: {
                type: 'object',
                properties: {
                    routeId: {
                        type: 'string'
                    },
                    windowStart: {
                        type: 'integer',
                        format: 'int64'
                    },
                    windowEnd: {
                        type: 'integer',
                        format: 'int64'
                    },
                    threshold: {
                        type: 'number'
                    },
                    lowestLinkWeight: {
                        type: 'number'
                    },
                    lowestLinkSupportCount: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    containsLoopBreak: {
                        type: 'boolean'
                    }
                },
                required: [
                    'routeId',
                    'windowStart',
                    'windowEnd',
                    'threshold',
                    'containsLoopBreak'
                ]
            },
            CurrentTrainTimetableStop: {
                type: 'object',
                properties: {
                    stationNo: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    stationName: {
                        type: 'string'
                    },
                    arriveAt: {
                        type: 'integer',
                        format: 'int64'
                    },
                    departAt: {
                        type: 'integer',
                        format: 'int64'
                    },
                    stationTrainCode: {
                        $ref: '#/components/schemas/TrainCode'
                    },
                    wicket: {
                        type: 'string'
                    },
                    distance: {
                        type: 'number'
                    },
                    platformNo: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    isStart: {
                        type: 'boolean'
                    },
                    isEnd: {
                        type: 'boolean'
                    }
                },
                required: [
                    'stationNo',
                    'stationName',
                    'wicket',
                    'isStart',
                    'isEnd'
                ]
            },
            GetTrainCirculationImageData: {
                type: 'object',
                properties: {
                    requestTrainCode: {
                        $ref: '#/components/schemas/TrainCode'
                    },
                    trainCode: {
                        $ref: '#/components/schemas/TrainCode'
                    },
                    documentId: {
                        type: 'string'
                    },
                    imageUrl: {
                        type: 'string'
                    },
                    content: {
                        type: 'string',
                        format: 'byte'
                    },
                    binaryContentType: {
                        type: 'string'
                    }
                },
                required: ['documentId', 'imageUrl']
            },
            GetTrainTimetableHistoryData: {
                type: 'object',
                properties: {
                    trainCode: {
                        $ref: '#/components/schemas/TrainCode'
                    },
                    items: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/TrainTimetableHistoryCoverage'
                        }
                    },
                    timetableMappings: {
                        type: 'object',
                        additionalProperties: {
                            $ref: '#/components/schemas/HistoricalTimetableContent'
                        }
                    }
                },
                required: ['items']
            },
            TrainTimetableHistoryCoverage: {
                type: 'object',
                properties: {
                    coverageId: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    timetableId: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    serviceDayStart: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    serviceDayEndExclusive: {
                        type: 'integer',
                        format: 'uint32'
                    }
                },
                required: [
                    'coverageId',
                    'timetableId',
                    'serviceDayStart',
                    'serviceDayEndExclusive'
                ]
            },
            HistoricalTimetableContent: {
                type: 'object',
                properties: {
                    timetableId: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    startStation: {
                        type: 'string'
                    },
                    endStation: {
                        type: 'string'
                    },
                    startOffset: {
                        type: 'integer',
                        format: 'int64'
                    },
                    endOffset: {
                        type: 'integer',
                        format: 'int64'
                    },
                    stops: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/TimetableStop'
                        }
                    }
                },
                required: ['timetableId', 'stops']
            },
            TimetableStop: {
                type: 'object',
                properties: {
                    stationNo: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    stationName: {
                        type: 'string'
                    },
                    arriveOffset: {
                        type: 'integer',
                        format: 'int64'
                    },
                    departOffset: {
                        type: 'integer',
                        format: 'int64'
                    },
                    stationTrainCode: {
                        $ref: '#/components/schemas/TrainCode'
                    },
                    isStart: {
                        type: 'boolean'
                    },
                    isEnd: {
                        type: 'boolean'
                    }
                },
                required: ['stationNo', 'stationName', 'isStart', 'isEnd']
            },
            GetStationTimetableData: {
                type: 'object',
                properties: {
                    stationName: {
                        type: 'string'
                    },
                    cursor: {
                        type: 'string'
                    },
                    limit: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    nextCursor: {
                        type: 'string'
                    },
                    items: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/StationTimetableRecord'
                        }
                    }
                },
                required: [
                    'stationName',
                    'cursor',
                    'limit',
                    'nextCursor',
                    'items'
                ]
            },
            StationTimetableRecord: {
                type: 'object',
                properties: {
                    trainCode: {
                        $ref: '#/components/schemas/TrainCode'
                    },
                    allCodes: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/TrainCode'
                        }
                    },
                    arriveAt: {
                        type: 'integer',
                        format: 'int64'
                    },
                    departAt: {
                        type: 'integer',
                        format: 'int64'
                    },
                    platformNo: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    startStation: {
                        type: 'string'
                    },
                    endStation: {
                        type: 'string'
                    },
                    updatedAt: {
                        type: 'integer',
                        format: 'int64'
                    },
                    referenceModels: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/ReferenceModelItem'
                        }
                    }
                },
                required: [
                    'allCodes',
                    'startStation',
                    'endStation',
                    'referenceModels'
                ]
            },
            GetTrainHistoryData: {
                type: 'object',
                properties: {
                    trainCode: {
                        $ref: '#/components/schemas/TrainCode'
                    },
                    start: {
                        type: 'integer',
                        format: 'int64'
                    },
                    end: {
                        type: 'integer',
                        format: 'int64'
                    },
                    cursor: {
                        type: 'string'
                    },
                    limit: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    nextCursor: {
                        type: 'string'
                    },
                    items: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/TrainHistoryRecord'
                        }
                    },
                    emuCodeMappings: {
                        type: 'object',
                        additionalProperties: {
                            type: 'string'
                        }
                    },
                    timetableMappings: {
                        type: 'object',
                        additionalProperties: {
                            $ref: '#/components/schemas/HistoricalTimetableSummary'
                        }
                    }
                },
                required: ['cursor', 'limit', 'nextCursor', 'items']
            },
            TrainHistoryRecord: {
                type: 'object',
                properties: {
                    id: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    serviceDay: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    timetableId: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    emuId: {
                        type: 'integer',
                        format: 'uint32'
                    }
                },
                required: ['id', 'serviceDay', 'emuId']
            },
            GetEmuAllocationData: {
                type: 'object',
                properties: {
                    emuId: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    emuCodeMappings: {
                        type: 'object',
                        additionalProperties: {
                            type: 'string'
                        }
                    },
                    model: {
                        type: 'string'
                    },
                    trainSetNo: {
                        type: 'string'
                    },
                    bureau: {
                        type: 'string'
                    },
                    trainDepot: {
                        type: 'string'
                    },
                    depot: {
                        type: 'string'
                    },
                    subModel: {
                        type: 'string'
                    },
                    customType: {
                        type: 'string'
                    },
                    trainsetManufacturer: {
                        type: 'string'
                    },
                    trailerManufacturer: {
                        type: 'string'
                    },
                    manufactureMonth: {
                        type: 'string'
                    },
                    designMaxSpeed: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    operatingMaxSpeed: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    isPublic: {
                        type: 'boolean'
                    },
                    railwayTravelCodeEnabled: {
                        type: 'boolean'
                    },
                    firstClassPowerLegrest: {
                        type: 'boolean'
                    },
                    toiletStatus: {
                        type: 'string'
                    },
                    socketLocation: {
                        type: 'string'
                    },
                    businessSeatType: {
                        type: 'string'
                    },
                    modelRemark: {
                        type: 'string'
                    },
                    note: {
                        type: 'string'
                    },
                    tags: {
                        type: 'array',
                        items: {
                            type: 'string'
                        }
                    },
                    alias: {
                        type: 'array',
                        items: {
                            type: 'string'
                        }
                    },
                    coachLayouts: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/EmuAllocationCoachLayout'
                        }
                    }
                },
                required: [
                    'emuId',
                    'model',
                    'trainSetNo',
                    'bureau',
                    'trainDepot',
                    'depot',
                    'subModel',
                    'customType',
                    'trainsetManufacturer',
                    'trailerManufacturer',
                    'manufactureMonth',
                    'designMaxSpeed',
                    'operatingMaxSpeed',
                    'isPublic',
                    'railwayTravelCodeEnabled',
                    'firstClassPowerLegrest',
                    'toiletStatus',
                    'socketLocation',
                    'businessSeatType',
                    'modelRemark',
                    'note',
                    'tags',
                    'alias',
                    'coachLayouts'
                ]
            },
            EmuAllocationCoachLayout: {
                type: 'object',
                properties: {
                    coachNo: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    coachTypeCode: {
                        type: 'string'
                    },
                    coachTypeName: {
                        type: 'string'
                    },
                    capacity: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    hasPower: {
                        type: 'boolean'
                    },
                    hasPantograph: {
                        type: 'boolean'
                    },
                    hasLargeLuggageArea: {
                        type: 'boolean'
                    },
                    hasAccessibleFacility: {
                        type: 'boolean'
                    }
                },
                required: [
                    'coachNo',
                    'coachTypeCode',
                    'coachTypeName',
                    'capacity',
                    'hasPower',
                    'hasPantograph',
                    'hasLargeLuggageArea',
                    'hasAccessibleFacility'
                ]
            },
            GetEmuHistoryData: {
                type: 'object',
                properties: {
                    emuId: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    start: {
                        type: 'integer',
                        format: 'int64'
                    },
                    end: {
                        type: 'integer',
                        format: 'int64'
                    },
                    cursor: {
                        type: 'string'
                    },
                    limit: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    nextCursor: {
                        type: 'string'
                    },
                    items: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/EmuHistoryRecord'
                        }
                    },
                    emuCodeMappings: {
                        type: 'object',
                        additionalProperties: {
                            type: 'string'
                        }
                    },
                    timetableMappings: {
                        type: 'object',
                        additionalProperties: {
                            $ref: '#/components/schemas/HistoricalTimetableSummary'
                        }
                    }
                },
                required: ['emuId', 'cursor', 'limit', 'nextCursor', 'items']
            },
            EmuHistoryRecord: {
                type: 'object',
                properties: {
                    id: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    serviceDay: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    timetableId: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    trainCode: {
                        $ref: '#/components/schemas/TrainCode'
                    }
                },
                required: ['id', 'serviceDay']
            },
            GetDailyExportIndexData: {
                type: 'object',
                properties: {
                    selectedYear: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    selectedMonth: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    availableYears: {
                        type: 'array',
                        items: {
                            type: 'integer',
                            format: 'uint32'
                        }
                    },
                    availableMonths: {
                        type: 'array',
                        items: {
                            type: 'integer',
                            format: 'uint32'
                        }
                    },
                    items: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/DailyExportIndexItem'
                        }
                    }
                },
                required: [
                    'selectedYear',
                    'selectedMonth',
                    'availableYears',
                    'availableMonths',
                    'items'
                ]
            },
            DailyExportIndexItem: {
                type: 'object',
                properties: {
                    serviceDay: {
                        type: 'integer',
                        format: 'uint32'
                    }
                },
                required: ['serviceDay']
            },
            GetDailyExportData: {
                type: 'object',
                properties: {
                    serviceDay: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    total: {
                        type: 'integer',
                        format: 'uint32'
                    },
                    content: {
                        type: 'string',
                        format: 'byte'
                    }
                },
                required: ['serviceDay', 'total', 'content']
            }
        }
    },
    paths: {
        '/auth/me': {
            get: {
                operationId: 'GetAuthMe',
                tags: ['Auth'],
                summary: '读取当前鉴权会话',
                description:
                    '返回当前登录用户、正在使用的 API Key 摘要，以及当前额度桶的状态。通常用于接入方在请求前确认自己的凭证是否仍然有效。',
                parameters: [],
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['meta', 'data'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        data: {
                                            $ref: '#/components/schemas/GetAuthMeData'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 2000,
                                        cost: 1
                                    },
                                    data: {
                                        user: {
                                            userId: 'demo-user'
                                        },
                                        apiKey: {
                                            revokeId:
                                                'ocrh_revoke_9f4f1c8c4d5a4f43',
                                            issuer: 'webapp',
                                            maskedApiKey: 'ocrh_u_abc***xyz',
                                            activeFrom: 1786636800,
                                            expiresAt: 1789228800,
                                            dailyTokenLimit: 2000,
                                            scopes: [
                                                'api.auth.me.read',
                                                'api.records.daily.read'
                                            ]
                                        },
                                        quota: {
                                            tokenLimit: 2000,
                                            remain: 1999,
                                            refillAmount: 10,
                                            refillIntervalSeconds: 300,
                                            nextRefillAt: 1786637100
                                        }
                                    }
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_api_key',
                                        message: 'API Key 无效或已过期。'
                                    }
                                }
                            }
                        }
                    },
                    '403': {
                        description:
                            '账号已被封禁，或当前凭证缺少 api.auth.me.read 权限。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'account_banned',
                                        message: '账号已被封禁。'
                                    }
                                }
                            }
                        }
                    },
                    '429': {
                        description: '额度不足或请求过于频繁。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'rate_limited',
                                        message: '额度不足，请稍后再试。'
                                    }
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
                'x-usage-scenarios': [
                    '第三方应用拿到 access_token 后，先调用这个接口确认凭证有效、额度还剩多少。',
                    '前端页面在启动时判断用户是否已登录。',
                    '开发者调试自己签发的 API Key 是否配置正确。'
                ],
                'x-faq': [
                    {
                        question: '为什么调用这个接口也能看到额度？',
                        answer: '每次响应都会带 meta 字段，里面是本次请求后的剩余额度（remain）、本次扣费（cost）和可能的重试等待时间（retryAfter）。'
                    },
                    {
                        question: 'issuer 字段表示什么？',
                        answer: '它说明这份凭证是怎么来的：webapp 表示网页登录会话，api 表示站内签发的 API Key，oauth 表示通过 OAuth 授权拿到的 access_token。'
                    }
                ]
            }
        },
        '/records/daily': {
            get: {
                operationId: 'GetDailyRecords',
                tags: ['Records'],
                summary: '分页读取每日记录',
                description:
                    '读取某一天里所有车次与车组的担当记录。每一条记录表示一个车次在某一天由某个车组担当，适合做数据同步或离线分析。',
                parameters: [
                    {
                        name: 'date',
                        in: 'query',
                        required: true,
                        description:
                            '要读取的日期，格式为 YYYYMMDD，例如 20260814。',
                        schema: {
                            type: 'string',
                            pattern: '^\\d{8}$'
                        },
                        example: '20260814'
                    },
                    {
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
                    },
                    {
                        name: 'cursor',
                        in: 'query',
                        description:
                            '分页游标，格式为 serviceDay:id（例如 20260814:681106）。第一页不需要传，翻页时直接复用上一页响应里的 nextCursor。',
                        schema: {
                            type: 'string'
                        },
                        example: '20260814:681106'
                    }
                ],
                security: [
                    {},
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: '一页每日记录数据。',
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
                                    type: 'object',
                                    required: ['meta', 'data'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        data: {
                                            $ref: '#/components/schemas/GetDailyRecordsData'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 2
                                    },
                                    data: {
                                        serviceDay: 20260814,
                                        cursor: '',
                                        limit: 2,
                                        nextCursor: '20260814:681106',
                                        items: [
                                            {
                                                id: 681107,
                                                serviceDay: 20260814,
                                                timetableId: 5096,
                                                emuId: 2844,
                                                trainCode: {
                                                    prefix: 'C',
                                                    number: 9607
                                                }
                                            },
                                            {
                                                id: 681106,
                                                serviceDay: 20260814,
                                                timetableId: 5096,
                                                emuId: 2844,
                                                trainCode: {
                                                    prefix: 'C',
                                                    number: 9606
                                                }
                                            }
                                        ],
                                        emuCodeMappings: {
                                            '2844': 'CRH380A-2844'
                                        },
                                        timetableMappings: {
                                            '5096': {
                                                startStation: '北京南',
                                                endStation: '天津',
                                                startOffset: 0,
                                                endOffset: 1800
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    '400': {
                        description:
                            '请求参数不合法：可能是日期格式、游标格式或 limit 不符合要求。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_param',
                                        message: 'date 必须使用 YYYYMMDD 格式。'
                                    }
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_api_key',
                                        message: 'API Key 无效或已过期。'
                                    }
                                }
                            }
                        }
                    },
                    '403': {
                        description: '当前凭证缺少调用该接口所需的 scope。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'forbidden',
                                        message: '缺少调用该接口所需的权限。'
                                    }
                                }
                            }
                        }
                    },
                    '429': {
                        description:
                            '额度不足或请求过于频繁，建议等 Retry-After 提示的时间后再试。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'rate_limited',
                                        message: '额度不足，请稍后再试。'
                                    }
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
                            date: '20260814',
                            limit: '2'
                        }
                    },
                    {
                        id: 'daily-next-page',
                        label: '下一页',
                        summary:
                            '复用服务端返回的 cursor，继续读取下一页每日记录。',
                        authMode: 'anonymous',
                        query: {
                            date: '20260814',
                            limit: '2',
                            cursor: '20260814:681106'
                        }
                    }
                ],
                'x-usage-scenarios': [
                    '按天拉取全量担当数据，建立自己的车次-车组对应关系表。',
                    '做一个“某天所有车次都用了哪些车组”的查询页面。'
                ],
                'x-faq': [
                    {
                        question: 'items 里的 emuId 和 trainCode 怎么理解？',
                        answer: '为了减少重复数据，记录里存的是车组 ID（emuId）和结构化的车次号（trainCode），对应的车组编号和时刻表摘要分别放在 emuCodeMappings 与 timetableMappings 里，按 ID 查表即可。'
                    },
                    {
                        question: 'serviceDay 为什么是数字而不是日期字符串？',
                        answer: 'v2 统一使用 YYYYMMDD 形式的数字表示服务日期，例如 20260814 就是 2026 年 8 月 14 日。'
                    }
                ]
            }
        },
        '/timetable/train/{trainCode}/current': {
            get: {
                operationId: 'GetCurrentTrainTimetable',
                tags: ['Timetable'],
                summary: '按车次读取当前完整时刻表',
                description:
                    '返回某车次当前的完整时刻表，包括经停站、各站到达/发车时间、检票口、站台、参考车型，以及交路信息。适合做列车详情页。',
                parameters: [
                    {
                        name: 'trainCode',
                        in: 'path',
                        required: true,
                        description:
                            '要查询的车次号，例如 G2492、D2212 或 C2001。字母大小写都可以，服务端会做标准化处理。',
                        schema: {
                            type: 'string'
                        },
                        example: 'G2492'
                    }
                ],
                security: [
                    {},
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: '当前日期下的完整车次时刻表。',
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
                                    type: 'object',
                                    required: ['meta', 'data'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        data: {
                                            $ref: '#/components/schemas/GetCurrentTrainTimetableData'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    data: {
                                        updatedAt: 1786670000,
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
                                        startAt: 1786665600,
                                        endAt: 1786672800,
                                        serviceDay: 20260814,
                                        circulation: {
                                            source: 'official',
                                            refreshAt: 1786668000,
                                            nodes: [
                                                {
                                                    internalCode:
                                                        '33000G249204',
                                                    allCodes: [
                                                        {
                                                            prefix: 'G',
                                                            number: 2492
                                                        }
                                                    ],
                                                    startStation: '包头',
                                                    endStation: '北京北',
                                                    startAt: 28800,
                                                    endAt: 39000
                                                },
                                                {
                                                    internalCode:
                                                        '24000G249307',
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
                                                }
                                            ]
                                        },
                                        stops: [
                                            {
                                                stationNo: 1,
                                                stationName: '包头',
                                                arriveAt: 1786665600,
                                                departAt: 1786665600,
                                                stationTrainCode: {
                                                    prefix: 'G',
                                                    number: 2492
                                                },
                                                wicket: '一层2检票口',
                                                distance: 0,
                                                platformNo: 2,
                                                isStart: true,
                                                isEnd: false
                                            },
                                            {
                                                stationNo: 2,
                                                stationName: '呼和浩特',
                                                arriveAt: 1786669200,
                                                departAt: 1786669500,
                                                stationTrainCode: {
                                                    prefix: 'G',
                                                    number: 2492
                                                },
                                                wicket: '4检票口',
                                                distance: 165,
                                                platformNo: 4,
                                                isStart: false,
                                                isEnd: false
                                            },
                                            {
                                                stationNo: 3,
                                                stationName: '北京北',
                                                arriveAt: 1786672800,
                                                departAt: 1786672800,
                                                stationTrainCode: {
                                                    prefix: 'G',
                                                    number: 2492
                                                },
                                                wicket: '',
                                                isStart: false,
                                                isEnd: true
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    },
                    '400': {
                        description:
                            '请求参数不合法：可能是日期格式、游标格式或 limit 不符合要求。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_param',
                                        message: 'date 必须使用 YYYYMMDD 格式。'
                                    }
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_api_key',
                                        message: 'API Key 无效或已过期。'
                                    }
                                }
                            }
                        }
                    },
                    '403': {
                        description: '当前凭证缺少调用该接口所需的 scope。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'forbidden',
                                        message: '缺少调用该接口所需的权限。'
                                    }
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'not_found',
                                        message: '当前暂无时刻表。'
                                    }
                                }
                            }
                        }
                    },
                    '429': {
                        description:
                            '额度不足或请求过于频繁，建议等 Retry-After 提示的时间后再试。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'rate_limited',
                                        message: '额度不足，请稍后再试。'
                                    }
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
                'x-usage-scenarios': [
                    '做一个列车详情页，展示某车次今天从始发到终点的全部经停信息。',
                    '结合 referenceModels 展示该车次可能使用的车型。',
                    '展示车次所在的交路（circulation），让用户知道这列车当天还跑哪些车次。'
                ],
                'x-faq': [
                    {
                        question: 'stops 里 stationTrainCode 为什么是对象？',
                        answer: 'v2 用 { prefix, number } 表示结构化车次号，例如 G2492 就是 { prefix: "G", number: 2492 }，方便程序处理而不需要解析字符串。'
                    },
                    {
                        question: '有些站的 distance 或 platformNo 没有返回？',
                        answer: '这两个字段是可选的：没有数据时字段会直接省略，而不是返回 null，这也是 v2 的通用约定。'
                    }
                ]
            }
        },
        '/timetable/train/{trainCode}/circulation/image': {
            get: {
                operationId: 'GetTrainCirculationImage',
                tags: ['Timetable'],
                summary: '获取交路图图片',
                description:
                    '根据车次的交路表和首末站坐标生成交路图。默认返回 JSON 包装结构（含图片直链），也可以让接口直接返回 PNG 或 PDF 文件内容。',
                parameters: [
                    {
                        name: 'trainCode',
                        in: 'path',
                        required: true,
                        description:
                            '要查询的车次号，例如 G2492、D2212 或 C2001。字母大小写都可以，服务端会做标准化处理。',
                        schema: {
                            type: 'string'
                        },
                        example: 'G2492'
                    },
                    {
                        name: 'format',
                        in: 'query',
                        description:
                            '交路图的输出格式：png 或 pdf。不传时默认使用 png。',
                        schema: {
                            type: 'string',
                            enum: ['png', 'pdf'],
                            default: 'png'
                        },
                        example: 'png'
                    },
                    {
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
                    }
                ],
                security: [
                    {},
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description:
                            '交路图生成成功：JSON 包装结构或原始图片/PDF 文件。',
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
                                    type: 'object',
                                    required: ['meta', 'data'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        data: {
                                            $ref: '#/components/schemas/GetTrainCirculationImageData'
                                        }
                                    }
                                },
                                example: {
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
                                }
                            },
                            'image/png': {
                                schema: {
                                    type: 'string',
                                    format: 'binary'
                                }
                            },
                            'application/pdf': {
                                schema: {
                                    type: 'string',
                                    format: 'binary'
                                }
                            }
                        }
                    },
                    '400': {
                        description:
                            '路径参数、binary 查询参数或 format 查询参数无效。',
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
                                    type: 'object',
                                    required: ['ok', 'data', 'error'],
                                    properties: {
                                        ok: {
                                            type: 'boolean'
                                        },
                                        data: {
                                            type: 'string'
                                        },
                                        error: {
                                            type: 'string'
                                        }
                                    }
                                },
                                example: {
                                    ok: false,
                                    data: 'binary 必须是 true/false',
                                    error: 'invalid_param'
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['ok', 'data', 'error'],
                                    properties: {
                                        ok: {
                                            type: 'boolean'
                                        },
                                        data: {
                                            type: 'string'
                                        },
                                        error: {
                                            type: 'string'
                                        }
                                    }
                                },
                                example: {
                                    ok: false,
                                    data: 'API Key 无效或已过期。',
                                    error: 'invalid_api_key'
                                }
                            }
                        }
                    },
                    '403': {
                        description: '当前凭证缺少调用该接口所需的 scope。',
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
                                    type: 'object',
                                    required: ['ok', 'data', 'error'],
                                    properties: {
                                        ok: {
                                            type: 'boolean'
                                        },
                                        data: {
                                            type: 'string'
                                        },
                                        error: {
                                            type: 'string'
                                        }
                                    }
                                },
                                example: {
                                    ok: false,
                                    data: '缺少调用该接口所需的权限。',
                                    error: 'forbidden'
                                }
                            }
                        }
                    },
                    '404': {
                        description: '当前时刻表或交路数据不可用。',
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
                                    type: 'object',
                                    required: ['ok', 'data', 'error'],
                                    properties: {
                                        ok: {
                                            type: 'boolean'
                                        },
                                        data: {
                                            type: 'string'
                                        },
                                        error: {
                                            type: 'string'
                                        }
                                    }
                                },
                                example: {
                                    ok: false,
                                    data: '当前暂无交路数据',
                                    error: 'not_found'
                                }
                            }
                        }
                    },
                    '422': {
                        description: '今日时刻表数据不完整，无法生成交路图。',
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
                                    type: 'object',
                                    required: ['ok', 'data', 'error'],
                                    properties: {
                                        ok: {
                                            type: 'boolean'
                                        },
                                        data: {
                                            type: 'string'
                                        },
                                        error: {
                                            type: 'string'
                                        }
                                    }
                                },
                                example: {
                                    ok: false,
                                    data: '交路节点 G2492 的首末站缺少经纬度',
                                    error: 'invalid_schedule_data'
                                }
                            }
                        }
                    },
                    '429': {
                        description: '额度不足或请求过于频繁。',
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
                                    type: 'object',
                                    required: ['ok', 'data', 'error'],
                                    properties: {
                                        ok: {
                                            type: 'boolean'
                                        },
                                        data: {
                                            type: 'string'
                                        },
                                        error: {
                                            type: 'string'
                                        }
                                    }
                                },
                                example: {
                                    ok: false,
                                    data: '额度不足，请稍后再试。',
                                    error: 'rate_limited'
                                }
                            }
                        }
                    },
                    '502': {
                        description: '上游渲染服务不可用或编译失败。',
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
                                    type: 'object',
                                    required: ['ok', 'data', 'error'],
                                    properties: {
                                        ok: {
                                            type: 'boolean'
                                        },
                                        data: {
                                            type: 'string'
                                        },
                                        error: {
                                            type: 'string'
                                        }
                                    }
                                },
                                example: {
                                    ok: false,
                                    data: '交路图渲染服务暂时不可用',
                                    error: 'upstream_unavailable'
                                }
                            }
                        }
                    }
                },
                'x-slug': 'timetable-train-circulation-image',
                'x-group': '时刻表',
                'x-sort-order': 26,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': [
                    'api.timetable.train.circulation.image.read'
                ],
                'x-examples': [
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
                        summary:
                            '返回交路图 PDF 直链，适合交给下载器或文档预览组件。',
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
                'x-usage-scenarios': [
                    '在页面里直接展示交路图：使用默认的 JSON 返回，取 imageUrl 放进 <img>。',
                    '把交路图下载成 PDF 存档或打印：设置 format=pdf。',
                    '程序直接保存图片文件：设置 binary=true 并写入本地文件。'
                ],
                'x-faq': [
                    {
                        question: 'binary 应该怎么选？',
                        answer: '需要图片直链时用 binary=false（默认）；需要直接拿到文件内容时用 binary=true。两者都支持 format=png 或 format=pdf。'
                    },
                    {
                        question: '为什么有时扣费是 2 点，有时是 20 点？',
                        answer: '交路图由上游编译服务渲染。缓存命中时按缓存档位扣费（较低），未命中时按完整渲染成本扣费（较高），失败时按失败档位扣费。'
                    }
                ]
            }
        },
        '/timetable/train/{trainCode}/history': {
            get: {
                operationId: 'GetTrainTimetableHistory',
                tags: ['Timetable'],
                summary: '按车次读取历史时刻表',
                description:
                    '返回指定车次的历史时刻表覆盖范围，并通过 timetableMappings 一并返回每份历史时刻表的完整内容（包含全部经停站）。v2 已把“历史时刻表详情”合并进这个接口，不需要再单独请求一次。',
                parameters: [
                    {
                        name: 'trainCode',
                        in: 'path',
                        required: true,
                        description:
                            '要查询的车次号，例如 G2492、D2212 或 C2001。字母大小写都可以，服务端会做标准化处理。',
                        schema: {
                            type: 'string'
                        },
                        example: 'G2492'
                    }
                ],
                security: [
                    {},
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: '车次历史时刻表覆盖范围与完整内容。',
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
                                    type: 'object',
                                    required: ['meta', 'data'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        data: {
                                            $ref: '#/components/schemas/GetTrainTimetableHistoryData'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 2
                                    },
                                    data: {
                                        trainCode: {
                                            prefix: 'G',
                                            number: 512
                                        },
                                        items: [
                                            {
                                                coverageId: 6845,
                                                timetableId: 5479,
                                                serviceDayStart: 20260502,
                                                serviceDayEndExclusive: 20260503
                                            },
                                            {
                                                coverageId: 6846,
                                                timetableId: 5480,
                                                serviceDayStart: 20260503,
                                                serviceDayEndExclusive: 20260504
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
                                                        arriveOffset: 47340,
                                                        departOffset: 47340,
                                                        stationTrainCode: {
                                                            prefix: 'G',
                                                            number: 512
                                                        },
                                                        isStart: true,
                                                        isEnd: false
                                                    },
                                                    {
                                                        stationNo: 7,
                                                        stationName: '北京西',
                                                        arriveOffset: 66060,
                                                        departOffset: 66060,
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
                                    }
                                }
                            }
                        }
                    },
                    '400': {
                        description:
                            '请求参数不合法：可能是日期格式、游标格式或 limit 不符合要求。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_param',
                                        message: 'date 必须使用 YYYYMMDD 格式。'
                                    }
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_api_key',
                                        message: 'API Key 无效或已过期。'
                                    }
                                }
                            }
                        }
                    },
                    '403': {
                        description: '当前凭证缺少调用该接口所需的 scope。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'forbidden',
                                        message: '缺少调用该接口所需的权限。'
                                    }
                                }
                            }
                        }
                    },
                    '429': {
                        description:
                            '额度不足或请求过于频繁，建议等 Retry-After 提示的时间后再试。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'rate_limited',
                                        message: '额度不足，请稍后再试。'
                                    }
                                }
                            }
                        }
                    }
                },
                'x-slug': 'timetable-train-history',
                'x-group': '时刻表',
                'x-sort-order': 27,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': ['api.timetable.train.history.read'],
                'x-examples': [
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
                'x-usage-scenarios': [
                    '展示某车次历史上使用过哪些时刻表，以及每份时刻表的生效日期范围。',
                    '把某一天的历史时刻表内容（如经停站）拉出来做对比或归档。'
                ],
                'x-faq': [
                    {
                        question:
                            'items 里的 serviceDayStart 和 serviceDayEndExclusive 是什么意思？',
                        answer: '它们表示这份时刻表的生效区间：从 serviceDayStart 当天开始，到 serviceDayEndExclusive 当天之前结束，即结束日期是不包含在区间内的。'
                    },
                    {
                        question: '为什么历史详情没有单独的接口了？',
                        answer: 'v2 把历史时刻表的内容直接放在 timetableMappings 里，与覆盖范围一起返回。mapping 的 key 就是 items 里的 timetableId，取出来后就是完整内容。'
                    }
                ]
            }
        },
        '/timetable/station/{stationName}': {
            get: {
                operationId: 'GetStationTimetable',
                tags: ['Timetable'],
                summary: '按车站读取当日站内时刻表',
                description:
                    '返回指定车站当日的计划车次列表，按列车到站时间升序排列，并附上每趟车的参考车型。适合做车站查询页。',
                parameters: [
                    {
                        name: 'stationName',
                        in: 'path',
                        required: true,
                        description:
                            '要查询的车站名，例如 北京南。中文站名在请求时会被自动做 URL 编码，调试器里直接填中文即可。',
                        schema: {
                            type: 'string'
                        },
                        example: '北京南'
                    },
                    {
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
                    },
                    {
                        name: 'cursor',
                        in: 'query',
                        description:
                            '分页游标，格式为 serviceDay:id（例如 20260814:681106）。第一页不需要传，翻页时直接复用上一页响应里的 nextCursor。',
                        schema: {
                            type: 'string'
                        },
                        example: '20260814:681106'
                    }
                ],
                security: [
                    {},
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: '指定车站的当日站内时刻表分页结果。',
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
                                    type: 'object',
                                    required: ['meta', 'data'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        data: {
                                            $ref: '#/components/schemas/GetStationTimetableData'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    data: {
                                        stationName: '北京南',
                                        cursor: '',
                                        limit: 1,
                                        nextCursor: '20260814:22440',
                                        items: [
                                            {
                                                trainCode: {
                                                    prefix: 'C',
                                                    number: 2001
                                                },
                                                allCodes: [
                                                    {
                                                        prefix: 'C',
                                                        number: 2001
                                                    }
                                                ],
                                                arriveAt: 1786669200,
                                                departAt: 1786669200,
                                                platformNo: 2,
                                                startStation: '北京南',
                                                endStation: '天津',
                                                updatedAt: 1786650000,
                                                referenceModels: [
                                                    {
                                                        model: 'CR400BF-S',
                                                        weightedShare: 1
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    },
                    '400': {
                        description:
                            '请求参数不合法：可能是日期格式、游标格式或 limit 不符合要求。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_param',
                                        message: 'date 必须使用 YYYYMMDD 格式。'
                                    }
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_api_key',
                                        message: 'API Key 无效或已过期。'
                                    }
                                }
                            }
                        }
                    },
                    '403': {
                        description: '当前凭证缺少调用该接口所需的 scope。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'forbidden',
                                        message: '缺少调用该接口所需的权限。'
                                    }
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'not_found',
                                        message: '当前暂无该车站的时刻表。'
                                    }
                                }
                            }
                        }
                    },
                    '429': {
                        description:
                            '额度不足或请求过于频繁，建议等 Retry-After 提示的时间后再试。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'rate_limited',
                                        message: '额度不足，请稍后再试。'
                                    }
                                }
                            }
                        }
                    }
                },
                'x-slug': 'timetable-station',
                'x-group': '时刻表',
                'x-sort-order': 28,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': ['api.timetable.station.read'],
                'x-examples': [
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
                            cursor: '20260814:22440'
                        }
                    }
                ],
                'x-usage-scenarios': [
                    '做一个车站查询页，展示某站今天所有经停车次及时间。',
                    '配合站点搜索，让用户从搜索结果直接跳到车站时刻表。'
                ],
                'x-faq': [
                    {
                        question:
                            '同一趟车在 stationName 里为什么会有多个 allCodes？',
                        answer: 'allCodes 表示该趟车当天可能使用的全部车次号（例如中途换号），列表里的第一个通常就是当前显示的车次号。'
                    },
                    {
                        question: '列表按什么顺序排列？',
                        answer: '按列车到站时间升序排列。始发站没有到站时间时，会按发车时间参与排序。'
                    }
                ]
            }
        },
        '/history/train/{trainCode}': {
            get: {
                operationId: 'GetTrainHistory',
                tags: ['History'],
                summary: '返回单个车次的历史担当记录',
                description:
                    '按车次号分页查询历史担当记录，也就是“这趟车在过去每一天由哪个车组担当”。支持用时间范围过滤，也支持游标翻页。',
                parameters: [
                    {
                        name: 'trainCode',
                        in: 'path',
                        required: true,
                        description:
                            '要查询的车次号，例如 G2492、D2212 或 C2001。字母大小写都可以，服务端会做标准化处理。',
                        schema: {
                            type: 'string'
                        },
                        example: 'G2492'
                    },
                    {
                        name: 'start',
                        in: 'query',
                        description:
                            '起始时间戳，单位是秒，包含边界。留空表示从最早记录开始。',
                        schema: {
                            type: 'integer',
                            minimum: 0
                        },
                        example: 1786636800
                    },
                    {
                        name: 'end',
                        in: 'query',
                        description:
                            '结束时间戳，单位是秒，包含边界。留空表示读到最新记录。',
                        schema: {
                            type: 'integer',
                            minimum: 0
                        },
                        example: 1786723200
                    },
                    {
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
                    },
                    {
                        name: 'cursor',
                        in: 'query',
                        description:
                            '分页游标，格式为 serviceDay:id（例如 20260814:681106）。第一页不需要传，翻页时直接复用上一页响应里的 nextCursor。',
                        schema: {
                            type: 'string'
                        },
                        example: '20260814:681106'
                    }
                ],
                security: [
                    {},
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: '一页车次历史记录。',
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
                                    type: 'object',
                                    required: ['meta', 'data'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        data: {
                                            $ref: '#/components/schemas/GetTrainHistoryData'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 2
                                    },
                                    data: {
                                        trainCode: {
                                            prefix: 'G',
                                            number: 512
                                        },
                                        cursor: '',
                                        limit: 2,
                                        nextCursor: '20260814:496651',
                                        items: [
                                            {
                                                id: 512596,
                                                serviceDay: 20260814,
                                                timetableId: 5479,
                                                emuId: 5156
                                            },
                                            {
                                                id: 496651,
                                                serviceDay: 20260813,
                                                timetableId: 5479,
                                                emuId: 5159
                                            }
                                        ],
                                        emuCodeMappings: {
                                            '5156': 'CR400BF-A-5156',
                                            '5159': 'CR400BF-A-5159'
                                        },
                                        timetableMappings: {
                                            '5479': {
                                                startStation: '汉口',
                                                endStation: '北京西',
                                                startOffset: 47340,
                                                endOffset: 66060
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    '400': {
                        description:
                            '请求参数不合法：可能是日期格式、游标格式或 limit 不符合要求。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_param',
                                        message: 'date 必须使用 YYYYMMDD 格式。'
                                    }
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_api_key',
                                        message: 'API Key 无效或已过期。'
                                    }
                                }
                            }
                        }
                    },
                    '403': {
                        description: '当前凭证缺少调用该接口所需的 scope。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'forbidden',
                                        message: '缺少调用该接口所需的权限。'
                                    }
                                }
                            }
                        }
                    },
                    '429': {
                        description:
                            '额度不足或请求过于频繁，建议等 Retry-After 提示的时间后再试。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'rate_limited',
                                        message: '额度不足，请稍后再试。'
                                    }
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
                            cursor: '20260814:496651'
                        }
                    }
                ],
                'x-usage-scenarios': [
                    '做“某车次近期担当车组”的时间线展示。',
                    '统计某趟车在一段时间内使用过哪些车型或车组。'
                ],
                'x-faq': [
                    {
                        question: 'start 和 end 都留空会怎样？',
                        answer: '表示不限制时间范围，从最早记录开始读到最新记录。想限定范围时，两个参数都传会更可靠。'
                    },
                    {
                        question: '为什么记录里只有 emuId 而不是车组编号？',
                        answer: '车组编号放在 emuCodeMappings 里按 ID 查询，这样大量重复的车组编号只需要保存一次，响应体积更小。'
                    }
                ]
            }
        },
        '/allocation/emu/{emuCode}': {
            get: {
                operationId: 'GetEmuAllocation',
                tags: ['Allocation'],
                summary: '返回单一车组的配属信息',
                description:
                    '返回一个动车组的配属基础信息，包括车型、配属路局、动车段/所、制造商、速度等级、座椅与服务设施，以及车厢布局。',
                parameters: [
                    {
                        name: 'emuCode',
                        in: 'path',
                        required: true,
                        description:
                            '要查询的车组编号，例如 CR400AF-C-2214。车组编号区分大小写，请按页面展示的格式填写。',
                        schema: {
                            type: 'string'
                        },
                        example: 'CR400AF-C-2214'
                    }
                ],
                security: [
                    {},
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: '动车组配属基础信息。',
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
                                    type: 'object',
                                    required: ['meta', 'data'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        data: {
                                            $ref: '#/components/schemas/GetEmuAllocationData'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    data: {
                                        emuId: 2214,
                                        emuCodeMappings: {
                                            '2214': 'CR400AF-C-2214'
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
                                        operatingMaxSpeed: 350,
                                        isPublic: true,
                                        railwayTravelCodeEnabled: true,
                                        firstClassPowerLegrest: true,
                                        toiletStatus: '蹲厕、马桶均有',
                                        socketLocation:
                                            '洗手台，首末排侧面；一二等座：坐垫接缝处，前排座椅后背(USB Type A)',
                                        businessSeatType: '鱼骨式',
                                        modelRemark:
                                            '本车座椅靠背硬度较大，可能导致一定程度不适。',
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
                                    }
                                }
                            }
                        }
                    },
                    '400': {
                        description:
                            '请求参数不合法：可能是日期格式、游标格式或 limit 不符合要求。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_param',
                                        message: 'date 必须使用 YYYYMMDD 格式。'
                                    }
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_api_key',
                                        message: 'API Key 无效或已过期。'
                                    }
                                }
                            }
                        }
                    },
                    '403': {
                        description: '当前凭证缺少调用该接口所需的 scope。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'forbidden',
                                        message: '缺少调用该接口所需的权限。'
                                    }
                                }
                            }
                        }
                    },
                    '404': {
                        description: '未找到该动车组的配属信息。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'not_found',
                                        message: '未找到该动车组配属信息'
                                    }
                                }
                            }
                        }
                    },
                    '429': {
                        description:
                            '额度不足或请求过于频繁，建议等 Retry-After 提示的时间后再试。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'rate_limited',
                                        message: '额度不足，请稍后再试。'
                                    }
                                }
                            }
                        }
                    }
                },
                'x-slug': 'allocation-emu',
                'x-group': '配属',
                'x-sort-order': 35,
                'x-auth-modes': ['anonymous', 'cookie', 'apiKey'],
                'x-required-scopes': ['api.allocation.emu.read'],
                'x-examples': [
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
                'x-usage-scenarios': [
                    '做车组详情页，展示车型、配属和车厢布局。',
                    '根据 designMaxSpeed 与 operatingMaxSpeed 判断车组适用线路。',
                    '展示 coachLayouts，帮助乘客了解车厢座席类型与充电设施。'
                ],
                'x-faq': [
                    {
                        question: 'emuCodeMappings 在这里有什么用？',
                        answer: '接口支持别名查询：你传入的编号会被标准化成 emuId，然后通过 emuCodeMappings 返回对应的标准车组编号，方便确认查询结果。'
                    },
                    {
                        question: '为什么有些字段是空字符串？',
                        answer: 'v2 约定隐式字段（如 subModel、customType、note）总是返回，没有数据时返回默认值（空字符串、0 或 false），可选项才会省略。'
                    }
                ]
            }
        },
        '/history/emu/{emuCode}': {
            get: {
                operationId: 'GetEmuHistory',
                tags: ['History'],
                summary: '返回单一车组的历史担当记录',
                description:
                    '按车组号分页查询历史担当记录，也就是“这个车组在过去每一天跑了哪些车次”。支持时间范围过滤和游标翻页。',
                parameters: [
                    {
                        name: 'emuCode',
                        in: 'path',
                        required: true,
                        description:
                            '要查询的车组编号，例如 CR400AF-C-2214。车组编号区分大小写，请按页面展示的格式填写。',
                        schema: {
                            type: 'string'
                        },
                        example: 'CR400AF-C-2214'
                    },
                    {
                        name: 'start',
                        in: 'query',
                        description:
                            '起始时间戳，单位是秒，包含边界。留空表示从最早记录开始。',
                        schema: {
                            type: 'integer',
                            minimum: 0
                        },
                        example: 1786636800
                    },
                    {
                        name: 'end',
                        in: 'query',
                        description:
                            '结束时间戳，单位是秒，包含边界。留空表示读到最新记录。',
                        schema: {
                            type: 'integer',
                            minimum: 0
                        },
                        example: 1786723200
                    },
                    {
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
                    },
                    {
                        name: 'cursor',
                        in: 'query',
                        description:
                            '分页游标，格式为 serviceDay:id（例如 20260814:681106）。第一页不需要传，翻页时直接复用上一页响应里的 nextCursor。',
                        schema: {
                            type: 'string'
                        },
                        example: '20260814:681106'
                    }
                ],
                security: [
                    {},
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: '一页车组历史记录。',
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
                                    type: 'object',
                                    required: ['meta', 'data'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        data: {
                                            $ref: '#/components/schemas/GetEmuHistoryData'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 2
                                    },
                                    data: {
                                        emuId: 5156,
                                        cursor: '',
                                        limit: 2,
                                        nextCursor: '20260814:528424',
                                        items: [
                                            {
                                                id: 528425,
                                                serviceDay: 20260814,
                                                timetableId: 6373,
                                                trainCode: {
                                                    prefix: 'G',
                                                    number: 1824
                                                }
                                            },
                                            {
                                                id: 528424,
                                                serviceDay: 20260814,
                                                timetableId: 6373,
                                                trainCode: {
                                                    prefix: 'G',
                                                    number: 1821
                                                }
                                            }
                                        ],
                                        emuCodeMappings: {
                                            '5156': 'CR400BF-A-5156'
                                        },
                                        timetableMappings: {
                                            '6373': {
                                                startStation: '北京西',
                                                endStation: '广州南',
                                                startOffset: 3600,
                                                endOffset: 25200
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    '400': {
                        description:
                            '请求参数不合法：可能是日期格式、游标格式或 limit 不符合要求。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_param',
                                        message: 'date 必须使用 YYYYMMDD 格式。'
                                    }
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_api_key',
                                        message: 'API Key 无效或已过期。'
                                    }
                                }
                            }
                        }
                    },
                    '403': {
                        description: '当前凭证缺少调用该接口所需的 scope。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'forbidden',
                                        message: '缺少调用该接口所需的权限。'
                                    }
                                }
                            }
                        }
                    },
                    '429': {
                        description:
                            '额度不足或请求过于频繁，建议等 Retry-After 提示的时间后再试。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'rate_limited',
                                        message: '额度不足，请稍后再试。'
                                    }
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
                            cursor: '20260814:528424'
                        }
                    }
                ],
                'x-usage-scenarios': [
                    '做车组详情页的历史担当时间线。',
                    '追踪某个车组近期的运用轨迹，判断它常跑哪些线路。'
                ],
                'x-faq': [
                    {
                        question: 'items 里的 trainCode 为什么是对象？',
                        answer: 'v2 统一用 { prefix, number } 表示结构化车次号。需要展示时拼成字符串即可，例如 prefix 为 "G"、number 为 1824 时就是 G1824。'
                    },
                    {
                        question: '为什么会出现同一服务日有多条记录？',
                        answer: '同一车组一天可能担当多趟车次，每趟车都会产生一条记录，所以同一天出现多条是正常的。'
                    }
                ]
            }
        },
        '/exports/daily/index': {
            get: {
                operationId: 'GetDailyExportIndex',
                tags: ['Exports'],
                summary: '列出可用的日导出文件',
                description:
                    '按年和月列出已生成的日导出文件。接口会返回当前选中的年月、可选年份和月份，以及该月每一天是否有导出文件。',
                parameters: [
                    {
                        name: 'year',
                        in: 'query',
                        description:
                            '按年份筛选导出索引，例如 2026。留空时自动选择最近有导出文件的月份。',
                        schema: {
                            type: 'integer',
                            minimum: 1
                        },
                        example: 2026
                    },
                    {
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
                    }
                ],
                security: [
                    {},
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description: '当前可用的导出日期索引。',
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
                                    type: 'object',
                                    required: ['meta', 'data'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        data: {
                                            $ref: '#/components/schemas/GetDailyExportIndexData'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 10
                                    },
                                    data: {
                                        selectedYear: 2026,
                                        selectedMonth: 8,
                                        availableYears: [2024, 2025, 2026],
                                        availableMonths: [
                                            1, 2, 3, 4, 5, 6, 7, 8
                                        ],
                                        items: [
                                            {
                                                serviceDay: 20260814
                                            },
                                            {
                                                serviceDay: 20260813
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    },
                    '400': {
                        description:
                            '请求参数不合法：可能是日期格式、游标格式或 limit 不符合要求。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_param',
                                        message: 'date 必须使用 YYYYMMDD 格式。'
                                    }
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'invalid_api_key',
                                        message: 'API Key 无效或已过期。'
                                    }
                                }
                            }
                        }
                    },
                    '403': {
                        description: '当前凭证缺少调用该接口所需的 scope。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'forbidden',
                                        message: '缺少调用该接口所需的权限。'
                                    }
                                }
                            }
                        }
                    },
                    '429': {
                        description:
                            '额度不足或请求过于频繁，建议等 Retry-After 提示的时间后再试。',
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
                                    type: 'object',
                                    required: ['meta', 'error'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        error: {
                                            $ref: '#/components/schemas/ApiError'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 159,
                                        cost: 1
                                    },
                                    error: {
                                        code: 'rate_limited',
                                        message: '额度不足，请稍后再试。'
                                    }
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
                            month: '8'
                        }
                    }
                ],
                'x-usage-scenarios': [
                    '在接入前先查询哪些日期有导出文件，避免请求不存在的日期。',
                    '给导出页做一个年月选择器，年份和月份直接来自 availableYears 和 availableMonths。'
                ],
                'x-faq': [
                    {
                        question: '不传 year 和 month 会怎样？',
                        answer: '服务端会自动选择最近有导出文件的一年一月，并把 selectedYear、selectedMonth 返回给你。'
                    },
                    {
                        question: 'items 里的 serviceDay 是什么？',
                        answer: '就是有导出文件的日期，使用 YYYYMMDD 数字格式。可以用它直接拼接“读取单日导出文件”接口的路径参数。'
                    }
                ]
            }
        },
        '/exports/daily/{date}': {
            get: {
                operationId: 'GetDailyExport',
                tags: ['Exports'],
                summary: '读取单日导出文件',
                description:
                    '读取某一天的车次-车组对应关系导出文件。默认返回 JSON 包装结构（CSV 文本放在 content 字段里），也可以让接口直接返回原始 CSV 文本并附带下载响应头。',
                parameters: [
                    {
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
                    },
                    {
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
                    }
                ],
                security: [
                    {},
                    {
                        bearerAuth: []
                    },
                    {
                        cookieAuth: []
                    }
                ],
                responses: {
                    '200': {
                        description:
                            '单日导出内容：JSON 包装结构或原始 CSV 文本。',
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
                                    type: 'object',
                                    required: ['meta', 'data'],
                                    properties: {
                                        meta: {
                                            $ref: '#/components/schemas/ApiMeta'
                                        },
                                        data: {
                                            $ref: '#/components/schemas/GetDailyExportData'
                                        }
                                    }
                                },
                                example: {
                                    meta: {
                                        remain: 149,
                                        cost: 400
                                    },
                                    data: {
                                        serviceDay: 20260814,
                                        total: 2,
                                        content:
                                            'trainCode,emuCode,startStation,endStation,startAt,endAt\nG1,CR400AF-2149,北京南,上海虹桥,1786665600,1786680000\nG2,CR400BF-5028,北京南,上海虹桥,1786665600,1786680000'
                                    }
                                }
                            },
                            'text/csv': {
                                schema: {
                                    type: 'string'
                                },
                                example:
                                    'trainCode,emuCode,startStation,endStation,startAt,endAt\nG1,CR400AF-2149,北京南,上海虹桥,1786665600,1786680000\nG2,CR400BF-5028,北京南,上海虹桥,1786665600,1786680000'
                            }
                        }
                    },
                    '400': {
                        description: '路径参数或查询参数不合法。',
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
                                    type: 'object',
                                    required: ['ok', 'data', 'error'],
                                    properties: {
                                        ok: {
                                            type: 'boolean'
                                        },
                                        data: {
                                            type: 'string'
                                        },
                                        error: {
                                            type: 'string'
                                        }
                                    }
                                },
                                example: {
                                    ok: false,
                                    data: 'date 必须使用 YYYYMMDD 格式。',
                                    error: 'invalid_param'
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['ok', 'data', 'error'],
                                    properties: {
                                        ok: {
                                            type: 'boolean'
                                        },
                                        data: {
                                            type: 'string'
                                        },
                                        error: {
                                            type: 'string'
                                        }
                                    }
                                },
                                example: {
                                    ok: false,
                                    data: 'API Key 无效或已过期。',
                                    error: 'invalid_api_key'
                                }
                            }
                        }
                    },
                    '403': {
                        description: '当前凭证缺少调用该接口所需的 scope。',
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
                                    type: 'object',
                                    required: ['ok', 'data', 'error'],
                                    properties: {
                                        ok: {
                                            type: 'boolean'
                                        },
                                        data: {
                                            type: 'string'
                                        },
                                        error: {
                                            type: 'string'
                                        }
                                    }
                                },
                                example: {
                                    ok: false,
                                    data: '缺少调用该接口所需的权限。',
                                    error: 'forbidden'
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
                            },
                            'Retry-After': {
                                $ref: '#/components/headers/RetryAfter'
                            }
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['ok', 'data', 'error'],
                                    properties: {
                                        ok: {
                                            type: 'boolean'
                                        },
                                        data: {
                                            type: 'string'
                                        },
                                        error: {
                                            type: 'string'
                                        }
                                    }
                                },
                                example: {
                                    ok: false,
                                    data: '20260814.csv 尚未生成。',
                                    error: 'not_found'
                                }
                            }
                        }
                    },
                    '429': {
                        description: '额度不足或请求过于频繁。',
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
                                    type: 'object',
                                    required: ['ok', 'data', 'error'],
                                    properties: {
                                        ok: {
                                            type: 'boolean'
                                        },
                                        data: {
                                            type: 'string'
                                        },
                                        error: {
                                            type: 'string'
                                        }
                                    }
                                },
                                example: {
                                    ok: false,
                                    data: '额度不足，请稍后再试。',
                                    error: 'rate_limited'
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
                        summary:
                            '直接返回原始 CSV 文本和下载响应头，便于文件处理。',
                        authMode: 'anonymous',
                        pathParams: {
                            date: '20260814'
                        },
                        query: {
                            binary: 'true'
                        }
                    }
                ],
                'x-usage-scenarios': [
                    '下载某一天的完整担当数据做离线分析。',
                    '把 CSV 直接交给数据库导入工具：使用 binary=true 会拿到干净的文件内容。'
                ],
                'x-faq': [
                    {
                        question: '为什么导出格式只有 CSV？',
                        answer: 'v2 的日导出统一为 CSV，不再提供 JSONL 选项。需要结构化数据时，可以先用索引接口确定日期，再解析 CSV 内容。'
                    },
                    {
                        question: 'total 和 content 分别是什么？',
                        answer: 'total 是当天导出文件里的记录条数，content 是 CSV 文本本身。JSON 包装模式下两者都会返回。'
                    }
                ]
            }
        }
    }
};

export default developerDocsOpenApi;
