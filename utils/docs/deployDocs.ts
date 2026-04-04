export interface DocsFieldCard {
    path: string;
    valueType: string;
    required?: boolean;
    description: string;
    notes?: string[];
}

export interface DocsContentBlock {
    type: 'paragraph' | 'linked-paragraph' | 'list' | 'code' | 'field-cards';
    title?: string;
    text?: string;
    textBefore?: string;
    linkText?: string;
    to?: string;
    textAfter?: string;
    items?: string[];
    language?: string;
    code?: string;
    cards?: DocsFieldCard[];
}

export interface DocsContentSection {
    id: string;
    title: string;
    summary: string;
    blocks: DocsContentBlock[];
}

export const deployChecklist = [
    '要求服务器已安装 Node.js 20 以上版本及 pnpm 10 以上版本。'
];

export const deployDocsSections: DocsContentSection[] = [
    {
        id: 'prerequisites',
        title: '前置条件',
        summary: '当前部署方案为单个 Node 进程配合持久化数据目录。',
        blocks: [
            {
                type: 'list',
                items: [
                    '在目标机器上安装 Node.js 20+ 和 pnpm 10+。',
                    '将代码部署到一个具有写权限的应用目录。',
                    '为 ./data/ 目录设置持久化存储。'
                ]
            }
        ]
    },
    {
        id: 'build',
        title: '构建项目',
        summary: '从 GitHub 上下载 Open CRH Tracker 代码并构建',
        blocks: [
            {
                type: 'paragraph',
                text: '如果你的网络环境不佳，请你在下载代码前先通过'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'git config --global http.proxy <proxy_address>\ngit config --global https.proxy <proxy_address>'
            },
            {
                type: 'paragraph',
                text: '设置 Git 的网络代理，或者启用 TUN 模式。'
            },
            {
                type: 'paragraph',
                text: '在确保网络环境没有问题后，请执行以下代码以从 GitHub 上下载项目。'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'git clone https://github.com/lihugang/OpenCRHTracker.git --depth=1\ncd OpenCRHTracker'
            },
            {
                type: 'paragraph',
                text: '随后，你需要通过 pnpm 安装程序需要的依赖，执行：'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'pnpm install'
            },
            {
                type: 'paragraph',
                text: '安装成功后，执行'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'pnpm build'
            },
            {
                type: 'paragraph',
                text: '以生成构建。'
            }
        ]
    },
    {
        id: 'config',
        title: 'config.json 配置指南',
        summary:
            '服务器启动时会读取 data/config.json 下的配置文件，并校验配置合法性。',
        blocks: [
            {
                type: 'linked-paragraph',
                textBefore: '在修改 config.json 前，请确保你已经阅读了《',
                linkText: '数据抓取流程',
                to: '/docs/crawl',
                textAfter: '》并了解 Open CRH Tracker 的工作原理。'
            },
            {
                type: 'list',
                title: '配置文件加载规则',
                items: [
                    '开发环境优先读取 data/config.dev.json，找不到时回退到 data/config.json。',
                    '生产环境优先读取 data/config.prod.json，找不到时回退到 data/config.json。',
                    '启动时会校验配置文件合法性，字段缺失、时间格式错误、前缀范围重叠、分页上限非法等问题都会直接阻止服务启动。'
                ]
            },
            {
                type: 'paragraph',
                text: '部署前先确定当前环境实际会读取哪份配置文件，再进行修改。生产环境的配置修改不会热更新，修改后需要重启 Node 进程。'
            },
            {
                type: 'code',
                title: '完整示例：data/config.json',
                language: 'json',
                code: '{\n    "$schema": "../assets/json/configScheme.json",\n    "spider": {\n        "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/7.0.17(0x17001126) NetType/WIFI Language/zh_CN",\n        "params": {\n            "eKey": "OpenCRHTracker",\n            "jsonpCallback": "OpenCRHTracker",\n            "routeProbeCarCode": "CR400AF-C-2214"\n        },\n        "rateLimit": {\n            "query": {\n                "minIntervalMs": 1500\n            },\n            "search": {\n                "minIntervalMs": 8000\n            }\n        },\n        "scheduleProbe": {\n            "dailyTimeHHmm": "0000",\n            "retryAttempts": 3,\n            "maxBatchSize": 200,\n            "checkpointFlushEvery": 20,\n            "refresh": {\n                "batchSize": 20,\n                "ttlHours": 24,\n                "generateIntervalHours": 24\n            },\n            "probe": {\n                "defaultRetry": 5,\n                "overlapRetryDelaySeconds": 3600\n            },\n            "coupling": {\n                "statusResetTimeHHmm": "0000",\n                "detectDelaySeconds": 900,\n                "detectCooldownSeconds": 3600\n            },\n            "prefixRules": [\n                {\n                    "prefix": "G",\n                    "minNo": 1,\n                    "maxNo": 9999\n                },\n                {\n                    "prefix": "D",\n                    "minNo": 1,\n                    "maxNo": 9999\n                },\n                {\n                    "prefix": "C",\n                    "minNo": 1,\n                    "maxNo": 9999\n                },\n                {\n                    "prefix": "S",\n                    "minNo": 5500,\n                    "maxNo": 5600\n                }\n            ]\n        }\n    },\n    "data": {\n        "assets": {\n            "EMUList": {\n                "file": "data/emu_list.jsonl",\n                "provider": "https://storage.lihugang.top/open_crh_tracker/initialized_data/emu_list.jsonl",\n                "refresh": {\n                    "enabled": true,\n                    "refreshAt": "0000"\n                }\n            },\n            "QRCode": {\n                "file": "data/qrcode.jsonl",\n                "provider": "https://storage.lihugang.top/open_crh_tracker/initialized_data/qrcode.jsonl",\n                "refresh": {\n                    "enabled": true,\n                    "refreshAt": "0000"\n                }\n            },\n            "schedule": {\n                "file": "data/schedule.json",\n                "provider": "https://storage.lihugang.top/open_crh_tracker/initialized_data/schedule.json"\n            }\n        },\n        "databases": {\n            "task": "data/task.db",\n            "EMUTracked": "data/emu.db",\n            "users": "data/users.db",\n            "feedback": "data/feedback.db"\n        },\n        "runtime": {\n            "adminTraffic": {\n                "file": "data/runtime/admin-traffic.json",\n                "flushIntervalMinutes": 30\n            },\n            "requestMetrics12306": {\n                "file": "data/runtime/12306-request-metrics.json",\n                "retentionDays": 3,\n                "flushIntervalMinutes": 10\n            }\n        }\n    },\n    "user": {\n        "saltLength": 16,\n        "apiKeyPrefixes": {\n            "webapp": "ocrh_webapp_",\n            "api": "ocrh_api_"\n        },\n        "apiKeyBytes": 24,\n        "apiKeyTtlSeconds": 2592000,\n        "apiKeyMaxLifetimeSeconds": 157680000,\n        "apiKeyNameLength": {\n            "minLength": 1,\n            "maxLength": 64\n        },\n        "adminUserIds": [\n            "admin-user-id"\n        ],\n        "favorites": {\n            "maxEntries": 10\n        },\n        "pushSubscriptions": {\n            "maxDevices": 5,\n            "maxEventSubscriptions": 50,\n            "syncTimeoutSeconds": 30\n        },\n        "signKey": "replace-with-strong-random-secret",\n        "scrypt": {\n            "keyLength": 64,\n            "cost": 16384,\n            "blockSize": 8,\n            "parallelization": 1\n        }\n    },\n    "api": {\n        "versionPrefix": "/api/v1",\n        "apiKeyHeader": "authorization",\n        "authCookieName": "token",\n        "authRateLimit": {\n            "login": {\n                "maxRequests": 10,\n                "windowSeconds": 1800\n            },\n            "register": {\n                "maxRequests": 3,\n                "windowSeconds": 86400\n            }\n        },\n        "authCache": {\n            "userRecord": {\n                "maxEntries": 1024,\n                "defaultTtlSeconds": 1800\n            },\n            "apiKeyRecord": {\n                "maxEntries": 4096,\n                "defaultTtlSeconds": 21600\n            },\n            "userProfile": {\n                "maxEntries": 256,\n                "defaultTtlSeconds": 21600\n            }\n        },\n        "payload": {\n            "maxStringLength": 16384\n        },\n        "feedback": {\n            "validation": {\n                "createBody": {\n                    "minLength": 2,\n                    "maxLength": 12000\n                },\n                "replyBody": {\n                    "minLength": 2,\n                    "maxLength": 2000\n                },\n                "title": {\n                    "minLength": 4,\n                    "maxLength": 80\n                }\n            }\n        },\n        "headers": {\n            "remain": "x-api-remain",\n            "cost": "x-api-cost",\n            "retryAfter": "Retry-After"\n        },\n        "cache": {\n            "currentDayMaxAgeSeconds": 300,\n            "historicalMaxAgeSeconds": 31536000,\n            "searchIndexMaxAgeSeconds": 1800,\n            "sitemapMaxAgeSeconds": 86400\n        },\n        "pagination": {\n            "defaultLimit": 20,\n            "maxLimit": 200\n        },\n        "timestampUnit": "seconds",\n        "debug": {\n            "enableEchoError": true\n        },\n        "permissions": {\n            "anonymousScopes": [\n                "api.config.read",\n                "api.search.read",\n                "api.records.daily.read",\n                "api.history.train.read",\n                "api.history.emu.read",\n                "api.timetable.train.read",\n                "api.timetable.station.read",\n                "api.exports.daily.read",\n                "api.feedback.read",\n                "api.feedback.create"\n            ],\n            "issuedKeyDefaultScopes": [\n                "api.config.read",\n                "api.search.read",\n                "api.records.daily.read",\n                "api.history.train.read",\n                "api.history.emu.read",\n                "api.timetable.train.read",\n                "api.timetable.station.read",\n                "api.exports.daily.read",\n                "api.feedback.read",\n                "api.feedback.create",\n                "api.feedback.reply",\n                "api.auth.me.read",\n                "api.auth.logout",\n                "api.auth.password.update",\n                "api.auth.api-keys.read",\n                "api.auth.api-keys.create",\n                "api.auth.api-keys.revoke",\n                "api.auth.favorites.read",\n                "api.auth.favorites.write",\n                "api.auth.subscriptions.read",\n                "api.auth.subscriptions.write"\n            ],\n            "creatableKeyMaxScopes": [\n                "api.auth.me.read",\n                "api.records.daily.read",\n                "api.history.train.read",\n                "api.history.emu.read",\n                "api.timetable.train.read",\n                "api.timetable.station.read",\n                "api.exports.daily.read"\n            ]\n        }\n    },\n    "task": {\n        "startup": {\n            "disabledExecutors": []\n        },\n        "apiKeyCleanup": {\n            "retentionDays": 7,\n            "dailyTimeHHmm": "0000"\n        },\n        "dailyExport": {\n            "dailyTimeHHmm": "0000"\n        },\n        "referenceModel": {\n            "windowDays": 14,\n            "batchSize": 1000,\n            "threshold": 0.3,\n            "dailyTimeHHmm": "0300"\n        },\n        "scheduler": {\n            "pollIntervalMs": 180000,\n            "maxTasksPerQuery": 65535,\n            "idle": {\n                "maxTasksPerTick": 256,\n                "emaAlpha": 0.3\n            }\n        }\n    },\n    "logging": {\n        "retentionDays": 5\n    },\n    "quota": {\n        "anonymousMaxTokens": 25,\n        "userMaxTokens": 1000,\n        "refillAmount": 5,\n        "refillIntervalSeconds": 300,\n        "resetToMaxOnRestart": true,\n        "consumeTokens": true\n    },\n    "cost": {\n        "fixed": {\n            "health": 0,\n            "authMe": 1,\n            "authLogout": 1,\n            "authChangePassword": 5,\n            "debugEchoError": 0,\n            "authIssueApiKey": 5,\n            "authListApiKeys": 1,\n            "authRevokeApiKey": 1,\n            "searchIndex": 1,\n            "timetableTrain": 1,\n            "exportDailyIndex": 2,\n            "exportDaily": 50\n        },\n        "perRecord": {\n            "historyEmu": {\n                "unitCost": 0.05,\n                "rounding": "ceil"\n            },\n            "historyTrain": {\n                "unitCost": 0.05,\n                "rounding": "ceil"\n            },\n            "recordsDaily": {\n                "unitCost": 0.05,\n                "rounding": "ceil"\n            },\n            "timetableStation": {\n                "unitCost": 0.05,\n                "rounding": "ceil"\n            }\n        }\n    }\n}'
            },
            {
                type: 'field-cards',
                title: 'spider：抓取 12306 数据',
                text: '这一组决定 12306 抓取行为和探测频率。',
                cards: [
                    {
                        path: 'spider.userAgent',
                        valueType: 'string',
                        required: true,
                        description: '抓取请求使用的 User-Agent。',
                        notes: ['建议保持一个稳定、能被上游接受的移动端 UA。']
                    },
                    {
                        path: 'spider.params',
                        valueType: 'object',
                        required: true,
                        description:
                            '抓取接口固定参数，包含 eKey、jsonpCallback 和 routeProbeCarCode。',
                        notes: []
                    },
                    {
                        path: 'spider.rateLimit.query.minIntervalMs',
                        valueType: 'integer',
                        required: true,
                        description:
                            '查询车次、车组号和畅行码接口的最小调用间隔，单位毫秒。',
                        notes: []
                    },
                    {
                        path: 'spider.rateLimit.search.minIntervalMs',
                        valueType: 'integer',
                        required: true,
                        description:
                            '通过 12306 搜索接口检索启用车次号的最小调用间隔，单位毫秒。'
                    },
                    {
                        path: 'spider.scheduleProbe.dailyTimeHHmm',
                        valueType: 'string(HHmm)',
                        required: true,
                        description: '每天生成车次探测任务的时间点，北京时间。',
                        notes: []
                    },
                    {
                        path: 'spider.scheduleProbe.retryAttempts / maxBatchSize / checkpointFlushEvery',
                        valueType: 'integer',
                        required: true,
                        description:
                            '控制车次探测任务的失败重试次数、单批处理上限和检查点落盘频率。'
                    },
                    {
                        path: 'spider.scheduleProbe.refresh',
                        valueType: 'object',
                        required: true,
                        description:
                            '控制时刻表刷新任务的批次、TTL 和生成间隔。'
                    },
                    {
                        path: 'spider.scheduleProbe.probe',
                        valueType: 'object',
                        required: true,
                        description:
                            '探测重试次数与 12306 接口数据异常的重试策略。'
                    },
                    {
                        path: 'spider.scheduleProbe.coupling',
                        valueType: 'object',
                        required: true,
                        description: '担当关系探测的状态重置、延迟和冷却参数。',
                        notes: ['statusResetTimeHHmm 也必须是 HHmm 字符串。']
                    },
                    {
                        path: 'spider.scheduleProbe.prefixRules',
                        valueType: 'array<object>',
                        required: true,
                        description: '允许探测的车次前缀与号段范围。',
                        notes: [
                            'prefix 必须是大写字母。',
                            '同一 prefix 的号段不能重叠。',
                            '数组不能为空。'
                        ]
                    }
                ]
            },
            {
                type: 'field-cards',
                title: 'data：数据库与静态资产文件',
                text: '这一组决定数据库文件、schedule 文件和初始化资产的实际落盘位置。',
                cards: [
                    {
                        path: 'data.assets.EMUList',
                        valueType: 'object',
                        required: true,
                        description: 'EMU 列表文件路径、下载地址与刷新时间。',
                        notes: [
                            'refresh.enabled=true 时 provider 必填。',
                            'refresh.refreshAt 必须是 HHmm 字符串。'
                        ]
                    },
                    {
                        path: 'data.assets.QRCode',
                        valueType: 'object',
                        required: true,
                        description:
                            '铁路畅行码资产文件路径、下载地址与刷新时间。',
                        notes: [
                            'refresh.enabled=true 时 provider 必填。',
                            'refresh.refreshAt 必须是 HHmm 字符串。'
                        ]
                    },
                    {
                        path: 'data.assets.schedule',
                        valueType: 'object',
                        required: true,
                        description: '时刻表文件路径与来源地址。',
                        notes: [
                            'file 路径必须可读写；provider 建议保持可用。',
                            'schedule.json 会在旧版格式下自动升级，无需手工删除旧文件。',
                            '当前格式会持久化完整经停站、当前站车次与检票口信息。'
                        ]
                    },
                    {
                        path: 'data.databases.task',
                        valueType: 'string',
                        required: true,
                        description: '任务调度数据库路径。'
                    },
                    {
                        path: 'data.databases.EMUTracked',
                        valueType: 'string',
                        required: true,
                        description: '担当历史与日记录数据库路径。'
                    },
                    {
                        path: 'data.databases.users',
                        valueType: 'string',
                        required: true,
                        description: '用户、登录态和 API Key 数据库路径。'
                    },
                    {
                        path: 'data.databases.feedback',
                        valueType: 'string',
                        required: true,
                        description: '反馈与回复数据数据库路径。',
                        notes: ['所有数据库路径都建议指向持久化磁盘。']
                    }
                ]
            },
            {
                type: 'field-cards',
                title: 'data.runtime：运行时统计文件',
                text: '这一组决定管理员流量统计与 12306 请求计数的落盘位置、保留天数和定时写盘间隔。',
                cards: [
                    {
                        path: 'data.runtime.adminTraffic.file',
                        valueType: 'string',
                        required: true,
                        description: '管理员流量统计文件路径。',
                        notes: [
                            '服务启动时会优先尝试从该文件恢复统计窗口。',
                            '文件父目录必须可写，建议放在持久化磁盘。'
                        ]
                    },
                    {
                        path: 'data.runtime.adminTraffic.flushIntervalMinutes',
                        valueType: 'integer',
                        required: true,
                        description:
                            '管理员流量统计的定时落盘间隔，单位分钟，默认值为 30。',
                        notes: ['仅在内存状态有变化时写盘。']
                    },
                    {
                        path: 'data.runtime.requestMetrics12306.file',
                        valueType: 'string',
                        required: true,
                        description: '12306 请求计数文件路径。',
                        notes: [
                            '管理员被动告警页的请求曲线直接读取该文件恢复的数据。',
                            '12306 请求计数不再通过日志回放恢复。'
                        ]
                    },
                    {
                        path: 'data.runtime.requestMetrics12306.retentionDays',
                        valueType: 'integer',
                        required: true,
                        description: '12306 请求计数保留天数，默认值为 3。',
                        notes: [
                            '系统只保留最近 N 天的半小时桶。',
                            '超出保留窗口后，管理员页不再提供对应日期的请求曲线。'
                        ]
                    },
                    {
                        path: 'data.runtime.requestMetrics12306.flushIntervalMinutes',
                        valueType: 'integer',
                        required: true,
                        description:
                            '12306 请求计数的定时落盘间隔，单位分钟，默认值为 10。',
                        notes: ['间隔越短，异常崩溃时潜在丢失的数据窗口越小。']
                    }
                ]
            },
            {
                type: 'field-cards',
                title: 'user：用户与 API Key 安全参数',
                text: '这一组决定密码派生策略、API Key 生命周期和登录签名密钥。',
                cards: [
                    {
                        path: 'user.saltLength',
                        valueType: 'integer',
                        required: true,
                        description: '密码盐长度。'
                    },
                    {
                        path: 'user.apiKeyPrefixes',
                        valueType: 'object',
                        required: true,
                        description: '分别定义 webapp 和 API Key 的前缀。',
                        notes: [
                            '新部署请使用 webapp/api 两个前缀。',
                            '两个前缀不能重复。'
                        ]
                    },
                    {
                        path: 'user.apiKeyBytes',
                        valueType: 'integer',
                        required: true,
                        description: '生成 API Key 时的随机字节数。'
                    },
                    {
                        path: 'user.apiKeyTtlSeconds',
                        valueType: 'integer',
                        required: true,
                        description: '默认签发的 API Key 生命周期，单位秒。'
                    },
                    {
                        path: 'user.apiKeyMaxLifetimeSeconds',
                        valueType: 'integer',
                        required: false,
                        description: '允许签发的最大 API Key 生命周期上限。',
                        notes: [
                            '省略时默认 157680000 秒。',
                            '必须不小于 apiKeyTtlSeconds。'
                        ]
                    },
                    {
                        path: 'user.apiKeyNameLength',
                        valueType: 'object',
                        required: true,
                        description:
                            'API Key 名称长度限制，包含 minLength 和 maxLength。',
                        notes: [
                            '前端签发表单和服务端接口会共用这组限制。',
                            'maxLength 必须大于等于 minLength。'
                        ]
                    },
                    {
                        path: 'user.adminUserIds',
                        valueType: 'array<string>',
                        required: false,
                        description:
                            '管理员用户 ID 列表，命中的 webapp 登录用户会额外获得 api.admin 权限。',
                        notes: [
                            '可以留空；留空表示不通过配置文件授予管理员。',
                            '生产环境建议通过 OCRH_ADMIN_USERS 覆盖，格式为逗号分隔的用户 ID 列表。',
                            '当 OCRH_ADMIN_USERS 非空时，会覆盖 user.adminUserIds。'
                        ]
                    },
                    {
                        path: 'user.favorites.maxEntries',
                        valueType: 'integer',
                        required: true,
                        description: '单个用户允许同步保存的最大收藏数。',
                        notes: [
                            '当前前端收藏能力依赖这个上限，超限时接口会直接报错。',
                            '本次默认值为 10。'
                        ]
                    },
                    {
                        path: 'user.pushSubscriptions.maxDevices / user.pushSubscriptions.maxEventSubscriptions / user.pushSubscriptions.syncTimeoutSeconds',
                        valueType: 'integer',
                        required: true,
                        description:
                            'Device limit for stored PushSubscription endpoints, reserved event-subscription rule limit, and current-device sync timeout in seconds.',
                        notes: [
                            'maxDevices counts stored PushSubscription endpoints per user.',
                            'One physical device may consume multiple entries when it uses different browsers, profiles, or PWA installs.',
                            'maxEventSubscriptions is reserved for future event-subscription rules and is not enforced by the current code.',
                            'syncTimeoutSeconds controls how long the dashboard waits for permission prompts, Service Worker readiness, and browser subscription calls before showing a timeout error; the default is 30 seconds.'
                        ]
                    },
                    {
                        path: 'user.signKey',
                        valueType: 'string',
                        required: true,
                        description: '登录签名密钥。',
                        notes: [
                            '生产环境建议通过 OCRH_SIGN_KEY 覆盖，而不是把真实密钥直接写进配置文件。',
                            '修改后现有相关登录态可能失效。'
                        ]
                    },
                    {
                        path: 'user.scrypt',
                        valueType: 'object',
                        required: true,
                        description:
                            '密码派生算法参数，包含 keyLength、cost、blockSize、parallelization。'
                    }
                ]
            },
            {
                type: 'field-cards',
                title: 'api：接口基础行为、鉴权与权限范围',
                text: '这一组决定 API 路径、请求头、Cookie、缓存、分页以及公开权限边界。',
                cards: [
                    {
                        path: 'api.versionPrefix',
                        valueType: 'string',
                        required: true,
                        description: 'API 统一前缀，例如 /api/v1。'
                    },
                    {
                        path: 'api.apiKeyHeader',
                        valueType: 'string',
                        required: true,
                        description: 'API Key 所使用的请求头名称。',
                        notes: [
                            '如果使用 authorization，文档和调试器会按 Bearer 形式发送。'
                        ]
                    },
                    {
                        path: 'api.authCookieName',
                        valueType: 'string',
                        required: true,
                        description: '浏览器登录态使用的 Cookie 名称。'
                    },
                    {
                        path: 'api.authRateLimit',
                        valueType: 'object',
                        required: true,
                        description: '登录与注册接口的限流配置。'
                    },
                    {
                        path: 'api.authCache',
                        valueType: 'object',
                        required: true,
                        description:
                            '用户记录、用户资料和 API Key 记录缓存的容量与 TTL。'
                    },
                    {
                        path: 'api.authCache.userProfile',
                        valueType: 'object',
                        required: true,
                        description:
                            'user profile 数据 JSON 的服务端缓存容量与 TTL。',
                        notes: [
                            '收藏接口读写成功后会直接回写这一层缓存，而不是简单删除缓存。',
                            '本次推荐值为 maxEntries=256，defaultTtlSeconds=21600。'
                        ]
                    },
                    {
                        path: 'api.payload.maxStringLength',
                        valueType: 'integer',
                        required: true,
                        description: '请求体允许的最大字符串长度。'
                    },
                    {
                        path: 'api.feedback.validation',
                        valueType: 'object',
                        required: true,
                        description:
                            '反馈接口后端校验使用的长度限制配置，分别控制创建反馈正文、回复正文和管理员修改标题时的最小/最大长度。',
                        notes: [
                            'createBody 对应 POST /api/v1/feedback/topics 的 body 长度范围。',
                            'replyBody 对应 POST /api/v1/feedback/topics/[id]/messages 的 body 长度范围。',
                            'title 对应 PATCH /api/v1/feedback/topics/[id] 的 title 长度范围。'
                        ]
                    },
                    {
                        path: 'api.headers',
                        valueType: 'object',
                        required: true,
                        description: '额度剩余、成本和重试时间的响应头名称。'
                    },
                    {
                        path: 'api.cache',
                        valueType: 'object',
                        required: true,
                        description:
                            '当前日、历史、搜索索引、sitemap 和 timetable 接口成功响应的缓存时长。',
                        notes: [
                            'sitemapMaxAgeSeconds 用于控制 /sitemap.xml 响应的 Cache-Control max-age。',
                            'timetableMaxAgeSeconds 用于控制 /api/v1/timetable/train/* 和 /api/v1/timetable/station/* 成功响应的 Cache-Control max-age。'
                        ]
                    },
                    {
                        path: 'api.pagination',
                        valueType: 'object',
                        required: true,
                        description: '分页默认大小和最大上限。',
                        notes: ['maxLimit 必须不小于 defaultLimit。']
                    },
                    {
                        path: 'api.timestampUnit',
                        valueType: 'string',
                        required: true,
                        description: '时间戳单位。',
                        notes: ['当前代码只支持 seconds。']
                    },
                    {
                        path: 'api.debug.enableEchoError',
                        valueType: 'boolean',
                        required: true,
                        description: '是否允许调试接口回显错误。'
                    },
                    {
                        path: 'api.permissions.anonymousScopes',
                        valueType: 'array<string>',
                        required: true,
                        description: '匿名访问允许拥有的 scopes。',
                        notes: [
                            '这组配置直接决定公开可匿名调用的接口范围。',
                            '如果要公开车次详情页时刻表弹窗，需要包含 api.timetable.train.read。',
                            '如果要公开车站页时刻表接口，需要包含 api.timetable.station.read。'
                        ]
                    },
                    {
                        path: 'api.permissions.issuedKeyDefaultScopes',
                        valueType: 'array<string>',
                        required: true,
                        description: '新签发 API Key 的默认权限集合。',
                        notes: [
                            '如需默认允许当前车次时刻表接口，请包含 api.timetable.train.read。',
                            '如需默认允许车站时刻表接口，请包含 api.timetable.station.read。',
                            '如需让 Web 端收藏功能开箱即用，请包含 api.auth.favorites.read 和 api.auth.favorites.write。'
                        ]
                    },
                    {
                        path: 'api.permissions.creatableKeyMaxScopes',
                        valueType: 'array<string>',
                        required: true,
                        description:
                            '前端可签发 API Key 时允许选择的最大权限范围。',
                        notes: [
                            '若希望外部调用方可勾选当前车次时刻表接口，这里也要包含 api.timetable.train.read。',
                            '若希望外部调用方可勾选车站时刻表接口，这里也要包含 api.timetable.station.read。'
                        ]
                    }
                ]
            },
            {
                type: 'field-cards',
                title: 'task：后台任务与调度器',
                text: '这一组决定启动时禁用的执行器、定时任务时间以及轮询调度行为。',
                cards: [
                    {
                        path: 'task.startup.disabledExecutors',
                        valueType: 'array<string>',
                        required: false,
                        description: '启动时跳过的执行器列表。',
                        notes: [
                            '只能使用 build_today_schedule、generate_route_refresh_tasks、dispatch_daily_probe_tasks、clear_daily_probe_status、cleanup_revoked_api_keys、export_daily_records、rebuild_reference_model_index。',
                            '为空数组表示全部启用。'
                        ]
                    },
                    {
                        path: 'task.apiKeyCleanup.retentionDays',
                        valueType: 'integer',
                        required: true,
                        description: '吊销 API Key 的保留天数。'
                    },
                    {
                        path: 'task.apiKeyCleanup.dailyTimeHHmm',
                        valueType: 'string(HHmm)',
                        required: true,
                        description: '每日执行 API Key 清理任务的时间。'
                    },
                    {
                        path: 'task.dailyExport.dailyTimeHHmm',
                        valueType: 'string(HHmm)',
                        required: true,
                        description: '每日导出任务的执行时间。'
                    },
                    {
                        path: 'task.referenceModel',
                        valueType: 'object',
                        required: true,
                        description:
                            'Reference model index rebuild task settings.',
                        notes: [
                            'windowDays sets the historical window; the current default is 14.',
                            'batchSize sets the paged scan size for daily_emu_routes; the current default is 1000.',
                            'threshold is the weightedShare cutoff and must be > 0 and <= 1.',
                            'dailyTimeHHmm controls the daily rebuild time for rebuild_reference_model_index.'
                        ]
                    },
                    {
                        path: 'task.scheduler.pollIntervalMs',
                        valueType: 'integer',
                        required: true,
                        description: '调度器轮询间隔，单位毫秒。'
                    },
                    {
                        path: 'task.scheduler.maxTasksPerQuery',
                        valueType: 'integer',
                        required: true,
                        description: '单次查询最多取回的任务数。'
                    },
                    {
                        path: 'task.scheduler.idle.maxTasksPerTick',
                        valueType: 'integer',
                        required: true,
                        description: '空闲模式下每个 tick 最多拉起的任务数。'
                    },
                    {
                        path: 'task.scheduler.idle.emaAlpha',
                        valueType: 'number',
                        required: true,
                        description: '空闲调度使用的 EMA 系数。',
                        notes: ['必须大于 0 且小于等于 1。']
                    }
                ]
            },
            {
                type: 'field-cards',
                title: 'logging：日志文件',
                text: '这一组决定 logs/ 目录下按日滚动日志的保留时间；12306 请求计数已独立落盘，不再写入日志。',
                cards: [
                    {
                        path: 'logging.retentionDays',
                        valueType: 'integer',
                        required: true,
                        description: '应用日志的总保留天数，默认值为 5。',
                        notes: [
                            '保留天数包含当前当天正在写入的日志文件。',
                            '日志文件位于 logs/ 目录，可按运维策略另行备份。',
                            '12306 请求计数不会写入日志，日志中仅继续保留 warning、error 等异常信息。'
                        ]
                    }
                ]
            },
            {
                type: 'field-cards',
                title: 'quota：额度与补充策略',
                text: '这一组决定匿名用户和登录用户的额度桶大小，以及额度恢复方式。',
                cards: [
                    {
                        path: 'quota.anonymousMaxTokens',
                        valueType: 'integer',
                        required: true,
                        description: '匿名访问的额度桶上限。'
                    },
                    {
                        path: 'quota.userMaxTokens',
                        valueType: 'integer',
                        required: true,
                        description: '登录用户的额度桶上限。'
                    },
                    {
                        path: 'quota.refillAmount',
                        valueType: 'integer',
                        required: true,
                        description: '每个补充周期恢复的额度数量。'
                    },
                    {
                        path: 'quota.refillIntervalSeconds',
                        valueType: 'integer',
                        required: true,
                        description: '额度补充周期，单位秒。'
                    },
                    {
                        path: 'quota.resetToMaxOnRestart',
                        valueType: 'boolean',
                        required: true,
                        description: '服务重启后是否把额度恢复到上限。'
                    },
                    {
                        path: 'quota.consumeTokens',
                        valueType: 'boolean',
                        required: true,
                        description: '是否实际扣减额度。',
                        notes: ['关闭后可以保留成本计算，但不会真正消耗额度。']
                    }
                ]
            },
            {
                type: 'field-cards',
                title: 'cost：接口耗额策略',
                text: '这一组决定每个接口、以及按记录数量计费接口的额度成本。',
                cards: [
                    {
                        path: 'cost.fixed.health / authMe / authLogout / debugEchoError',
                        valueType: 'integer',
                        required: true,
                        description: '健康检查、身份相关和调试接口的固定成本。'
                    },
                    {
                        path: 'cost.fixed.authChangePassword / authIssueApiKey / authListApiKeys / authRevokeApiKey',
                        valueType: 'integer',
                        required: true,
                        description: 'API Key 管理接口的固定成本。'
                    },
                    {
                        path: 'cost.fixed.searchIndex / timetableTrain / exportDailyIndex / exportDaily',
                        valueType: 'integer',
                        required: true,
                        description: '搜索、当前时刻表与导出接口的固定成本。'
                    },
                    {
                        path: 'cost.perRecord.historyEmu',
                        valueType: 'object',
                        required: true,
                        description: '按车组历史查询的按记录计费规则。',
                        notes: ['当前 rounding 只支持 ceil。']
                    },
                    {
                        path: 'cost.perRecord.historyTrain',
                        valueType: 'object',
                        required: true,
                        description: '按车次历史查询的按记录计费规则。',
                        notes: ['当前 rounding 只支持 ceil。']
                    },
                    {
                        path: 'cost.perRecord.recordsDaily',
                        valueType: 'object',
                        required: true,
                        description: '每日记录查询的按记录计费规则。',
                        notes: ['当前 rounding 只支持 ceil。']
                    },
                    {
                        path: 'cost.perRecord.timetableStation',
                        valueType: 'object',
                        required: true,
                        description: '车站时刻表分页查询的按记录计费规则。',
                        notes: ['当前 rounding 只支持 ceil。']
                    }
                ]
            },
            {
                type: 'list',
                title: '修改配置后的建议',
                items: [
                    '修改 data.databases 或 data.assets 路径前先备份旧文件，再验证新路径具备正确的读写权限。',
                    '修改 user.signKey、api.apiKeyHeader、api.authCookieName 等身份相关字段后，应该视为一次完整重启变更并安排验证。',
                    '修改 user.adminUserIds 或 OCRH_ADMIN_USERS 后需要重启 Node 进程，新的登录会话才会按最新名单授予管理员权限。',
                    '提高 api.permissions.anonymousScopes、quota 或 cost 前，先确认你准备公开暴露的接口范围和限额策略。',
                    '修改 spider.scheduleProbe.prefixRules、dailyTimeHHmm 或 task.scheduler 参数后，重启后应观察首轮任务执行是否符合预期。'
                ]
            }
        ]
    },
    {
        id: 'run',
        title: '启动服务',
        summary: '构建完成和确认配置文件无误后，可启动服务。',
        blocks: [
            {
                type: 'paragraph',
                text: '请先设置登录签名秘钥，该秘钥将被用于签名用户的 token，切勿泄露。'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'export OCRH_SIGN_KEY=<xxxxxxxx>'
            },
            {
                type: 'paragraph',
                text: '如果需要授予管理员权限，请设置管理员用户 ID 列表；多个用户使用英文逗号分隔。'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'export OCRH_ADMIN_USERS=<user-id-1>,<user-id-2>'
            },
            {
                type: 'paragraph',
                text: '然后设置服务器监听端口，默认为 3000'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'export NITRO_PORT=<port>'
            },
            {
                type: 'paragraph',
                text: '启动服务'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'nohup node .output/server/index.mjs>log.log 2>&1 &'
            },
            {
                type: 'paragraph',
                text: '应用会在 logs/ 目录下按天滚动写入日志，同时按 data.runtime 配置把管理员流量统计和 12306 请求计数分别写入独立文件。12306 请求计数不再进入日志。'
            }
        ]
    },
    {
        id: 'operations',
        title: '运维建议',
        summary: '把 data 目录视为需要持久化和备份的运行时数据目录。',
        blocks: [
            {
                type: 'paragraph',
                text: '更新代码前建议先停服务、备份 data 目录和当前生效的配置文件，再替换代码、重新构建并启动。'
            },
            {
                type: 'paragraph',
                text: '请确保 data.runtime.adminTraffic.file 与 data.runtime.requestMetrics12306.file 的父目录可写；管理员流量统计按 30 分钟默认周期落盘，12306 请求计数按 10 分钟默认周期落盘并按 retentionDays 自动裁剪。'
            },
            {
                type: 'paragraph',
                text: '当前运行时统计文件按单实例设计；如果部署多实例，请避免多个进程同时写同一份 runtime 文件。'
            }
        ]
    }
];
