import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    invalidateProbeAssetsCache,
    preloadProbeAssetsFromLocalFiles,
    readLocalProbeQrcodeMap,
    reloadProbeAssetsFromLocalFilesWithQrcodeDiff,
    validateDownloadedEmuListAssetText,
    validateDownloadedQrCodeAssetText
} from '~/server/services/probeAssetStore';
import {
    formatQrcodeDetectionConfigWarnings,
    invalidateQrcodeDetectionConfigCache,
    reloadQrcodeDetectionConfig,
    validateQrcodeDetectionConfigText
} from '~/server/services/qrcodeDetectionConfigStore';
import {
    invalidateStationCoordAssetsCache,
    preloadStationCoordAssetsFromLocalFile,
    validateDownloadedStationCoordAssetText
} from '~/server/services/stationCoordStore';
import {
    invalidateTrainStyleMappingCache,
    preloadTrainStyleMappingFromLocalFile,
    validateTrainStyleMappingText
} from '~/server/services/trainStyleMappingStore';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import {
    enqueueTemporaryQrcodeDetectionProbeTasks,
    synchronizeQrcodeDetectionDispatchTasks
} from '~/server/services/taskExecutors/dispatchQrcodeDetectionTasksExecutor';
import { enqueueTask } from '~/server/services/taskQueue';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    formatShanghaiDateTime,
    getNextDayExecutionTimeInShanghaiSeconds,
    parseDailyTimeHHmm
} from '~/server/utils/date/shanghaiDateTime';
import {
    refreshAssetFileFromProvider,
    type RefreshableAssetKey as DataAssetRefreshableKey
} from '~/server/utils/dataAssets/store';

type RefreshableAssetKey =
    | 'EMUList'
    | 'QRCode'
    | 'stationCoord'
    | 'trainStyleMapping'
    | 'qrcodeDetection';

interface RefreshAssetTaskDefinition {
    key: RefreshableAssetKey;
    executor: string;
    logger: ReturnType<typeof getLogger>;
}

interface RefreshAssetTaskArgs {
    refreshAt: string;
}

export const REFRESH_EMU_LIST_ASSET_TASK_EXECUTOR = 'refresh_emu_list_asset';
export const REFRESH_QR_CODE_ASSET_TASK_EXECUTOR = 'refresh_qrcode_asset';
export const REFRESH_STATION_COORD_ASSET_TASK_EXECUTOR =
    'refresh_station_coord_asset';
export const REFRESH_TRAIN_STYLE_MAPPING_ASSET_TASK_EXECUTOR =
    'refresh_train_style_mapping_asset';
export const REFRESH_QRCODE_DETECTION_ASSET_TASK_EXECUTOR =
    'refresh_qrcode_detection_asset';

export const REFRESH_ASSET_TASK_DEFINITIONS: readonly RefreshAssetTaskDefinition[] =
    [
        {
            key: 'EMUList',
            executor: REFRESH_EMU_LIST_ASSET_TASK_EXECUTOR,
            logger: getLogger('task-executor:refresh-asset:EMUList')
        },
        {
            key: 'QRCode',
            executor: REFRESH_QR_CODE_ASSET_TASK_EXECUTOR,
            logger: getLogger('task-executor:refresh-asset:QRCode')
        },
        {
            key: 'stationCoord',
            executor: REFRESH_STATION_COORD_ASSET_TASK_EXECUTOR,
            logger: getLogger('task-executor:refresh-asset:stationCoord')
        },
        {
            key: 'trainStyleMapping',
            executor: REFRESH_TRAIN_STYLE_MAPPING_ASSET_TASK_EXECUTOR,
            logger: getLogger('task-executor:refresh-asset:trainStyleMapping')
        },
        {
            key: 'qrcodeDetection',
            executor: REFRESH_QRCODE_DETECTION_ASSET_TASK_EXECUTOR,
            logger: getLogger('task-executor:refresh-asset:qrcodeDetection')
        }
    ] as const;

let registered = false;

function getRefreshDefinition(
    key: RefreshableAssetKey
): RefreshAssetTaskDefinition {
    const definition = REFRESH_ASSET_TASK_DEFINITIONS.find(
        (item) => item.key === key
    );
    if (!definition) {
        throw new Error(`refresh asset task definition not found for ${key}`);
    }
    return definition;
}

function parseRefreshAssetTaskArgs(raw: unknown): RefreshAssetTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const body = raw as { refreshAt?: unknown };
    const refreshAt =
        typeof body.refreshAt === 'string' ? body.refreshAt.trim() : '';
    parseDailyTimeHHmm(refreshAt);

    return {
        refreshAt
    };
}

async function reloadQrcodeDependenciesAfterProbeAssetChange(): Promise<void> {
    invalidateProbeAssetsCache();
    preloadProbeAssetsFromLocalFiles();
    invalidateQrcodeDetectionConfigCache();
    const result = await reloadQrcodeDetectionConfig();
    const warning = formatQrcodeDetectionConfigWarnings(result);
    if (warning.length > 0) {
        getRefreshDefinition('qrcodeDetection').logger.warn(
            `qrcode_detection_config_warning ${warning}`
        );
    }
    await synchronizeQrcodeDetectionDispatchTasks();
}

function getCurrentShanghaiHHmm(): string {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '';
    const detectedAt = `${hour}${minute}`;
    if (!/^\d{4}$/.test(detectedAt)) {
        throw new Error('failed to resolve current Shanghai HHmm');
    }
    return detectedAt;
}

export async function reloadQrcodeAssetAfterRefresh(
    previousQrcodeByModelAndTrainSetNo: ReadonlyMap<string, string>
): Promise<number[]> {
    const { newQrcodeEmuCodes } = reloadProbeAssetsFromLocalFilesWithQrcodeDiff(
        previousQrcodeByModelAndTrainSetNo
    );
    invalidateQrcodeDetectionConfigCache();
    const result = await reloadQrcodeDetectionConfig();
    const warning = formatQrcodeDetectionConfigWarnings(result);
    if (warning.length > 0) {
        getRefreshDefinition('qrcodeDetection').logger.warn(
            `qrcode_detection_config_warning ${warning}`
        );
    }
    await synchronizeQrcodeDetectionDispatchTasks();

    if (newQrcodeEmuCodes.length === 0) {
        getRefreshDefinition('QRCode').logger.info(
            'qrcode_new_emu_scan_skipped count=0'
        );
        return [];
    }

    const detectedAt = getCurrentShanghaiHHmm();
    const taskIds = await enqueueTemporaryQrcodeDetectionProbeTasks(
        detectedAt,
        newQrcodeEmuCodes,
        getNowSeconds()
    );
    getRefreshDefinition('QRCode').logger.info(
        `qrcode_new_emu_scan_queued detectedAt=${detectedAt} count=${newQrcodeEmuCodes.length} taskIds=${taskIds.join(',')} emuCodes=${newQrcodeEmuCodes.join(',')}`
    );
    return taskIds;
}

async function reloadQrcodeDetectionAssetOnly(): Promise<void> {
    invalidateQrcodeDetectionConfigCache();
    const result = await reloadQrcodeDetectionConfig();
    const warning = formatQrcodeDetectionConfigWarnings(result);
    if (warning.length > 0) {
        getRefreshDefinition('qrcodeDetection').logger.warn(
            `qrcode_detection_config_warning ${warning}`
        );
    }
    await synchronizeQrcodeDetectionDispatchTasks();
}

function reloadStationCoordAssetOnly(): void {
    invalidateStationCoordAssetsCache();
    preloadStationCoordAssetsFromLocalFile();
}

function reloadTrainStyleMappingAssetOnly(): void {
    invalidateTrainStyleMappingCache();
    preloadTrainStyleMappingFromLocalFile();
}

function enqueueNextRefreshTask(
    definition: RefreshAssetTaskDefinition,
    refreshAt: string
): number {
    const nextExecutionTime = getNextDayExecutionTimeInShanghaiSeconds(
        Date.now(),
        refreshAt
    );
    const taskId = enqueueTask(
        definition.executor,
        { refreshAt },
        nextExecutionTime
    );
    definition.logger.info(
        `enqueued_next_daily_task id=${taskId} executor=${definition.executor} asset=${definition.key} refreshAt=${refreshAt} executionTime=${nextExecutionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(nextExecutionTime)}`
    );
    return taskId;
}

async function executeRefreshAssetTask(
    definition: RefreshAssetTaskDefinition,
    rawArgs: unknown
): Promise<void> {
    const args = parseRefreshAssetTaskArgs(rawArgs);
    let caughtError: unknown = null;
    try {
        const configuredRefreshAt =
            useConfig().data.assets[definition.key].refresh.refreshAt;
        if (!configuredRefreshAt.includes(args.refreshAt)) {
            definition.logger.info(
                `skip_removed_refresh_time asset=${definition.key} refreshAt=${args.refreshAt}`
            );
            return;
        }

        let previousQrcodeByModelAndTrainSetNo: Map<string, string> | null =
            null;
        if (definition.key === 'QRCode') {
            try {
                previousQrcodeByModelAndTrainSetNo = readLocalProbeQrcodeMap();
            } catch (error) {
                const message =
                    error instanceof Error
                        ? `${error.name}: ${error.message}`
                        : String(error);
                definition.logger.warn(
                    `qrcode_previous_cache_unavailable error=${message}`
                );
                previousQrcodeByModelAndTrainSetNo = new Map();
            }
        }

        const result = await refreshAssetFileFromProvider(
            definition.key as DataAssetRefreshableKey,
            {
                validateContent:
                    definition.key === 'EMUList'
                        ? validateDownloadedEmuListAssetText
                        : definition.key === 'QRCode'
                          ? validateDownloadedQrCodeAssetText
                          : definition.key === 'stationCoord'
                            ? validateDownloadedStationCoordAssetText
                            : definition.key === 'trainStyleMapping'
                              ? validateTrainStyleMappingText
                              : async (content) => {
                                    await validateQrcodeDetectionConfigText(
                                        content
                                    );
                                }
            }
        );
        if (result.refreshed) {
            if (definition.key === 'qrcodeDetection') {
                await reloadQrcodeDetectionAssetOnly();
            } else if (definition.key === 'stationCoord') {
                reloadStationCoordAssetOnly();
            } else if (definition.key === 'trainStyleMapping') {
                reloadTrainStyleMappingAssetOnly();
            } else if (definition.key === 'QRCode') {
                await reloadQrcodeAssetAfterRefresh(
                    previousQrcodeByModelAndTrainSetNo ?? new Map()
                );
            } else {
                await reloadQrcodeDependenciesAfterProbeAssetChange();
            }
            definition.logger.info(
                `refresh_succeeded asset=${definition.key} file=${result.filePath}`
            );
        } else if (result.invalidContent) {
            throw new Error(
                `asset ${definition.key} validation failed: ${result.message ?? 'unknown'}`
            );
        } else {
            const failureReason =
                typeof result.status === 'number'
                    ? `status=${result.status}`
                    : `error=${result.message ?? 'unknown'}`;
            definition.logger.warn(
                `refresh_skipped asset=${definition.key} file=${result.filePath} ${failureReason}`
            );
        }
    } catch (error) {
        caughtError = error;
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        definition.logger.error(
            `refresh_failed asset=${definition.key} error=${message}`
        );
    } finally {
        try {
            enqueueNextRefreshTask(definition, args.refreshAt);
        } catch (error) {
            const message =
                error instanceof Error
                    ? `${error.name}: ${error.message}`
                    : String(error);
            definition.logger.error(
                `enqueue_next_daily_task_failed asset=${definition.key} error=${message}`
            );
            if (!caughtError) {
                caughtError = error;
            }
        }
    }

    if (caughtError) {
        throw caughtError;
    }
}

export function registerRefreshAssetFileTaskExecutors(): void {
    if (registered) {
        return;
    }

    for (const definition of REFRESH_ASSET_TASK_DEFINITIONS) {
        registerTaskExecutor(definition.executor, async (args) => {
            await executeRefreshAssetTask(definition, args);
        });
        definition.logger.info(`registered executor=${definition.executor}`);
    }

    registered = true;
}
