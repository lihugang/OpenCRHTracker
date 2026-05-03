import fs from 'fs';
import path from 'path';
import useConfig, {
    getResolvedConfigPath,
    reloadConfig
} from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { invalidateLookupIndexCache } from '~/server/services/lookupIndexStore';
import {
    invalidateProbeAssetsCache,
    preloadProbeAssetsFromLocalFiles,
    validateDownloadedEmuListAssetText,
    validateDownloadedQrCodeAssetText
} from '~/server/services/probeAssetStore';
import {
    formatQrcodeDetectionMissingMappingsWarning,
    getQrcodeDetectionConfigPath,
    invalidateQrcodeDetectionConfigCache,
    reloadQrcodeDetectionConfig,
    validateQrcodeDetectionConfigText
} from '~/server/services/qrcodeDetectionConfigStore';
import {
    synchronizeQrcodeDetectionDispatchTasks
} from '~/server/services/taskExecutors/dispatchQrcodeDetectionTasksExecutor';
import { invalidateTodayScheduleCache } from '~/server/services/todayScheduleCache';
import ensure from '~/server/utils/api/executor/ensure';
import {
    getAssetFilePath,
    readAssetText,
    refreshAssetFileFromProvider
} from '~/server/utils/dataAssets/store';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type {
    AdminConfigFileAction,
    AdminConfigFileActionRequest,
    AdminConfigFileActionResponse,
    AdminConfigFileItem,
    AdminConfigFilesResponse,
    AdminConfigFileTarget
} from '~/types/admin';

const logger = getLogger('admin-config-file-store');

type AssetTarget = Extract<
    AdminConfigFileTarget,
    'EMUList' | 'QRCode' | 'qrcodeDetection'
>;

function toTimestampSeconds(value: number): number {
    return Math.floor(value / 1000);
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

function buildConfigFileItem(target: AdminConfigFileTarget): AdminConfigFileItem {
    if (target === 'config') {
        const filePath = getResolvedConfigPath();
        const status = getFileStatus(filePath);

        return {
            target,
            title: '运行配置',
            description:
                '重载当前服务使用的运行配置文件。',
            filePath: path.resolve(filePath),
            provider: null,
            exists: status.exists,
            modifiedAt: status.modifiedAt,
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
        title: target === 'EMUList' ? '动车组配属清单' : '畅行码映射',
        description:
            target === 'EMUList'
                ? '重载或刷新探测流程与管理流程使用的动车组配属清单。'
                : '重载或刷新席位码识别使用的畅行码映射数据。',
        filePath,
        provider: assetConfig.provider ?? null,
        exists: status.exists,
        modifiedAt: status.modifiedAt,
        supportedActions
    };
}

function resetSafeRuntimeCaches(): void {
    invalidateProbeAssetsCache();
    invalidateLookupIndexCache();
    invalidateTodayScheduleCache();
}

async function reloadQrcodeDetectionAfterAssetChange(): Promise<string> {
    invalidateQrcodeDetectionConfigCache();
    const result = await reloadQrcodeDetectionConfig();
    await synchronizeQrcodeDetectionDispatchTasks();
    return formatQrcodeDetectionMissingMappingsWarning(
        result.missingQrcodeMappings
    );
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

async function reloadConfigFromLocal(): Promise<AdminConfigFileActionResponse> {
    reloadConfig();
    resetSafeRuntimeCaches();
    const qrcodeWarning = await reloadQrcodeDetectionAfterAssetChange();

    const item = buildConfigFileItem('config');
    logger.info(`admin_config_reload_local file=${item.filePath}`);

    return {
        target: 'config',
        action: 'reload_local',
        summary:
            qrcodeWarning.length > 0
                ? `已重载当前运行配置文件，并重新同步固定车组畅行码检测计划。${qrcodeWarning}`
                : '已重载当前运行配置文件，并重新同步固定车组畅行码检测计划。',
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
    const warningSummary = formatQrcodeDetectionMissingMappingsWarning(
        validationResult.missingQrcodeMappings
    );

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
    } else {
        validateDownloadedQrCodeAssetText(text);
    }

    invalidateProbeAssetsCache();
    preloadProbeAssetsFromLocalFiles();
    invalidateLookupIndexCache();
    const qrcodeWarning = await reloadQrcodeDetectionAfterAssetChange();

    const item = buildConfigFileItem(target);
    logger.info(`admin_asset_reload_local target=${target} file=${filePath}`);

    return {
        target,
        action: 'reload_local',
        summary:
            target === 'EMUList'
                ? `已重载本地动车组配属清单，并刷新固定车组畅行码检测依赖。${qrcodeWarning}`
                : `已重载本地畅行码映射，并刷新固定车组畅行码检测依赖。${qrcodeWarning}`,
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

    const result = await refreshAssetFileFromProvider(target, {
        validateContent:
            target === 'EMUList'
                ? validateDownloadedEmuListAssetText
                : target === 'QRCode'
                  ? validateDownloadedQrCodeAssetText
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
                  : `已从远程来源刷新固定车组畅行码检测计划，并同步未来派发任务。${qrcodeWarning}`,
        item: nextItem
    };
}

export function getAdminConfigFiles(): AdminConfigFilesResponse {
    return {
        asOf: getNowSeconds(),
        items: [
            buildConfigFileItem('config'),
            buildConfigFileItem('EMUList'),
            buildConfigFileItem('QRCode'),
            buildConfigFileItem('qrcodeDetection')
        ]
    };
}

export async function runAdminConfigFileAction(
    request: AdminConfigFileActionRequest
): Promise<AdminConfigFileActionResponse> {
    assertActionSupported(request.target, request.action);

    switch (request.target) {
        case 'config':
            return await reloadConfigFromLocal();
        case 'EMUList':
        case 'QRCode':
        case 'qrcodeDetection':
            if (request.action === 'reload_local') {
                return await reloadAssetFromLocal(request.target);
            }
            return await refreshAssetFromRemote(request.target);
        default:
            request.target satisfies never;
            throw new Error('Unsupported config file target');
    }
}
