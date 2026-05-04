import type { DocsContentSection } from './deployDocs';

export const crawlFlowOverview = [
    {
        title: '启动引导',
        text: '服务启动后先执行 taskScheduleBootstrap，准备数据库、资产、重建缓存并注册任务执行器。'
    },
    {
        title: '构建今日时刻表',
        text: '执行 buildTodaySchedule 函数，根据配置信息从 12306 的搜索结果补全列表中获取已经录图的车次号，然后检查缓存，当有车次号未在缓存中时则向 12306 抓取时刻表数据。'
    },
    {
        title: '闲暇时更新时刻表数据',
        text: 'generateRouteRefreshTasks 会按 TTL 和缺失字段扫描时刻表文件，并拆成 refreshRoutePatch 任务，在闲暇时从 12306 上更新时刻表数据。'
    },
    {
        title: '派发发车探测',
        text: '时刻表生成成功后立刻调用 dispatchDailyProbeTasks 任务，读取每个车次的出发时间，并设置定时任务，调用 probeTrainDeparture 函数。'
    },
    {
        title: '担当识别与落盘',
        text: 'probeTrainDeparture 函数会结合车次号、车组号、昨日缓存和运行状态做识别、重试、冲突清理与数据落盘。'
    }
];

export const crawlDocsSections: DocsContentSection[] = [
    {
        id: 'bootstrap',
        title: '启动与任务注册',
        summary:
            '服务启动时不会直接开始抓取，而是先完成依赖准备、状态恢复和任务注册，再把启动任务补齐到调度队列中。',
        blocks: [
            {
                type: 'paragraph',
                text: '入口在 server/plugins/taskScheduleBootstrap.ts。这个插件会先确保任务和车次信息数据库可用，加载时刻表、车组号和列车畅行码资产，尝试预热昨日担当索引，并从今天已有的记录中重建运行时状态缓存。'
            },
            {
                type: 'list',
                title: '启动阶段会注册并协调这些执行器',
                items: [
                    'build_today_schedule：负责生成今日时刻表，并在成功后补发 dispatch_daily_probe_tasks。',
                    'generate_route_refresh_tasks 与 refresh_route_batch：负责对时刻表中过期或缺失的线路信息做增量补刷。',
                    'dispatch_daily_probe_tasks 与 probe_train_departure：负责把今日的时刻表拆成发车探测任务，并在发车窗口内识别担当。',
                    'clear_daily_probe_status、detect_coupled_emu_group、export_daily_records、rebuild_reference_model_index、rebuild_train_circulation_index 等任务会围绕状态清理、耦合检测、导出、参考车型索引刷新和交路索引重建继续运转。'
                ]
            },
            {
                type: 'code',
                title: '关键启动任务链',
                language: 'text',
                code: [
                    'taskScheduleBootstrap',
                    '  -> ensure database schema',
                    '  -> loadProbeAssets / warmHistoricalRecentTrainEmuIndex (current timetable latest 4 records)',
                    '  -> register executors',
                    '  -> rehydrateProbeRuntimeState',
                    '  -> reconcile build_today_schedule',
                    '  -> reconcile generate_route_refresh_tasks',
                    '  -> reconcile clear_daily_probe_status',
                    '  -> reconcile export_daily_records',
                    '  -> reconcile rebuild_reference_model_index',
                    '  -> reconcile rebuild_train_circulation_index'
                ].join('\n')
            }
        ]
    },
    {
        id: 'circulation-index',
        title: '推断交路索引',
        summary:
            '系统会按近 14 天运用记录流式扫描 daily_emu_routes，为当前时刻表中的车次推断交路，并把结果并入车次时刻表接口响应。',
        blocks: [
            {
                type: 'paragraph',
                text: 'rebuild_train_circulation_index 的入口在 server/services/taskExecutors/rebuildTrainCirculationIndexTaskExecutor.ts。它会分页读取 daily_emu_routes，按车组聚合同一天内相邻车次，清洗跨整天断开的边，归一化入边和出边权重，再按阈值提取交路；无法稳定并入已有交路的临客会自然保留为单车次交路。'
            },
            {
                type: 'list',
                title: '当前实现要点',
                items: [
                    '只扫描 task.circulation.windowDays 指定窗口内的数据，避免全表加载，适合每天约 20k 条记录的生产规模。',
                    '当相邻观测跨越超过 1 个自然日时会删除这条边；相邻自然日的正常连接会被保留。',
                    'threshold 只作用于归一化后的边权重；1/1 的单次强连接允许保留。',
                    '如果遍历中形成环，会优先选择出边优势最大的节点作为交路终点；剩余未归路车次会补成单节点交路。'
                ]
            },
            {
                type: 'list',
                title: '接口行为',
                items: [
                    '当前不新增独立公开接口，而是把 inferredCirculation 直接并入 /api/v1/timetable/train/{trainCode}/current 的响应。',
                    '当前只为今日时刻表中存在的车次返回推断交路结果；如果索引里不存在该车次，就不会附带交路数据。'
                ]
            },
            {
                type: 'code',
                title: '相关配置',
                language: 'text',
                code: [
                    'task.circulation.windowDays',
                    'task.circulation.batchSize',
                    'task.circulation.threshold',
                    'task.circulation.dailyTimesHHmm'
                ].join('\n')
            }
        ]
    },
    {
        id: 'build-schedule',
        title: '构建今日车次时刻表',
        summary: '今日时刻表生成分成“发现车次”和“回填线路信息”两个阶段。',
        blocks: [
            {
                type: 'paragraph',
                text: 'build_today_schedule 的执行入口在 server/services/taskExecutors/buildScheduleTaskExecutor.ts。它调用 buildTodaySchedule()，后者会确保时刻表资产文件存在，读取已完成的时刻表信息，并根据当前构建状态决定是继续断点恢复、复用已完成结果，还是重新构建。'
            },
            {
                type: 'list',
                title: '搜索录图车次号阶段',
                items: [
                    '根据 spider.scheduleProbe.prefixRules 初始化队列，逐个关键词调用 queryTrainCodeThroughPrefix 以从 12306 的自动补全接口获取录图车次号。',
                    '如果单次搜索结果达到最大并发上限，会继续展开更细的关键词，避免遗漏信息。',
                    '每隔 checkpointFlushEvery 个关键词会把信息落盘一次，进程重启后可以恢复。'
                ]
            },
            {
                type: 'list',
                title: '更新时刻表阶段',
                items: [
                    '对上一步得到的车次按组处理，调用 12306 查车次时刻表接口回填列车的出发时间、站点和终到时间、站点以及 12306 内部车次号。',
                    '如果之前的时刻表文件里已经有可复用的线路信息，buildTodaySchedule 会优先复用，减少冷启动请求量。',
                    '只有 enrich 阶段真正成功抓到 routeInfo 并在 promoteBuildingScheduleState 之后写回 published 的车次组，才会被记为“已确认”的历史时刻表；仅复用昨天的 route 信息不会续写历史 coverage。'
                ]
            },
            {
                type: 'code',
                title: '构建完成后的衔接',
                language: 'text',
                code: [
                    'build_today_schedule',
                    '  -> buildTodaySchedule',
                    '  -> runScheduleProbe(discover -> enrich)',
                    '  -> promoteBuildingScheduleState',
                    '  -> sync confirmed timetable history',
                    '  -> enqueue dispatch_daily_probe_tasks',
                    '  -> enqueue next build_today_schedule'
                ].join('\n')
            }
        ]
    },
    {
        id: 'refresh-route',
        title: '增量补刷路线信息',
        summary:
            '时刻表信息生成后不会永久静态不变。系统会通过闲暇任务持续检查路线过期情况，并按批次刷新。',
        blocks: [
            {
                type: 'paragraph',
                text: 'generate_route_refresh_tasks 会读取当前时刻表信息，并按 spider.scheduleProbe.refresh.ttlHours 和 startAt/endAt 缺失情况筛出待刷新列车信息。'
            },
            {
                type: 'list',
                title: '补刷链路',
                items: [
                    'generate_route_refresh_tasks 把待刷新列车信息拆成多批车次号，每批创建一个 refresh_route_batch。',
                    'refresh_route_batch 会再次调用 12306 查车次时刻表接口并把最新线路信息写回时刻表文件。',
                    '为了避免与其它更新竞争，refresh_route_batch 在保存前会重新读取最新时刻表信息，再按组应用更新。',
                    '只有 refresh_route_batch 成功保存到 published 的车次组才会同步进入内部历史时刻表库；如果同日补刷后 hash 未变化，就只续写或保持已确认 coverage，不会重复创建内容。'
                ]
            },
            {
                type: 'code',
                title: '相关配置',
                language: 'text',
                code: [
                    'spider.scheduleProbe.refresh.batchSize',
                    'spider.scheduleProbe.refresh.ttlHours',
                    'spider.scheduleProbe.refresh.generateIntervalHours',
                    'spider.scheduleProbe.retryAttempts'
                ].join('\n')
            }
        ]
    },
    {
        id: 'dispatch-probe',
        title: '派发当日发车探测任务',
        summary:
            '探测不是对时刻表中的每条记录实时轮询，而是先把当天时刻表信息归并成车次组，再按发车时间投递任务。',
        blocks: [
            {
                type: 'paragraph',
                text: 'dispatch_daily_probe_tasks 会读取时刻表信息，并借助 todayScheduleCache 把同一内部代码下的多个车次号（上下行车次号）合并成 TodayScheduleProbeGroup。这个缓存以时刻表文件的修改时间和现在时间做失效判定。'
            },
            {
                type: 'list',
                title: '派发规则',
                items: [
                    '每个车次组会创建一个 probe_train_departure 任务，参数里带车次号、内部代号、列车出发时间、终到时间和重试次数。',
                    '如果列车出发时间还未到，就把任务执行时间设为发车时间；如果已经过了发车时间，就立即执行。',
                    'build_today_schedule 成功后会立刻添加一次 dispatch_daily_probe_tasks 任务，避免当天时刻表更新后未能实时爬取列车信息。'
                ]
            }
        ]
    },
    {
        id: 'probe-runtime',
        title: '发车探测、冲突处理与落盘',
        summary:
            'probe_train_departure 是抓取链路里最重的一段：它不仅要确认运行状态，还要把担当识别结果写入当天记录，并处理重试、重叠和耦合编组。',
        blocks: [
            {
                type: 'paragraph',
                text: 'probe_train_departure 先校验任务参数中的时刻表信息是否仍属于当天，如果不是当天则直接跳过，再用列车所有的车次号（上下行车次号）扫描 12306 根据车次号查车组号的接口。只要其中一个车次号能成功拿到车组号信息，就会进入担当识别流程。命中“昨日同一班次仍由同一车组担当”的情况下，会额外用该主车组对应的畅行码复核当前返回的车次与日期；如果畅行码结果与本次任务不一致，或者畅行码查询失败，就不会采信当前探测结果，而是按 overlapRetryDelaySeconds 延迟重试。通过动车组资产判断是否可能重联，如果可能重联，根据车组号反查这趟车今天是否存在已有的重联检测状况，如果有，就直接复用；如果没有，就延迟添加重联检测任务，检测范围为同一铁路局同一车型。'
            },
            {
                type: 'list',
                title: '主要依赖的状态与存储',
                items: [
                    'probeRuntimeState：记录今天哪些车次组已经查过、哪些动车组已经分配过，用于去重和防止重复落盘。',
                    'probeStatusStore：记录单编组、重联、待确认、冲突等列车状态，用于后续校正与回溯。',
                    'emuRoutesStore：写入当天车次号与车组号的对应关系，形成记录。',
                    'historicalRecentTrainEmuIndexStore 与 probeAssetStore：分别提供最近两日匹配线索和动车组资产，用于提高识别成功率与耦合检测能力。'
                ]
            },
            {
                type: 'list',
                title: '异常与补偿',
                items: [
                    '抓取信息失败但还有重试机会时，会立即重入 probe_train_departure，直到重试机会耗尽。',
                    '如果命中最近两日同担当，但畅行码复核结果显示当前返回的车次或日期不一致，会按 overlapRetryDelaySeconds 延迟重排当前车次组，等待 12306 数据刷新后再探测。',
                    '如果发现多个车次组对同一编组的探测结果产生重叠，会按 overlapRetryDelaySeconds 延迟重排相关车次组。',
                    '识别出可能需要耦合编组补全时，会延迟添加 detect_coupled_emu_group 任务，负责重联检测，由单独执行器继续扩展。'
                ]
            },
            {
                type: 'code',
                title: '任务执行链路',
                language: 'text',
                code: [
                    'probe_train_departure',
                    '  -> validate current schedule window',
                    '  -> probeEmuByTrainCodes(allCodes)',
                    '  -> compare historicalRecent index / runtime state',
                    '  -> verify seat code for historicalRecent-matched running trains',
                    '  -> persist probe status',
                    '  -> insertDailyEmuRoute',
                    '  -> requeue overlap or queue detect_coupled_emu_group when needed'
                ].join('\n')
            }
        ]
    },
    {
        id: 'coupled-detection',
        title: '重联检测任务',
        summary:
            'detect_coupled_emu_group 负责把“待确认是否重联”的临时结果收敛为最终状态，并在命中重联时把缺失的编组与记录补回当天数据。',
        blocks: [
            {
                type: 'paragraph',
                text: '这个任务不是独立的主抓取入口，而是由 probe_train_departure 在识别到需要等待重联判断时添加的。无重联检测结果时会先把当前主编组写成待检测状态，并先按未重联写数据库，再由 detect_coupled_emu_group 任务接手继续扫描。'
            },
            {
                type: 'list',
                title: '触发条件与入参',
                items: [
                    'queueCoupledDetectionTask 会从当前主编组记录中提取铁路局与车型，并按 detectDelaySeconds 延迟添加 detect_coupled_emu_group。',
                    '在真正扫描前，会通过最近探测时间与探测冷却时长做冷却判定，避免同一铁路局和车型被高频重复检测。'
                ]
            },
            {
                type: 'list',
                title: '检测过程',
                items: [
                    '任务先从动车组列表中取出同局段、同车型候选编组集合。',
                    '再收集当天仍处于待检测重联的车次组。',
                    'scanUnassignedCandidates 会通过畅行码扫描尚未分配的候选编组，尝试把它们与待检测车组配对，判断是否应升级为重联。'
                ]
            },
            {
                type: 'list',
                title: '状态收敛与回填',
                items: [
                    '如果命中多编组，程序会把状态提升为已探测，并为相关车次号和车组号组合补齐担当信息。',
                    '如果之前已经按单编组落过结果，但后续又检测出第二个编组，日志会出现 single_group_upgraded_to_coupled，表示单编组被升级为重联。',
                    '如果没有匹配到新的编组，待检测车组会被收敛为已检测未检出；如果最终命中了重联，还会回填相关列车的缺失记录。'
                ]
            },
            {
                type: 'code',
                title: '重联检测链路',
                language: 'text',
                code: [
                    'probe_train_departure',
                    '  -> ensureProbeStatus(..., PendingCouplingDetection)',
                    '  -> insertDailyEmuRoute(mainEmuCode)',
                    '  -> queue detect_coupled_emu_group',
                    'detect_coupled_emu_group',
                    '  -> load probe assets and pending tracked groups',
                    '  -> scan unassigned candidates by bureau/model',
                    '  -> persistResolvedTrackedGroup',
                    '  -> upgrade to CoupledFormationResolved or finalize SingleFormationResolved',
                    '  -> persistBackfilledCoupledRoutes when coupled'
                ].join('\n')
            },
            {
                type: 'list',
                title: '排障日志关键词',
                items: [
                    'pending_coupling_detection：probe 阶段已经把任务置为待重联检测，并成功排队了 detect_coupled_emu_group。',
                    'skip_recent_detection：同一铁路局和列车类型仍在冷却窗口内，这次检测被跳过。',
                    'coupled_group_detected：检测到重联，相关车次号与车组号已写回状态和记录。',
                    'single_group_upgraded_to_coupled：原本按单编组落盘的结果被升级成重联。',
                    'pending_group_resolved_single：待检测组最终没有补到第二编组，收敛回单编组。'
                ]
            }
        ]
    },
    {
        id: 'config-mapping',
        title: '关键配置项如何影响抓取流程',
        summary:
            '这页最值得和 config.json 对照阅读的，是 scheduleProbe、rateLimit 和 startup task 三组配置。',
        blocks: [
            {
                type: 'field-cards',
                title: '抓取链路关键配置',
                cards: [
                    {
                        path: 'data.assets.schedule.file',
                        valueType: 'string',
                        required: true,
                        description:
                            'published schedule 和 building schedule 都围绕这个资产文件读写，todayScheduleCache 也会观察它的修改时间。',
                        notes: [
                            '文件路径必须可读写，私有部署时建议放在持久化 data 目录内。',
                            '内部历史时刻表不会直接把整份 schedule.json 当作快照归档，而是在确认过的车次组落盘后提取规范化 stops 内容写入独立数据库。'
                        ]
                    },
                    {
                        path: 'data.databases.timetableHistory',
                        valueType: 'string',
                        required: true,
                        description:
                            '内部历史时刻表积累数据库文件路径，保存规范化后的时刻表内容和按 service date 压缩的 coverage 段。',
                        notes: [
                            '只有 build enrich 成功或 refresh_route_batch 成功落盘的车次组才会写入。',
                            '中间有未确认日期缺口时，不会跨缺口续写 coverage。'
                        ]
                    },
                    {
                        path: 'spider.scheduleProbe.dailyTimeHHmm',
                        valueType: 'string(HHmm)',
                        required: true,
                        description:
                            '决定 build_today_schedule 的每日执行时间，构建成功后才会补发 dispatch_daily_probe_tasks。',
                        notes: [
                            '如果这个时间点太晚，当天部分列车可能已经发车。'
                        ]
                    },
                    {
                        path: 'spider.scheduleProbe.prefixRules',
                        valueType: 'array<object>',
                        required: true,
                        description:
                            '决定车次探测阶段会覆盖哪些前缀和号段，直接影响当天时刻表的覆盖范围。',
                        notes: ['prefix 号段有重叠时，服务启动校验会直接失败。']
                    },
                    {
                        path: 'spider.scheduleProbe.retryAttempts / maxBatchSize / checkpointFlushEvery',
                        valueType: 'integer',
                        required: true,
                        description:
                            '分别影响列车时刻表信息更新的重试次数、搜索扩展阈值和车次探测信息的断点落盘频率。'
                    },
                    {
                        path: 'spider.rateLimit.query.minIntervalMs / search.minIntervalMs',
                        valueType: 'integer',
                        required: true,
                        description:
                            '决定 12306 查询和搜索节流速度，间接影响时刻表信息更新、列车发车任务的完成时长。'
                    },
                    {
                        path: 'spider.scheduleProbe.refresh.*',
                        valueType: 'object',
                        required: true,
                        description:
                            '控制路线补刷任务的批大小、TTL 和重新生成周期。'
                    },
                    {
                        path: 'spider.scheduleProbe.probe.defaultRetry / overlapRetryDelaySeconds',
                        valueType: 'integer',
                        required: true,
                        description:
                            '控制 probe_train_departure 的默认重试预算以及重叠冲突后的延迟重排时间。'
                    },
                    {
                        path: 'spider.scheduleProbe.coupling.*',
                        valueType: 'object',
                        required: true,
                        description:
                            '控制耦合编组状态清理、延迟检测和冷却周期。',
                        notes: [
                            'detect_coupled_emu_group 的排队延迟来自 detectDelaySeconds。'
                        ]
                    },
                    {
                        path: 'task.startup.disabledExecutors',
                        valueType: 'array<string>',
                        required: false,
                        description:
                            '可以在启动时跳过 build_today_schedule、generate_route_refresh_tasks、rebuild_reference_model_index、rebuild_train_circulation_index 等关键任务。',
                        notes: [
                            '排查“为什么启动后不抓取”时，先检查这里是否禁用了对应 executor。'
                        ]
                    }
                ]
            }
        ]
    },
    {
        id: 'troubleshooting',
        title: '排障建议',
        summary:
            '抓取类问题通常不是单点故障，而是“任务未注册”“时刻表不是当天”“线路查询失败”“状态冲突未清理”几种模式。',
        blocks: [
            {
                type: 'list',
                title: '建议先检查的点',
                items: [
                    '看启动日志是否出现 registered executor=build_today_schedule、generate_route_refresh_tasks、probe_train_departure、rebuild_train_circulation_index 等关键注册日志。',
                    '确认 data.assets.schedule.file 指向的时刻表更新时间是否为当天，而不是旧文件或状态处于构建中。',
                    '确认 task.startup.disabledExecutors 没有禁用 build_today_schedule、generate_route_refresh_tasks、rebuild_reference_model_index 或 rebuild_train_circulation_index。',
                    '如果当天探测没有生成，优先检查 build_today_schedule 是否成功，以及是否添加了 dispatch_daily_probe_tasks。'
                ]
            },
            {
                type: 'list',
                title: '常见现象对应方向',
                items: [
                    '时刻表有车次但没有 startAt/endAt：优先看 enrich 和 refresh_route_batch 是否连续失败。',
                    '当天没有记录：优先看 dispatch_daily_probe_tasks 是否执行，以及 probe_train_departure 是否因为重试信息耗尽或跨日被跳过。',
                    '同一编组被多个车次抢占：优先看 overlapRetryDelaySeconds、probe status 清理以及 detect_coupled_emu_group 的后续结果。'
                ]
            }
        ]
    }
];
