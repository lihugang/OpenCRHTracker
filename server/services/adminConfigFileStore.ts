import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import useConfig, {
    getResolvedConfigPath,
    parseConfigText,
    reloadConfig
} from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { invalidateHistoricalTimetableContentCache } from '~/server/services/historicalTimetableResolver';
import { invalidateTimetableHistoryCoverageCache } from '~/server/services/timetableHistoryStore';
import { invalidateLookupIndexCache } from '~/server/services/lookupIndexStore';
import {
    invalidateProbeAssetsCache,
    preloadProbeAssetsFromLocalFiles,
    readLocalProbeQrcodeMap,
    validateDownloadedEmuListAssetText,
    validateDownloadedQrCodeAssetText
} from '~/server/services/probeAssetStore';
import {
    formatQrcodeDetectionConfigWarnings,
    getQrcodeDetectionConfigPath,
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
import {
    invalidateSupplementTrainRegistryCache,
    preloadSupplementTrainRegistryFromLocalFile,
    validateSupplementTrainsText
} from '~/server/services/supplementTrainRegistryStore';
import { invalidateTodayScheduleCache } from '~/server/services/todayScheduleCache';
import { synchronizeQrcodeDetectionDispatchTasks } from '~/server/services/taskExecutors/dispatchQrcodeDetectionTasksExecutor';
import { reloadQrcodeAssetAfterRefresh } from '~/server/services/taskExecutors/refreshAssetFileTaskExecutor';
import { synchronizeDatabaseBackupTasks } from '~/server/services/taskExecutors/backupDatabaseTaskExecutor';
import { synchronizeStationPlatformOverlapTask } from '~/server/services/taskExecutors/scanStationPlatformOverlapsTaskExecutor';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import ensure from '~/server/utils/api/executor/ensure';
import {
    getAssetFilePath,
    readAssetText,
    refreshAssetFileFromProvider,
    writeTextFileAtomically
} from '~/server/utils/dataAssets/store';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type {
    AdminConfigFileAction,
    AdminConfigFileActionRequest,
    AdminConfigFileActionResponse,
    AdminConfigFileItem,
    AdminConfigFilesResponse,
    AdminConfigFileTarget,
    AdminRuntimeConfigDocumentResponse,
    AdminRuntimeConfigUpdateRequest,
    AdminRuntimeConfigUpdateResponse
} from '~/types/admin';

const logger = getLogger('admin-config-file-store');
let configOperationTail = Promise.resolve();

type AssetTarget = Extract<
    AdminConfigFileTarget,
    | 'EMUList'
    | 'QRCode'
    | 'stationCoord'
    | 'trainStyleMapping'
    | 'qrcodeDetection'
    | 'supplementTrains'
>;

const CONFIG_FILE_TARGETS: readonly AdminConfigFileTarget[] = [
    'config',
    'EMUList',
    'QRCode',
    'stationCoord',
    'trainStyleMapping',
    'qrcodeDetection',
    'supplementTrains'
];

function assertConfigFileTarget(
    value: string
): asserts value is AdminConfigFileTarget {
    ensure(
        (CONFIG_FILE_TARGETS as readonly string[]).includes(value),
        400,
        'invalid_param',
        '不支持的配置文件目标'
    );
}

function toTimestampSeconds(value: number): number {
    return Math.floor(value / 1000);
}

async function runSerializedConfigOperation<T>(
    operation: () => Promise<T> | T
): Promise<T> {
    const previousOperation = configOperationTail;
    let releaseOperation: () => void = () => undefined;
    configOperationTail = new Promise<void>((resolve) => {
        releaseOperation = resolve;
    });

    await previousOperation;
    try {
        return await operation();
    } finally {
        releaseOperation();
    }
}

function getContentRevision(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function formatErrorForLog(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/[\r\n]+/g, ' ').slice(0, 1000);
}

function getFileStatus(filePath: string): {
    exists: boolean;
    modifiedAt: number | null;
} {
    const absolutePath = path.resolve(filePath);

    try {
        const stats = fs.statSync(absolutePath);
        return {
            exists: true,
            modifiedAt: toTimestampSeconds(stats.mtimeMs)
        };
    } catch {
        return {
            exists: false,
            modifiedAt: null
        };
    }
}

function buildConfigFileItem(
    target: AdminConfigFileTarget
): AdminConfigFileItem {
    if (target === 'config') {
        const filePath = getResolvedConfigPath();
        const status = getFileStatus(filePath);

        return {
            target,
            title: '运行配置',
            description: '重载当前服务使用的运行配置文件。',
            filePath: path.resolve(filePath),
            provider: null,
            exists: status.exists,
            modifiedAt: status.modifiedAt,
            editable: true,
            supportedActions: ['reload_local']
        };
    }

    if (target === 'qrcodeDetection') {
        const assetConfig = useConfig().data.assets.qrcodeDetection;
        const filePath = path.resolve(getQrcodeDetectionConfigPath());
        const status = getFileStatus(filePath);
        const supportedActions: AdminConfigFileAction[] = ['reload_local'];

        if (
            typeof assetConfig.provider === 'string' &&
            assetConfig.provider.trim().length > 0
        ) {
            supportedActions.push('refresh_remote');
        }

        return {
            target,
            title: '固定车组畅行码检测计划',
            description:
                '重载或刷新固定车组畅行码检测计划配置，并重新同步未来的派发任务。',
            filePath,
            provider: assetConfig.provider ?? null,
            exists: status.exists,
            modifiedAt: status.modifiedAt,
            editable: true,
            supportedActions
        };
    }

    const assetConfig = useConfig().data.assets[target];
    const filePath = getAssetFilePath(target);
    const status = getFileStatus(filePath);
    const supportedActions: AdminConfigFileAction[] = ['reload_local'];

    if (
        typeof assetConfig.provider === 'string' &&
        assetConfig.provider.trim().length > 0
    ) {
        supportedActions.push('refresh_remote');
    }

    return {
        target,
        title:
            target === 'EMUList'
                ? '动车组配属清单'
                : target === 'QRCode'
                  ? '畅行码映射'
                  : target === 'trainStyleMapping'
                    ? '车型映射表'
                    : target === 'supplementTrains'
                      ? '补充车次'
                      : '车站坐标文件',
        description:
            target === 'EMUList'
                ? '重载或刷新探测流程与管理流程使用的动车组配属清单。'
                : target === 'QRCode'
                  ? '重载或刷新席位码识别使用的畅行码映射数据。'
                  : target === 'trainStyleMapping'
                    ? '重载或刷新参考车型回退使用的 trainStyle 到车型名映射表。'
                    : target === 'supplementTrains'
                      ? '重载或刷新 12306 未收录车次的补充时刻表数据，下一次构建今日时刻表时写入 schedule 数据库。'
                      : '重载或刷新线路时刻表下载使用的外部车站坐标回退文件。',
        filePath,
        provider: assetConfig.provider ?? null,
        exists: status.exists,
        modifiedAt: status.modifiedAt,
        editable:
            target === 'trainStyleMapping' || target === 'supplementTrains',
        supportedActions
    };
}

function resetSafeRuntimeCaches(): void {
    invalidateProbeAssetsCache();
    invalidateStationCoordAssetsCache();
    invalidateLookupIndexCache();
    invalidateTodayScheduleCache();
    invalidateHistoricalTimetableContentCache();
    invalidateTimetableHistoryCoverageCache();
}

async function reloadQrcodeDetectionAfterAssetChange(): Promise<string> {
    invalidateQrcodeDetectionConfigCache();
    const result = await reloadQrcodeDetectionConfig();
    await synchronizeQrcodeDetectionDispatchTasks();
    return formatQrcodeDetectionConfigWarnings(result);
}

function reloadStationCoordAssetFromLocal(): void {
    invalidateStationCoordAssetsCache();
    preloadStationCoordAssetsFromLocalFile();
}

function reloadTrainStyleMappingAssetFromLocal(): void {
    invalidateTrainStyleMappingCache();
    preloadTrainStyleMappingFromLocalFile();
}

function reloadSupplementTrainAssetFromLocal(): void {
    invalidateSupplementTrainRegistryCache();
    preloadSupplementTrainRegistryFromLocalFile();
}

function assertActionSupported(
    target: AdminConfigFileTarget,
    action: AdminConfigFileAction
): void {
    if (target === 'config') {
        ensure(
            action === 'reload_local',
            400,
            'invalid_param',
            `${target} 仅支持 reload_local 操作`
        );
        return;
    }

    ensure(
        action === 'reload_local' || action === 'refresh_remote',
        400,
        'invalid_param',
        '资产文件仅支持 reload_local 或 refresh_remote 操作'
    );
}

async function reloadConfigFromLocal(
    actorUserId = '',
    source: 'manual' | 'editor' | 'editor_rollback' = 'manual'
): Promise<AdminConfigFileActionResponse> {
    reloadConfig();
    resetSafeRuntimeCaches();
    const qrcodeWarning = await reloadQrcodeDetectionAfterAssetChange();
    const backupTasks = synchronizeDatabaseBackupTasks();
    const stationPlatformOverlapTask = synchronizeStationPlatformOverlapTask();

    const item = buildConfigFileItem('config');
    logger.info(
        `admin_config_reload_local actor=${actorUserId || 'unknown'} source=${source} file=${item.filePath}`
    );

    return {
        target: 'config',
        action: 'reload_local',
        summary:
            qrcodeWarning.length > 0
                ? `已重载当前运行配置文件，并重新同步固定车组畅行码检测计划、数据库备份计划（${backupTasks.length} 个时刻）和站台重叠扫描计划（${stationPlatformOverlapTask.status}）。${qrcodeWarning}`
                : `已重载当前运行配置文件，并重新同步固定车组畅行码检测计划、数据库备份计划（${backupTasks.length} 个时刻）和站台重叠扫描计划（${stationPlatformOverlapTask.status}）。`,
        item
    };
}

async function reloadQrcodeDetectionFromLocal(): Promise<AdminConfigFileActionResponse> {
    const filePath = getQrcodeDetectionConfigPath();
    const text = fs.readFileSync(filePath, 'utf8');
    const validationResult = await validateQrcodeDetectionConfigText(text);
    invalidateQrcodeDetectionConfigCache();
    await reloadQrcodeDetectionConfig();
    await synchronizeQrcodeDetectionDispatchTasks();

    const item = buildConfigFileItem('qrcodeDetection');
    logger.info(`admin_qrcode_detection_reload_local file=${filePath}`);
    const warningSummary =
        formatQrcodeDetectionConfigWarnings(validationResult);

    return {
        target: 'qrcodeDetection',
        action: 'reload_local',
        summary:
            warningSummary.length > 0
                ? `已重载固定车组畅行码检测计划配置，并同步未来派发任务。${warningSummary}`
                : '已重载固定车组畅行码检测计划配置，并同步未来派发任务。',
        item
    };
}

async function reloadAssetFromLocal(
    target: AssetTarget
): Promise<AdminConfigFileActionResponse> {
    if (target === 'qrcodeDetection') {
        return await reloadQrcodeDetectionFromLocal();
    }

    const filePath = getAssetFilePath(target);
    const text = readAssetText(target);

    if (target === 'EMUList') {
        validateDownloadedEmuListAssetText(text);
    } else if (target === 'QRCode') {
        validateDownloadedQrCodeAssetText(text);
    } else if (target === 'trainStyleMapping') {
        validateTrainStyleMappingText(text);
    } else if (target === 'supplementTrains') {
        validateSupplementTrainsText(text);
    } else {
        validateDownloadedStationCoordAssetText(text);
    }

    let qrcodeWarning = '';
    if (target === 'stationCoord') {
        reloadStationCoordAssetFromLocal();
    } else if (target === 'trainStyleMapping') {
        reloadTrainStyleMappingAssetFromLocal();
    } else if (target === 'supplementTrains') {
        reloadSupplementTrainAssetFromLocal();
    } else {
        invalidateProbeAssetsCache();
        preloadProbeAssetsFromLocalFiles();
        invalidateLookupIndexCache();
        qrcodeWarning = await reloadQrcodeDetectionAfterAssetChange();
    }

    const item = buildConfigFileItem(target);
    logger.info(`admin_asset_reload_local target=${target} file=${filePath}`);

    return {
        target,
        action: 'reload_local',
        summary:
            target === 'EMUList'
                ? `已重载本地动车组配属清单，并刷新固定车组畅行码检测依赖。${qrcodeWarning}`
                : target === 'QRCode'
                  ? `已重载本地畅行码映射，并刷新固定车组畅行码检测依赖。${qrcodeWarning}`
                  : target === 'trainStyleMapping'
                    ? '已重载本地车型映射表，后续参考车型回退会使用新的映射规则。'
                    : target === 'supplementTrains'
                      ? '已重载本地补充车次，下一次构建今日时刻表时会同步到 schedule 数据库。'
                      : '已重载本地车站坐标文件，后续线路时刻表下载任务会使用新的坐标回退规则。',
        item
    };
}

async function refreshAssetFromRemote(
    target: AssetTarget
): Promise<AdminConfigFileActionResponse> {
    const item = buildConfigFileItem(target);
    ensure(
        item.supportedActions.includes('refresh_remote'),
        409,
        'refresh_failed',
        '所选资产未配置远程数据源'
    );

    let previousQrcodeByModelAndTrainSetNo: Map<string, string> | null = null;
    if (target === 'QRCode') {
        try {
            previousQrcodeByModelAndTrainSetNo = readLocalProbeQrcodeMap();
        } catch (error) {
            const message =
                error instanceof Error
                    ? `${error.name}: ${error.message}`
                    : String(error);
            logger.warn(`admin_qrcode_previous_cache_unavailable ${message}`);
            previousQrcodeByModelAndTrainSetNo = new Map();
        }
    }

    const result = await refreshAssetFileFromProvider(target, {
        validateContent:
            target === 'EMUList'
                ? validateDownloadedEmuListAssetText
                : target === 'QRCode'
                  ? validateDownloadedQrCodeAssetText
                  : target === 'stationCoord'
                    ? validateDownloadedStationCoordAssetText
                    : target === 'trainStyleMapping'
                      ? validateTrainStyleMappingText
                      : target === 'supplementTrains'
                        ? validateSupplementTrainsText
                        : async (content) => {
                              await validateQrcodeDetectionConfigText(content);
                          }
    });

    ensure(
        result.refreshed,
        409,
        'refresh_failed',
        result.invalidContent
            ? `远程内容校验失败：${result.message ?? '未知原因'}`
            : result.message
              ? `远程刷新失败：${result.message}`
              : typeof result.status === 'number'
                ? `远程刷新失败，HTTP 状态码 ${result.status}`
                : '远程刷新失败'
    );

    let qrcodeWarning = '';
    if (target === 'qrcodeDetection') {
        qrcodeWarning = await reloadQrcodeDetectionAfterAssetChange();
    } else if (target === 'stationCoord') {
        reloadStationCoordAssetFromLocal();
    } else if (target === 'trainStyleMapping') {
        reloadTrainStyleMappingAssetFromLocal();
    } else if (target === 'supplementTrains') {
        reloadSupplementTrainAssetFromLocal();
    } else if (target === 'QRCode') {
        await reloadQrcodeAssetAfterRefresh(
            previousQrcodeByModelAndTrainSetNo ?? new Map()
        );
        invalidateLookupIndexCache();
    } else {
        invalidateProbeAssetsCache();
        preloadProbeAssetsFromLocalFiles();
        invalidateLookupIndexCache();
        qrcodeWarning = await reloadQrcodeDetectionAfterAssetChange();
    }

    const nextItem = buildConfigFileItem(target);
    logger.info(
        `admin_asset_refresh_remote target=${target} file=${nextItem.filePath}`
    );

    return {
        target,
        action: 'refresh_remote',
        summary:
            target === 'EMUList'
                ? `已从远程来源刷新动车组配属清单，并同步固定车组畅行码检测任务。${qrcodeWarning}`
                : target === 'QRCode'
                  ? `已从远程来源刷新畅行码映射，并同步固定车组畅行码检测任务。${qrcodeWarning}`
                  : target === 'trainStyleMapping'
                    ? '已从远程来源刷新车型映射表，后续参考车型回退会使用新的映射规则。'
                    : target === 'supplementTrains'
                      ? '已从远程来源刷新补充车次，下一次构建今日时刻表时会同步到 schedule 数据库。'
                      : target === 'stationCoord'
                        ? '已从远程来源刷新车站坐标文件，后续线路时刻表下载任务会使用新的坐标回退规则。'
                        : `已从远程来源刷新固定车组畅行码检测计划，并同步未来派发任务。${qrcodeWarning}`,
        item: nextItem
    };
}

export function getAdminConfigFiles(): AdminConfigFilesResponse {
    return {
        asOf: getNowSeconds(),
        items: CONFIG_FILE_TARGETS.map((target) => buildConfigFileItem(target))
    };
}

function readAdminConfigFileDocument(
    target: AdminConfigFileTarget
): AdminRuntimeConfigDocumentResponse {
    const filePath =
        target === 'config'
            ? path.resolve(getResolvedConfigPath())
            : path.resolve(getAssetFilePath(target));
    const content = fs.readFileSync(filePath, 'utf8');
    const status = getFileStatus(filePath);

    if (status.modifiedAt === null) {
        throw new ApiRequestError(
            404,
            'config_not_found',
            target === 'config' ? '当前运行配置文件不存在' : '配置文件不存在'
        );
    }

    return {
        content,
        revision: getContentRevision(content),
        filePath,
        modifiedAt: status.modifiedAt
    };
}

export async function getAdminConfigFileDocument(
    target: string
): Promise<AdminRuntimeConfigDocumentResponse> {
    return await runSerializedConfigOperation(async () => {
        assertConfigFileTarget(target);
        return readAdminConfigFileDocument(target);
    });
}

async function validateConfigFileContent(
    target: AdminConfigFileTarget,
    content: string
): Promise<void> {
    if (target === 'config') {
        try {
            parseConfigText(content);
        } catch (error) {
            throw new ApiRequestError(
                400,
                'invalid_config',
                `配置校验失败：${formatErrorForLog(error)}`
            );
        }
        return;
    }

    try {
        if (target === 'EMUList') {
            validateDownloadedEmuListAssetText(content);
        } else if (target === 'QRCode') {
            validateDownloadedQrCodeAssetText(content);
        } else if (target === 'stationCoord') {
            validateDownloadedStationCoordAssetText(content);
        } else if (target === 'trainStyleMapping') {
            validateTrainStyleMappingText(content);
        } else if (target === 'supplementTrains') {
            validateSupplementTrainsText(content);
        } else {
            await validateQrcodeDetectionConfigText(content);
        }
    } catch (error) {
        throw new ApiRequestError(
            400,
            'invalid_config',
            `配置文件校验失败：${formatErrorForLog(error)}`
        );
    }
}

export async function updateAdminConfigFileDocument(
    target: string,
    request: AdminRuntimeConfigUpdateRequest,
    actorUserId: string
): Promise<AdminRuntimeConfigUpdateResponse> {
    return await runSerializedConfigOperation(async () => {
        assertConfigFileTarget(target);
        const previousDocument = readAdminConfigFileDocument(target);
        ensure(
            request.expectedRevision === previousDocument.revision,
            409,
            'config_conflict',
            '配置文件已被其他操作修改，请重新读取最新版本后再提交'
        );

        await validateConfigFileContent(target, request.content);

        try {
            writeTextFileAtomically(previousDocument.filePath, request.content);
        } catch (error) {
            logger.error(
                `admin_config_write_failed actor=${actorUserId} target=${target} file=${previousDocument.filePath} previousRevision=${previousDocument.revision} error=${formatErrorForLog(error)}`
            );
            throw new ApiRequestError(
                500,
                'config_write_failed',
                '配置文件写入失败，请查看服务日志'
            );
        }

        try {
            const reloadResult =
                target === 'config'
                    ? await reloadConfigFromLocal(actorUserId, 'editor')
                    : await reloadAssetFromLocal(target);
            const nextDocument = readAdminConfigFileDocument(target);
            logger.info(
                `admin_config_updated actor=${actorUserId} target=${target} file=${nextDocument.filePath} previousRevision=${previousDocument.revision} revision=${nextDocument.revision}`
            );

            return {
                summary: `已保存并尝试重载${target === 'config' ? '运行配置' : '配置文件'}。${reloadResult.summary}`,
                revision: nextDocument.revision,
                modifiedAt: nextDocument.modifiedAt,
                item: reloadResult.item
            };
        } catch (reloadError) {
            try {
                writeTextFileAtomically(
                    previousDocument.filePath,
                    previousDocument.content
                );
                if (target === 'config') {
                    await reloadConfigFromLocal(actorUserId, 'editor_rollback');
                } else {
                    await reloadAssetFromLocal(target);
                }
                logger.warn(
                    `admin_config_update_rolled_back actor=${actorUserId} target=${target} file=${previousDocument.filePath} revision=${previousDocument.revision} error=${formatErrorForLog(reloadError)}`
                );
            } catch (rollbackError) {
                logger.error(
                    `admin_config_rollback_failed actor=${actorUserId} target=${target} file=${previousDocument.filePath} revision=${previousDocument.revision} reloadError=${formatErrorForLog(reloadError)} rollbackError=${formatErrorForLog(rollbackError)}`
                );
                throw new ApiRequestError(
                    500,
                    'config_rollback_failed',
                    '新配置重载失败，自动回滚也未能完整完成，请立即检查服务日志和配置文件'
                );
            }

            throw new ApiRequestError(
                500,
                'config_reload_failed',
                '新配置重载失败，已自动恢复原配置，请查看服务日志'
            );
        }
    });
}

export async function runAdminConfigFileAction(
    request: AdminConfigFileActionRequest,
    actorUserId = ''
): Promise<AdminConfigFileActionResponse> {
    return await runSerializedConfigOperation(async () => {
        assertActionSupported(request.target, request.action);

        switch (request.target) {
            case 'config':
                return await reloadConfigFromLocal(actorUserId);
            case 'EMUList':
            case 'QRCode':
            case 'stationCoord':
            case 'trainStyleMapping':
            case 'qrcodeDetection':
            case 'supplementTrains':
                if (request.action === 'reload_local') {
                    return await reloadAssetFromLocal(request.target);
                }
                return await refreshAssetFromRemote(request.target);
            default:
                request.target satisfies never;
                throw new Error('Unsupported config file target');
        }
    });
}
