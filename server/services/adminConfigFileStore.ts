import fs from 'fs';
import path from 'path';
import useConfig, {
    getResolvedConfigPath,
    reloadConfig
} from '~/server/config';
import getLogger from '~/server/libs/log4js';
import {
    invalidateLookupIndexCache
} from '~/server/services/lookupIndexStore';
import {
    invalidateProbeAssetsCache,
    preloadProbeAssetsFromLocalFiles,
    validateDownloadedEmuListAssetText,
    validateDownloadedQrCodeAssetText
} from '~/server/services/probeAssetStore';
import {
    invalidateTodayScheduleCache
} from '~/server/services/todayScheduleCache';
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
            title: '配置文件',
            description: '重读当前正在使用的 config.json，并刷新相关运行时缓存。',
            filePath: path.resolve(filePath),
            provider: null,
            exists: status.exists,
            modifiedAt: status.modifiedAt,
            supportedActions: ['reload_local']
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
        title: target === 'EMUList' ? '动车组配属清单' : '畅行码',
        description:
            target === 'EMUList'
                ? '重载或重新下载动车组配属清单，更新配属解析与管理员配属选项。'
                : '重载或重新下载畅行码映射，更新车组二维码识别映射。',
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

function assertActionSupported(
    target: AdminConfigFileTarget,
    action: AdminConfigFileAction
): void {
    if (target === 'config') {
        ensure(
            action === 'reload_local',
            400,
            'invalid_param',
            '配置文件仅支持从本地重载'
        );
        return;
    }

    ensure(
        action === 'reload_local' || action === 'refresh_remote',
        400,
        'invalid_param',
        '资源文件仅支持从本地重载或从远程服务器重新下载'
    );
}

function reloadConfigFromLocal(): AdminConfigFileActionResponse {
    reloadConfig();
    resetSafeRuntimeCaches();

    const item = buildConfigFileItem('config');
    logger.info(`admin_config_reload_local file=${item.filePath}`);

    return {
        target: 'config',
        action: 'reload_local',
        summary: '已从本地重载配置文件，并清空相关运行时缓存。',
        item
    };
}

function reloadAssetFromLocal(
    target: Extract<AdminConfigFileTarget, 'EMUList' | 'QRCode'>
): AdminConfigFileActionResponse {
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

    const item = buildConfigFileItem(target);
    logger.info(`admin_asset_reload_local target=${target} file=${filePath}`);

    return {
        target,
        action: 'reload_local',
        summary:
            target === 'EMUList'
                ? '已从本地重载动车组配属清单。'
                : '已从本地重载畅行码文件。',
        item
    };
}

async function refreshAssetFromRemote(
    target: Extract<AdminConfigFileTarget, 'EMUList' | 'QRCode'>
): Promise<AdminConfigFileActionResponse> {
    const item = buildConfigFileItem(target);
    ensure(
        item.supportedActions.includes('refresh_remote'),
        409,
        'refresh_failed',
        '当前资源文件未配置远程下载地址'
    );

    const result = await refreshAssetFileFromProvider(target, {
        validateContent:
            target === 'EMUList'
                ? validateDownloadedEmuListAssetText
                : validateDownloadedQrCodeAssetText
    });

    ensure(
        result.refreshed,
        409,
        'refresh_failed',
        result.invalidContent
            ? `远程内容校验失败：${result.message ?? 'unknown'}`
            : result.message
              ? `远程下载失败：${result.message}`
              : typeof result.status === 'number'
                ? `远程下载失败，HTTP 状态码 ${result.status}`
                : '远程下载失败'
    );

    invalidateProbeAssetsCache();
    preloadProbeAssetsFromLocalFiles();
    invalidateLookupIndexCache();

    const nextItem = buildConfigFileItem(target);
    logger.info(
        `admin_asset_refresh_remote target=${target} file=${nextItem.filePath}`
    );

    return {
        target,
        action: 'refresh_remote',
        summary:
            target === 'EMUList'
                ? '已从远程服务器重新下载动车组配属清单。'
                : '已从远程服务器重新下载畅行码文件。',
        item: nextItem
    };
}

export function getAdminConfigFiles(): AdminConfigFilesResponse {
    return {
        asOf: getNowSeconds(),
        items: [
            buildConfigFileItem('config'),
            buildConfigFileItem('EMUList'),
            buildConfigFileItem('QRCode')
        ]
    };
}

export async function runAdminConfigFileAction(
    request: AdminConfigFileActionRequest
): Promise<AdminConfigFileActionResponse> {
    assertActionSupported(request.target, request.action);

    switch (request.target) {
        case 'config':
            return reloadConfigFromLocal();
        case 'EMUList':
        case 'QRCode':
            if (request.action === 'reload_local') {
                return reloadAssetFromLocal(request.target);
            }
            return await refreshAssetFromRemote(request.target);
        default:
            request.target satisfies never;
            throw new Error('Unsupported config file target');
    }
}
