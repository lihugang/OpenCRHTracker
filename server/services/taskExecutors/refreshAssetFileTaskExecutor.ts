import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    invalidateProbeAssetsCache,
    preloadProbeAssetsFromLocalFiles,
    validateDownloadedEmuListAssetText,
    validateDownloadedQrCodeAssetText
} from '~/server/services/probeAssetStore';
import {
    invalidateQrcodeDetectionConfigCache,
    reloadQrcodeDetectionConfig,
    validateQrcodeDetectionConfigText
} from '~/server/services/qrcodeDetectionConfigStore';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { synchronizeQrcodeDetectionDispatchTasks } from '~/server/services/taskExecutors/dispatchQrcodeDetectionTasksExecutor';
import { enqueueTask } from '~/server/services/taskQueue';
import {
    formatShanghaiDateTime,
    getNextDayExecutionTimeInShanghaiSeconds
} from '~/server/utils/date/shanghaiDateTime';
import {
    refreshAssetFileFromProvider,
    type AssetKey
} from '~/server/utils/dataAssets/store';

type RefreshableAssetKey = 'EMUList' | 'QRCode' | 'qrcodeDetection';

interface RefreshAssetTaskDefinition {
    key: RefreshableAssetKey;
    executor: string;
    logger: ReturnType<typeof getLogger>;
}

export const REFRESH_EMU_LIST_ASSET_TASK_EXECUTOR = 'refresh_emu_list_asset';
export const REFRESH_QR_CODE_ASSET_TASK_EXECUTOR = 'refresh_qrcode_asset';
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

async function reloadQrcodeDependenciesAfterProbeAssetChange(): Promise<void> {
    invalidateProbeAssetsCache();
    preloadProbeAssetsFromLocalFiles();
    invalidateQrcodeDetectionConfigCache();
    await reloadQrcodeDetectionConfig();
    await synchronizeQrcodeDetectionDispatchTasks();
}

async function reloadQrcodeDetectionAssetOnly(): Promise<void> {
    invalidateQrcodeDetectionConfigCache();
    await reloadQrcodeDetectionConfig();
    await synchronizeQrcodeDetectionDispatchTasks();
}

function enqueueNextRefreshTask(
    definition: RefreshAssetTaskDefinition
): number {
    const refreshAt = useConfig().data.assets[definition.key].refresh.refreshAt;
    const nextExecutionTime = getNextDayExecutionTimeInShanghaiSeconds(
        Date.now(),
        refreshAt
    );
    const taskId = enqueueTask(definition.executor, {}, nextExecutionTime);
    definition.logger.info(
        `enqueued_next_daily_task id=${taskId} executor=${definition.executor} asset=${definition.key} executionTime=${nextExecutionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(nextExecutionTime)}`
    );
    return taskId;
}

async function executeRefreshAssetTask(
    definition: RefreshAssetTaskDefinition
): Promise<void> {
    let caughtError: unknown = null;
    try {
        const result = await refreshAssetFileFromProvider(
            definition.key as AssetKey,
            {
                validateContent:
                    definition.key === 'EMUList'
                        ? validateDownloadedEmuListAssetText
                        : definition.key === 'QRCode'
                          ? validateDownloadedQrCodeAssetText
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
            enqueueNextRefreshTask(definition);
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
        registerTaskExecutor(definition.executor, async () => {
            await executeRefreshAssetTask(definition);
        });
        definition.logger.info(`registered executor=${definition.executor}`);
    }

    registered = true;
}
