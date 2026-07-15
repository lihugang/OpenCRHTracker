import configExample from '~/assets/json/config.example.json';

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

const configExampleText = JSON.stringify(configExample, null, 4);

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
            },
            {
                type: 'paragraph',
                text: '默认情况下，构建产物会按当前运行时依赖关系携带需要的二进制依赖。如果你准备在一台机器上构建、再上传到另一台 Node 或 libc 环境可能不同的服务器，可以改用下面这个可选命令，让这些二进制依赖不再被复制进 .output/server/node_modules。'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'NUXT_EXTERNALIZE_NATIVE_DEPS=1 pnpm build'
            },
            {
                type: 'paragraph',
                text: '启用这个环境变量后，目标服务器在启动前需要先在项目根目录安装依赖，例如执行 pnpm install --frozen-lockfile，以便在服务器本地安装适配当前环境的二进制依赖。'
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
                text: '部署前先确定当前环境实际会读取哪份配置文件，再进行修改。生产环境的配置修改不会主动热更新，修改后请重启 Node 进程或者管理员面板手动重载。'
            },
            {
                type: 'code',
                title: '完整示例：assets/json/config.example.json',
                language: 'json',
                code: configExampleText
            },
            {
                type: 'paragraph',
                text: '如果需要启用管理端的来源时间线和重联扫描结果查看，还需要补充一组独立的 provenance 数据库与运行时配置。'
            },
            {
                type: 'code',
                title: '增量示例：来源追踪与历史时刻表积累配置',
                language: 'json',
                code: '{\n    "data": {\n        "databases": {\n            "trainProvenance": "data/train-provenance.db",\n            "timetableHistory": "data/timetable-history.db"\n        },\n        "runtime": {\n            "trainProvenance": {\n                "enabled": true,\n                "retentionDays": 7\n            }\n        }\n    }\n}'
            },
            {
                type: 'list',
                items: [
                    '`data.databases.trainProvenance`：来源事件数据库文件路径，用于管理端“来源时间线”和“重联扫描结果”查询。',
                    '`data.databases.timetableHistory`：内部历史时刻表积累数据库文件路径，用于保存规范化停站内容、停站数据哈希值和按日期压缩后的时刻表覆盖时间段。',
                    '`data.runtime.trainProvenance.enabled`：是否启用来源事件记录，默认值为 true；关闭后不再为任务写入新的来源事件，相关管理端查询会返回禁用状态。',
                    '`data.runtime.trainProvenance.retentionDays`：来源事件保留天数，默认值为 7，最小值为 1；服务启动时会按该值清理过期记录。'
                ]
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
                        path: 'spider.rateLimit.stationBoard.minIntervalMs',
                        valueType: 'integer',
                        required: true,
                        description:
                            '调用车站大屏和车站时刻相关 12306 接口的最小调用间隔，单位毫秒。'
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
                        path: 'spider.scheduleProbe.probe.latestExecutionTimeHHmm',
                        valueType: 'string(HHmm)',
                        required: true,
                        description:
                            '控制首轮探测任务派发允许执行到的最晚时间；设置为 0000 表示关闭这个限制。',
                        notes: [
                            '只影响任务派发的执行时间，不代表列车真实发车时间。'
                        ]
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
                text: '这一组决定数据库文件、时刻表文件和初始化资产的实际落盘位置。',
                cards: [
                    {
                        path: 'data.assets.EMUList',
                        valueType: 'object',
                        required: true,
                        description:
                            '动车组清单导出 JSON 文件路径、下载地址与刷新时间。',
                        notes: [
                            '默认文件建议为 data/emu_list.json。',
                            'refresh.enabled=true 时 provider 必填。',
                            'refresh.refreshAt 必须是非空 HHmm 字符串数组。',
                            '管理员页面支持本地重载和远程刷新，刷新后会立即影响配属信息查询、畅行码探测和车组别名解析。'
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
                            'refresh.refreshAt 必须是非空 HHmm 字符串数组。'
                        ]
                    },
                    {
                        path: 'data.assets.qrcodeDetection',
                        valueType: 'object',
                        required: true,
                        description:
                            '固定车组畅行码检测计划文件路径、下载地址与刷新时间。',
                        notes: [
                            '默认文件建议为 data/qrcode_detection.json。',
                            'refresh.enabled=true 时 provider 必填。',
                            'refresh.refreshAt 必须是非空 HHmm 字符串数组。',
                            '管理员页面支持本地重载和远程刷新，刷新后会重新校验并同步未来派发任务。'
                        ]
                    },
                    {
                        path: 'data.assets.trainStyleMapping',
                        valueType: 'object',
                        required: true,
                        description:
                            '参考车型回退使用的 12306 列车样式映射文件路径、下载地址与刷新时间。',
                        notes: [
                            '默认文件建议为 data/train_style_mapping.json。',
                            'refresh.enabled=true 时 provider 必填。',
                            'refresh.refreshAt 必须是非空 HHmm 字符串数组。',
                            '管理员页面支持本地重载和远程刷新，刷新后会立即影响参考车型的回退映射结果。'
                        ]
                    },
                    {
                        path: 'data.assets.stationCoord',
                        valueType: 'object',
                        required: true,
                        description:
                            '车站坐标回退文件路径、下载地址与刷新时间。',
                        notes: [
                            '默认文件建议为 data/stationCoord.jsonl。',
                            'refresh.enabled=true 时 provider 必填。',
                            'refresh.refreshAt 必须是非空 HHmm 字符串数组。',
                            '管理员页面支持本地重载和远程刷新，刷新后会立即影响后续线路时刻表下载任务。'
                        ]
                    },
                    {
                        path: 'data.databases.schedule',
                        valueType: 'string',
                        required: false,
                        description:
                            '时刻表 SQLite 数据库路径，默认 data/schedule.db。',
                        notes: [
                            '数据库内保存时刻表更新状态、车次别名、经停站、车站索引、官方交路和线路刷新队列。',
                            '运行时代码以该数据库为时刻表权威数据源，新部署建议显式配置并放在持久化数据目录内。'
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
                    },
                    {
                        path: 'data.databases.timetableHistory',
                        valueType: 'string',
                        required: true,
                        description: '内部历史时刻表积累数据库路径。',
                        notes: [
                            '数据库会保存规范化后的停站 JSON 内容、时刻表哈希和按日期压缩的时刻表覆盖时间段。',
                            '只有今日时刻表更新成功或者批量车次刷新任务成功后，才会把确认过的车次组写入这个库。',
                            '仅从昨天复用的路线信息不会计为新的历史确认。'
                        ]
                    }
                ]
            },
            {
                type: 'field-cards',
                title: 'data.runtime：运行时统计文件',
                text: '这一组决定管理员流量统计与服务器监控的落盘位置、采样间隔和定时写盘间隔。',
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
                        path: 'data.runtime.adminServerMetrics.file',
                        valueType: 'string',
                        required: true,
                        description: '服务器监控统计文件路径。',
                        notes: [
                            '管理员服务器监控页的 CPU、内存、系统负载、SSR/API 时长窗口与 Top 5 慢路径聚合会从这里恢复。',
                            '文件父目录必须可写，建议放在持久化磁盘。'
                        ]
                    },
                    {
                        path: 'data.runtime.adminServerMetrics.flushIntervalMinutes',
                        valueType: 'integer',
                        required: true,
                        description:
                            '服务器监控统计的定时落盘间隔，单位分钟，默认值为 10。',
                        notes: ['仅在内存状态有变化时写盘。']
                    },
                    {
                        path: 'data.runtime.adminServerMetrics.sampleIntervalSeconds',
                        valueType: 'integer',
                        required: true,
                        description:
                            '服务器监控后台采样间隔，单位秒，默认值为 60。',
                        notes: [
                            'CPU、内存和系统负载会按这个周期采样。',
                            'SSR/API 时长与路径级延迟聚合仍按请求完成时实时入桶。'
                        ]
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
                        description:
                            '分别定义站内登录态签名、普通 API Key 和 OAuth 访问密钥的前缀。',
                        notes: [
                            '当前必须同时提供 webapp、api、oauth 三个前缀。',
                            '三个前缀都不能为空，且彼此不能重复。'
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
                            '管理员用户 ID 列表，命中的网页登录用户会额外获得 api.admin 权限。',
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
                            '已存储浏览器通知订阅的设备数量上限、预留的事件订阅规则数量上限，以及当前设备同步超时时间（秒）。',
                        notes: [
                            '最大设备数按每个用户已存储的浏览器通知订阅数量计数。',
                            '同一台物理设备在使用不同浏览器、不同用户配置或不同 PWA 安装时，可能会占用多条记录。',
                            '最大事件数为后续事件订阅规则预留，当前代码尚未实际强制这一上限。',
                            '同步超时时间控制控制台等待权限弹窗、Service Worker 就绪和浏览器订阅调用的最长时间；默认值为 30 秒。'
                        ]
                    },
                    {
                        path: 'user.push.vapidPublicKey / user.push.vapidPrivateKey / user.push.vapidEmail',
                        valueType: 'string',
                        required: true,
                        description:
                            '浏览器通知推送所需的 VAPID 公钥、私钥和联系邮箱。',
                        notes: [
                            '生产环境建议通过 OCRH_VAPID_PUBLIC_KEY、OCRH_VAPID_PRIVATE_KEY 和 OCRH_VAPID_EMAIL 覆盖，而不是把真实值直接写进配置文件。',
                            'vapidEmail 只填写纯邮箱地址，例如 push@example.com；程序会自动补上 mailto: 前缀。',
                            'Apple 的 Safari / iOS 通知推送对 VAPID 更严格，邮箱缺失、非法或使用本地占位值时都可能导致推送被拒绝。'
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
                title: 'oauth：OAuth 2.0 / OpenID Connect 授权服务器配置',
                text: '这一组决定站点对外暴露的 OAuth 2.0 与 OIDC 行为，包括签发者、授权码与令牌生命周期、PKCE 策略、发现文档地址以及 id_token 签名密钥。',
                cards: [
                    {
                        path: 'oauth.issuer',
                        valueType: 'string(URL)',
                        required: true,
                        description:
                            'OAuth/OIDC 对外声明的签发者，用于写入发现文档、id_token 的 iss claim，以及第三方客户端校验授权服务器身份。',
                        notes: [
                            '必须以 http:// 或 https:// 开头。',
                            '生产环境应填写第三方应用实际可访问到的外部地址，而不是容器内部地址或仅本机可见的回环地址。',
                            '它应与对外公开的授权服务器域名保持稳定；修改后，依赖旧签发者的客户端通常需要重新配置。'
                        ]
                    },
                    {
                        path: 'oauth.authorizationCodeTtlSeconds',
                        valueType: 'integer(seconds)',
                        required: true,
                        description:
                            '一次性鉴权令牌的有效期，单位秒；从用户完成授权开始计时，超时后 /oauth/token 接口必须拒绝换取 API 密钥。',
                        notes: [
                            '必须为正整数。',
                            '建议保持较短时长，减少授权码泄露后的可利用窗口。'
                        ]
                    },
                    {
                        path: 'oauth.accessTokenTtlSeconds',
                        valueType: 'integer(seconds)',
                        required: true,
                        description:
                            'OAuth 访问密钥的有效期，单位秒；会写入复用的签名 API Key 记录，并影响现有访问密钥资源访问链路的过期判断。',
                        notes: [
                            '必须为正整数。',
                            '访问密钥会直接作为现有 /api/v1/* 接口的 Bearer Token 使用，因此过期时间会影响第三方应用访问所有受访问域保护资源的可用窗口。',
                            '暂不支持刷新令牌，过期后需要重新走授权流程。'
                        ]
                    },
                    {
                        path: 'oauth.idTokenTtlSeconds',
                        valueType: 'integer(seconds)',
                        required: true,
                        description:
                            'OIDC id_token 的有效期，单位秒；用于控制第三方客户端持有身份断言的时间窗口。',
                        notes: [
                            '必须为正整数。',
                            'id_token 与访问密钥分离签发，不复用现有 HMAC API Key 格式。',
                            '时长不宜过长，否则客户端长期缓存旧身份断言时，撤销或策略变更的收敛会更慢。'
                        ]
                    },
                    {
                        path: 'oauth.loginContinuationTtlSeconds',
                        valueType: 'integer(seconds)',
                        required: true,
                        description:
                            '未登录用户访问 /oauth/authorize 时，系统为“登录后继续原授权流程”保存上下文的有效期，单位秒。',
                        notes: [
                            '必须为正整数。',
                            '这个值控制的是授权流程恢复窗口，不是 Cookie 登录态本身的生命周期。',
                            '值过短可能导致用户刚完成站内登录就无法返回原 OAuth 授权确认页。'
                        ]
                    },
                    {
                        path: 'oauth.subjectSalt',
                        valueType: 'string',
                        required: true,
                        description:
                            '生成 OIDC 对象标识时使用的服务端盐值，用于把站内用户 ID 稳定映射为对外暴露的 sub。',
                        notes: [
                            '不能为空。',
                            '应使用独立、不可预测的随机字符串，避免直接暴露站内用户主键或让第三方推导真实用户 ID。',
                            '修改后，同一用户在 OIDC 中看到的 sub 会发生变化，已依赖旧 sub 建立映射关系的客户端可能需要重新关联账号。'
                        ]
                    },
                    {
                        path: 'oauth.pkce.allowedMethods',
                        valueType: 'array<"S256">',
                        required: true,
                        description:
                            '允许客户端在授权请求中使用的 PKCE code_challenge_method 列表。',
                        notes: [
                            '当前实现要求该数组必须精确为 ["S256"]，不接受 plain，也不接受额外方法。',
                            '这是对公开客户端的强制安全约束，所有客户端都必须带 PKCE。'
                        ]
                    },
                    {
                        path: 'oauth.discovery.enabled',
                        valueType: 'boolean',
                        required: true,
                        description:
                            '是否启用标准 OIDC 发现文档与关联元数据暴露。',
                        notes: [
                            '开启后，第三方客户端可通过 /.well-known/openid-configuration 自动发现授权端点、令牌端点、用户信息端点和 JWKS 地址。',
                            '如果关闭发现功能，协议端点实现仍可存在，但接入方需要手工配置所有地址和签名信息来源。'
                        ]
                    },
                    {
                        path: 'oauth.discovery.externalBaseUrl',
                        valueType: 'string(URL)',
                        required: true,
                        description:
                            '发现与 JWKS 文档中生成公开 URL 时使用的外部基础地址。',
                        notes: [
                            '必须以 http:// 或 https:// 开头；服务启动时会自动去掉末尾多余的 /。',
                            '通常应与 oauth.issuer 指向同一对外域名；若站点通过网关、反代或单独公开 OAuth 子路径，这里可以明确指定发现文档里应返回的基准地址。',
                            '如果填写内网地址或错误前缀，标准 OIDC 客户端即使能拿到发现文档，也会因为端点 URL 不可达而接入失败。'
                        ]
                    },
                    {
                        path: 'oauth.idTokenSigning.kid',
                        valueType: 'string',
                        required: true,
                        description:
                            'JWKS 中发布的当前签名密钥标识，以及 id_token JWT 头中的 kid。',
                        notes: [
                            '不能为空。',
                            '生产环境建议通过 OCRH_OAUTH_ID_TOKEN_SIGNING_KID 覆盖，而不是把真实运行值直接写进配置文件。',
                            '第三方客户端会用它在 JWKS 中定位对应公钥；后续做密钥轮换时，应保证不同密钥使用不同 kid。'
                        ]
                    },
                    {
                        path: 'oauth.idTokenSigning.privateKeyPem',
                        valueType: 'string(PEM private key)',
                        required: true,
                        description:
                            '用于签发 OIDC id_token 的 RSA 私钥，PEM 格式保存。',
                        notes: [
                            '配置值必须看起来像 PEM 私钥，启动时会检查是否包含 BEGIN 片段。',
                            '生产环境建议通过 OCRH_OAUTH_ID_TOKEN_SIGNING_PRIVATE_KEY 覆盖，而不是把真实私钥直接写进配置文件。',
                            '生产环境应使用真实私钥并妥善保密；泄露后，攻击者可伪造看似合法的 id_token。',
                            '如果写在 JSON 中，多行内容需要按 JSON 字符串格式转义换行，例如使用 \\n。',
                            '如果通过环境变量提供，可直接传入多行 PEM，也可传入包含 \\n 的单行字符串，服务启动时会自动还原换行。'
                        ]
                    },
                    {
                        path: 'oauth.idTokenSigning.alg',
                        valueType: '"RS256"',
                        required: true,
                        description: 'id_token 使用的 JWT 签名算法标识。',
                        notes: [
                            '当前实现只接受 RS256；配置为其他值会直接阻止服务启动。',
                            '该值应与私钥类型和 JWKS 中暴露的公钥参数保持一致。'
                        ]
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
                        path: 'api.clientIpHeaders',
                        valueType: 'array<string>',
                        required: false,
                        description:
                            '按顺序决定服务端从哪些请求头读取客户端 IP。',
                        notes: [
                            '未配置时默认依次读取 cf-connecting-ip、x-forwarded-for、x-real-ip。',
                            '当命中 x-forwarded-for 时，只会取逗号分隔后的第一个地址。',
                            '所有配置头都取不到值时，会回退到 socket.remoteAddress。',
                            '使用 Cloudflare、Nginx 或其他反向代理时，应确保真实客户端 IP 会被透传到这些头之一。'
                        ]
                    },
                    {
                        path: 'api.authRateLimit',
                        valueType: 'object',
                        required: true,
                        description:
                            '登录、注册、OAuth 授权流程与 OAuth 令牌接口的限流配置。'
                    },
                    {
                        path: 'api.authRateLimit.oauthAuthorize',
                        valueType: 'object',
                        required: true,
                        description:
                            'OAuth 授权流程的限流配置，对应 GET /api/v1/oauth/authorize/context 与 POST /oauth/authorize。',
                        notes: [
                            '这两个入口共用同一个限流桶，便于限制授权页探测和频繁同意/拒绝操作。',
                            '当前默认建议值为 20 分钟 20 次。'
                        ]
                    },
                    {
                        path: 'api.authRateLimit.oauthToken',
                        valueType: 'object',
                        required: true,
                        description:
                            'OAuth 令牌交换接口的限流配置，对应 POST /oauth/token。',
                        notes: [
                            '该接口用于将授权码交换为访问令牌，当前默认建议值为 20 分钟 20 次。',
                            '限流命中后会直接拒绝请求；来源校验失败、请求体无效或授权码无效时也会计入这一额度。'
                        ]
                    },
                    {
                        path: 'api.authCache',
                        valueType: 'object',
                        required: true,
                        description:
                            '用户记录、用户资料和 API Key 记录缓存的容量与过期时长。'
                    },
                    {
                        path: 'api.authCache.userProfile',
                        valueType: 'object',
                        required: true,
                        description:
                            '用户档案数据 JSON 的服务端缓存容量与过期时长。',
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
                            'createBody 对应 POST /api/v1/feedback/topics 的正文长度范围。',
                            'replyBody 对应 POST /api/v1/feedback/topics/[id]/messages 的正文长度范围。',
                            'title 对应 PATCH /api/v1/feedback/topics/[id] 的标题长度范围。'
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
                            '当前日、历史、搜索索引、时刻表和全站地图接口成功响应的缓存时长。',
                        notes: [
                            'sitemapMaxAgeSeconds 用于控制 /sitemap.xml 响应的 Cache-Control max-age。',
                            'timetableMaxAgeSeconds 用于控制 /api/v1/timetable/train/*/current、/api/v1/timetable/train/*/history/* 和 /api/v1/timetable/station/* 成功响应的 Cache-Control max-age。'
                        ]
                    },
                    {
                        path: 'api.pagination',
                        valueType: 'object',
                        required: true,
                        description: '分页默认大小和最大上限。',
                        notes: ['最大上限必须不小于默认大小。']
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
                        description: '匿名访问允许拥有的访问域。',
                        notes: [
                            '这组配置直接决定公开可匿名调用的接口范围。',
                            '如果要公开动车组配属信息接口，需要包含 api.allocation.emu.read。',
                            '如果要公开车次详情页时刻表弹窗，需要包含 api.timetable.train.current.read。',
                            '如果要公开列车交路图图片接口，需要包含 api.timetable.train.circulation.image.read。',
                            '如果要公开车站页时刻表接口，需要包含 api.timetable.station.read。'
                        ]
                    },
                    {
                        path: 'api.permissions.issuedKeyDefaultScopes',
                        valueType: 'array<string>',
                        required: true,
                        description: '新签发 API Key 的默认权限集合。',
                        notes: [
                            '如需默认允许动车组配属信息接口，请包含 api.allocation.emu.read。',
                            '如需默认允许当前车次时刻表接口，请包含 api.timetable.train.current.read；如需默认允许历史车次时刻表接口，请同时包含 api.timetable.train.history.read。',
                            '如需默认允许列车交路图图片接口，请包含 api.timetable.train.circulation.image.read。',
                            '如需默认允许车站时刻表接口，请包含 api.timetable.station.read。',
                            '如需让网页端收藏功能开箱即用，请包含 api.auth.favorites.read 和 api.auth.favorites.write。',
                            '如需让网页端用户删除自己创建的 OAuth 客户端，请包含 api.auth.oauth-clients.delete；已有登录会话可能需要重新登录后才会拿到新增 scope。'
                        ]
                    },
                    {
                        path: 'api.permissions.creatableKeyMaxScopes',
                        valueType: 'array<string>',
                        required: true,
                        description:
                            '前端可签发 API Key 时允许选择的最大权限范围。',
                        notes: [
                            '若希望外部调用方可勾选动车组配属信息接口，这里也要包含 api.allocation.emu.read。',
                            '若希望外部调用方可勾选当前车次时刻表接口，这里也要包含 api.timetable.train.current.read；若希望可勾选历史车次时刻表接口，这里也要包含 api.timetable.train.history.read。',
                            '若希望外部调用方可勾选列车交路图图片接口，这里也要包含 api.timetable.train.circulation.image.read。',
                            '若希望外部调用方可勾选车站时刻表接口，这里也要包含 api.timetable.station.read。'
                        ]
                    }
                ]
            },
            {
                type: 'field-cards',
                title: 'services：外部服务依赖',
                text: '这一组声明本服务依赖的外部 Typst 编译微服务和 Resend 邮件服务。',
                cards: [
                    {
                        path: 'services.typstCompiler.baseUrl',
                        valueType: 'string',
                        required: true,
                        description:
                            'Typst 编译服务的基础地址，用于生成单组车底交路图。',
                        notes: [
                            '必须以 http:// 或 https:// 开头。',
                            '程序会自动去掉结尾多余的 /。'
                        ]
                    },
                    {
                        path: 'services.typstCompiler.apiKey',
                        valueType: 'string',
                        required: true,
                        description: '调用 Typst 编译服务的 Bearer API Key。',
                        notes: [
                            '生产环境建议通过 OCRH_TYPST_COMPILER_API_KEY 覆盖，而不是把真实密钥直接写进配置文件。',
                            '如果未设置环境变量，生产环境启动时会输出警告。'
                        ]
                    },
                    {
                        path: 'services.resend.apiKey / services.resend.emailApiUrl / services.resend.requestTimeoutMs / services.resend.maxRecipients',
                        valueType: 'string',
                        required: false,
                        description:
                            'Resend API Key、发送端点、请求超时和单次收件人数限制，用于服务端发送 Email。',
                        notes: [
                            'apiKey 填写原始 Resend API Key，不要添加 Bearer 前缀；程序会在请求时自动构造 Authorization 头。',
                            '生产环境建议通过 OCRH_RESEND_API_KEY 覆盖，而不是把真实 API Key 写进配置文件。',
                            'emailApiUrl 必须使用 HTTPS；maxRecipients 必须在 1-50 之间，以符合 Resend 单次发送接口的限制。',
                            '未启用 QQ 绑定时允许凭据留空；调用未配置的内部邮件服务会返回 resend_not_configured。',
                            '官方文档：https://resend.com/docs/api-reference/emails/send-email 和 https://resend.com/docs/dashboard/emails/idempotency-keys。'
                        ]
                    },
                    {
                        path: 'services.resend.email.fromName / services.resend.email.fromAddress / services.resend.email.replyToAddress',
                        valueType: 'string',
                        required: false,
                        description:
                            'Resend 邮件的发件人名称、发件邮箱和可选回复邮箱。',
                        notes: [
                            '启用 QQ 绑定时 fromAddress 必填，并且必须属于已在 Resend 验证的发送域名。建议使用独立子域名隔离发送信誉。',
                            'resend.dev 测试域名只能向 Resend 账户自己的邮箱发送测试邮件，不能用于向任意 QQ 邮箱发送验证码。',
                            'fromAddress 和 replyToAddress 只能填写纯邮箱地址，不要带 mailto: 前缀。',
                            '收件人、标题和 HTML 正文由内部服务调用方在运行时传入，不写入配置文件。'
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
                            '只能使用 build_today_schedule、generate_route_refresh_tasks、dispatch_daily_probe_tasks、clear_daily_probe_status、cleanup_revoked_api_keys、export_daily_records、rebuild_reference_model_index、rebuild_train_circulation_index。',
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
                        description: '参考车型索引重建任务的配置项。',
                        notes: [
                            'windowDays 用于设置历史窗口天数，当前默认值为 14。',
                            'batchSize 用于设置扫描每日担当记录时的分页批大小，当前默认值为 1000。',
                            'threshold 是权重的阈值，必须大于 0 且小于等于 1。',
                            '当历史窗口内完全没有命中记录时，系统会回退到数据库中当前时刻表的列车样式，并再经过 train_style_mapping.json 映射后返回权重为 0 的参考车型。',
                            'dailyTimesHHmm 用于手动填写多个 HHmm 时刻，控制生成参考车型任务在一天内多次重建。'
                        ]
                    },
                    {
                        path: 'task.circulation',
                        valueType: 'object',
                        required: true,
                        description: '列车交路推断索引重建任务的配置项。',
                        notes: [
                            'windowDays 用于设置交路推断历史窗口天数，当前默认值为 14。',
                            'batchSize 用于流式扫描每日担当记录时的分页批大小，当前默认值为 2000。',
                            'threshold 是归一化边权重的阈值，必须大于 0 且小于等于 1，当前默认值为 0.8。',
                            'dailyTimesHHmm 用于配置生成推断交路的每日重建时刻，默认值为 ["0200"]，结果会并入列车时刻表接口的 circulation 字段。',
                            'stationBoard 可选；省略时默认使用 maxAttempts=5、retryDelaySeconds=1800。'
                        ]
                    },
                    {
                        path: 'task.circulation.stationBoard',
                        valueType: 'object',
                        required: false,
                        description:
                            '列车交路推断在补查车站大屏数据时使用的重试参数。',
                        notes: [
                            'maxAttempts 是最大尝试次数，最小值为 1，默认值为 5。',
                            'retryDelaySeconds 是重试前等待秒数，最小值为 0，默认值为 1800。'
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
                        description: '空闲模式下每个任务轮次最多拉起的任务数。'
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
                text: '这一组决定 logs/ 目录下按日滚动日志的保留时间。',
                cards: [
                    {
                        path: 'logging.retentionDays',
                        valueType: 'integer',
                        required: true,
                        description: '应用日志的总保留天数，默认值为 5。',
                        notes: [
                            '保留天数包含当前当天正在写入的日志文件。',
                            '日志文件位于 logs/ 目录，可按运维策略另行备份。'
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
                        path: 'cost.fixed.authChangePassword / authIssueApiKey / authCreateOauthClient / authDeleteOauthClient / authListApiKeys / authRevokeApiKey',
                        valueType: 'integer',
                        required: true,
                        description:
                            'API Key 管理接口与 OAuth 客户端创建、删除接口的固定成本。'
                    },
                    {
                        path: 'cost.fixed.searchIndex / allocationEmu / timetableTrainCurrent / trainCirculationImage / trainCirculationImageCacheHit / trainCirculationImageFailure / timetableTrainHistory / exportDailyIndex / exportDaily',
                        valueType: 'integer',
                        required: true,
                        description:
                            '搜索、动车组配属信息、当前时刻表、交路图图片与导出接口的固定成本。',
                        notes: [
                            'allocationEmu 控制单一车组配属信息查询接口的固定成本，默认 1。',
                            'trainCirculationImageCacheHit 控制交路图图片缓存命中成本，默认 2。',
                            'trainCirculationImageFailure 控制交路图图片失败成本，默认 2。'
                        ]
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
                    '修改 user.push 或 OCRH_VAPID_PUBLIC_KEY / OCRH_VAPID_PRIVATE_KEY / OCRH_VAPID_EMAIL 后需要重启 Node 进程，并建议立即用一台 Apple Safari PWA 设备验证推送是否正常。',
                    '启用 Resend 邮件前，需要在 Resend Dashboard 添加发送域名并完成 SPF 和 DKIM DNS 验证；修改 services.resend 或 OCRH_RESEND_API_KEY 后需要重启 Node 进程。',
                    '启用 QQ 绑定前，需要将 user.qqBinding.enabled 设为 true，并完整配置 services.resend 的 API Key、发送端点和发件邮箱；启动时会严格校验 Resend 配置，失败会中断启动。验证码默认有效 30 分钟，同一用户默认至少间隔 120 秒发送，独立限额默认是 5 次 / 1 小时。',
                    '修改 oauth.idTokenSigning 或 OCRH_OAUTH_ID_TOKEN_SIGNING_KID / OCRH_OAUTH_ID_TOKEN_SIGNING_PRIVATE_KEY 后需要重启 Node 进程，并建议立即验证 JWKS 输出与 id_token 签名是否正常。',
                    '升级到支持 OAuth 客户端删除的版本后，既有私有部署需要在 cost.fixed 中补充 authDeleteOauthClient，并按需在 api.permissions.issuedKeyDefaultScopes 中补充 api.auth.oauth-clients.delete。',
                    '提高 api.permissions.anonymousScopes、quota 或 cost 前，先确认你准备公开暴露的接口范围和限额策略。',
                    '修改 spider.scheduleProbe.prefixRules、task.referenceModel.dailyTimesHHmm、task.circulation.dailyTimesHHmm 或 task.scheduler 参数后，重启后应观察首轮任务执行是否符合预期。',
                    '修改 spider.rateLimit.stationBoard 或 task.circulation.stationBoard 后，重启后应关注车站大屏相关抓取、重试与交路推断任务是否按预期工作。'
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
                text: '如果启用了 OAuth/OIDC，请同时设置 id_token 签名所需的 kid 和 RSA 私钥。私钥既可以直接传入多行 PEM，也可以传入包含 \\n 的单行字符串。'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'export OCRH_OAUTH_ID_TOKEN_SIGNING_KID=default-rs256\nexport OCRH_OAUTH_ID_TOKEN_SIGNING_PRIVATE_KEY=\"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\"'
            },
            {
                type: 'paragraph',
                text: '如果需要启用 Web Push，请同时设置 VAPID 公私钥和联系邮箱；vapidEmail 只填写纯邮箱地址，不要带 mailto: 前缀。'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'export OCRH_VAPID_PUBLIC_KEY=<base64url-public-key>\nexport OCRH_VAPID_PRIVATE_KEY=<base64url-private-key>\nexport OCRH_VAPID_EMAIL=push@example.com'
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
                text: '如果需要启用单组车底交路图图片接口，请在配置文件中为 Typst 编译微服务设置 URL 地址（`services.typstCompiler.baseUrl`），并在环境变量中设置 API Key。'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'export OCRH_TYPST_COMPILER_API_KEY=<typst-compiler-api-key>'
            },
            {
                type: 'paragraph',
                text: '如果需要启用内部 Resend 邮件发送工具，请设置原始 Resend API Key，并在配置文件的 services.resend.email.fromAddress 中填写已验证域名下的发件邮箱。该功能不会自动将邮箱绑定到本项目用户。'
            },
            {
                type: 'code',
                language: 'bash',
                code: 'export OCRH_RESEND_API_KEY="re_xxxxxxxxxxxxxxxxx"'
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
                text: '如果你是通过 NUXT_EXTERNALIZE_NATIVE_DEPS=1 生成构建产物，请先在目标机器的项目根目录执行 pnpm install --frozen-lockfile，再启动服务。默认 pnpm build 构建不需要额外增加这一步。'
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
                text: '应用会在 logs/ 目录下按天滚动写入日志，同时按 data.runtime 配置把管理员流量统计和服务器监控统计分别写入独立文件。'
            }
        ]
    },
    {
        id: 'emu-list',
        title: 'emu_list.json',
        summary:
            '为配属信息查询、畅行码探测、车组别名解析和重联判断提供动车组基础清单。',
        blocks: [
            {
                type: 'paragraph',
                text: '动车组清单文件默认建议放在 data/emu_list.json，实际路径由配置文件中的 data.assets.EMUList.file 决定。默认远程来源为 https://allocation.crhdata.top/api/v1/allocation/export.json，文件内容使用 allocation export JSON 范式。GET /api/v1/allocation/emu/{emuCode} 会读取这个资产返回单一车组的配属信息。'
            },
            {
                type: 'code',
                language: 'json',
                code: '{\n    "schema_version": 1,\n    "railway_bureaus": [],\n    "train_depots": [],\n    "emu_depots": [],\n    "trainset_models": [],\n    "coach_layouts": [],\n    "emu_trainsets": []\n}'
            },
            {
                type: 'list',
                items: [
                    '配属信息接口需要请求方具备 api.allocation.emu.read 访问域；如果需要匿名访问，应在 api.permissions.anonymousScopes 中开放该访问域。',
                    '该接口成本由 cost.fixed.allocationEmu 控制，默认成本为 1。',
                    '管理员页面“配置文件”支持对该文件执行本地重载和远程刷新，刷新后会立即影响配属信息查询，并同步固定车组畅行码检测依赖。'
                ]
            }
        ]
    },
    {
        id: 'station-coord',
        title: 'stationCoord.jsonl',
        summary: '为线路时刻表下载任务提供 12306 缺失车站坐标时的回退数据源。',
        blocks: [
            {
                type: 'paragraph',
                text: '车站坐标回退文件默认建议放在 data/stationCoord.jsonl，实际路径由 data/config.json 中的 data.assets.stationCoord.file 决定。仅当 12306 路线查询返回的某个停站缺少经纬度时，线路时刻表下载任务才会读取本文件按站名回退坐标。'
            },
            {
                type: 'code',
                language: 'json',
                code: '{\n    "stationName": "祁门南",\n    "latitude": 29.834343,\n    "longtitude": 117.6942173\n}'
            },
            {
                type: 'field-cards',
                cards: [
                    {
                        path: 'stationName',
                        valueType: 'string',
                        required: true,
                        description: '车站名，按线路查询返回的站名字面值匹配。'
                    },
                    {
                        path: 'latitude',
                        valueType: 'number',
                        required: true,
                        description: '纬度。'
                    },
                    {
                        path: 'longtitude',
                        valueType: 'number',
                        required: true,
                        description:
                            '经度。字段名保持为 longtitude 以兼容现有文件。'
                    }
                ]
            },
            {
                type: 'list',
                items: [
                    '文件格式为 JSONL，每行一个 JSON 对象。',
                    '管理员页面“配置文件”支持对该文件执行本地重载和远程刷新。',
                    '重载或刷新后，只会影响后续线路时刻表下载或线路刷新任务；不会自动回填当前已有的时刻表数据库',
                    '如果同名车站在文件中出现多次，当前实现会取第一条记录，并在日志中输出告警；部署时应尽量避免同名冲突。'
                ]
            }
        ]
    },
    {
        id: 'qrcode-detection',
        title: 'qrcode_detection.json',
        summary: '为固定车组畅行码检测配置每日派发时间和目标车组列表。',
        blocks: [
            {
                type: 'paragraph',
                text: '固定车组畅行码检测计划文件默认建议放在 data/qrcode_detection.json，实际路径由配置文件中的 data.assets.qrcodeDetection.file 决定。加载或刷新该文件时，会同时结合本地动车组配属清单和畅行码映射做校验。'
            },
            {
                type: 'code',
                language: 'json',
                code: '{\n    "$schema": "../assets/json/qrcodeDetectionScheme.json",\n    "detectedAt": ["0630", "0830", "1030"],\n    "emu": ["CR400AF-AS-1106", "CR400AF-AS-1107"]\n}'
            },
            {
                type: 'field-cards',
                cards: [
                    {
                        path: '$schema',
                        valueType: 'string',
                        required: false,
                        description:
                            '可选的范式引用，建议填写 ../assets/json/qrcodeDetectionScheme.json。'
                    },
                    {
                        path: 'detectedAt',
                        valueType: 'array<string(HHmm)>',
                        required: true,
                        description:
                            '每日派发时间列表。每个 HHmm 都会保持一条未来待执行的派发任务。'
                    },
                    {
                        path: 'emu',
                        valueType: 'array<string>',
                        required: true,
                        description:
                            '每个检测时间都要执行的车组编号列表。加载时会校验这些车组是否存在于动车组清单中，并检查畅行码映射是否缺失。'
                    }
                ]
            },
            {
                type: 'list',
                items: [
                    '文件路径不再写死，实际使用 data.assets.qrcodeDetection.file。',
                    '管理员页面“配置文件”支持对该文件执行本地重载和远程刷新。',
                    '重载或刷新该文件后，会重新校验内容并同步未来的固定车组探测派发任务。',
                    '重载或刷新动车组清单、畅行码映射资产后，也会重新校验本文件并同步这些未来派发任务。'
                ]
            }
        ]
    },
    {
        id: 'train-style-mapping',
        title: 'train_style_mapping.json',
        summary: '为参考车型回退提供从 12306 列车样式到规范车型名的映射。',
        blocks: [
            {
                type: 'paragraph',
                text: '车型映射文件默认建议放在 data/train_style_mapping.json，实际路径由配置文件中的 data.assets.trainStyleMapping.file 决定。仅当本车次在历史窗口内完全没有命中任何运行记录、需要从时刻表数据库当前时刻表的列车样式回退时，系统才会读取本文件做映射。'
            },
            {
                type: 'code',
                language: 'json',
                code: '{\n    "$schema": "../assets/json/trainStyleMappingScheme.json",\n    "CR400AF_578": "CR400AF",\n    "CR400AF-A": "CR400AF-A",\n    "ZL200J": "LCR200J3-B"\n}'
            },
            {
                type: 'field-cards',
                cards: [
                    {
                        path: '$schema',
                        valueType: 'string',
                        required: false,
                        description:
                            '可选的范式引用，建议填写 ../assets/json/trainStyleMappingScheme.json。'
                    },
                    {
                        path: '<trainStyle>',
                        valueType: 'string',
                        required: true,
                        description:
                            '键是时刻表数据库中当前时刻表中保存的原始列车样式，值是期望输出到参考车型的规范车型名。'
                    }
                ]
            },
            {
                type: 'list',
                items: [
                    '文件格式为单个 JSON 对象，除 $schema 外其余键值都必须是非空字符串。',
                    '管理员页面“配置文件”支持对该文件执行本地重载和远程刷新。',
                    '未命中映射时，系统会保留原始列车样式，并记录警告日志。',
                    '通过该文件回退得到的参考车型会返回 weightedShare=0，表示它不是历史推断结果。'
                ]
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
                text: '更新代码前建议先停服务、备份数据目录和当前生效的配置文件，再替换代码、重新构建并启动。'
            },
            {
                type: 'paragraph',
                text: '请确保 data.runtime.adminTraffic.file 与 data.runtime.adminServerMetrics.file 的父目录可写；管理员流量统计按 30 分钟默认周期落盘，服务器监控按 10 分钟默认周期落盘并每 60 秒采样一次，同时持久化 SSR/API 时长与路径级延迟聚合。'
            },
            {
                type: 'paragraph',
                text: '当前运行时统计文件按单实例设计；如果部署多实例，请避免多个进程同时写同一份运维文件。'
            }
        ]
    }
];
