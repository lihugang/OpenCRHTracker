import fs from 'fs';
import path from 'path';
import useConfig, { type Config } from '~/server/config';
import getLogger from '~/server/libs/log4js';

const logger = getLogger('data-assets');

export type AssetKey = keyof Config['data']['assets'];

export interface EnsureAssetOptions {
    defaultContent: string;
    forceRefresh?: boolean;
    allowProvider?: boolean;
}

export interface EnsureAssetResult {
    filePath: string;
    source: 'local' | 'provider' | 'default';
}

function assertStringContent(content: unknown, label: string): asserts content is string {
    if (typeof content !== 'string') {
        throw new Error(`${label} must be a string`);
    }
}

function getAssetConfig(key: AssetKey) {
    return useConfig().data.assets[key];
}

function writeTextFileAtomically(filePath: string, content: string): void {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });

    const tempFilePath = path.join(
        directory,
        `${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random()
            .toString(16)
            .slice(2)}.tmp`
    );

    fs.writeFileSync(tempFilePath, content, 'utf8');
    try {
        fs.renameSync(tempFilePath, filePath);
    } catch {
        fs.writeFileSync(filePath, content, 'utf8');
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}

export function getAssetFilePath(key: AssetKey): string {
    const file = getAssetConfig(key).file;
    return path.resolve(file);
}

export function readAssetText(key: AssetKey): string {
    const filePath = getAssetFilePath(key);
    return fs.readFileSync(filePath, 'utf8');
}

export function writeAssetText(key: AssetKey, content: string): void {
    assertStringContent(content, 'content');
    const filePath = getAssetFilePath(key);
    writeTextFileAtomically(filePath, content);
}

export async function ensureAssetFile(
    key: AssetKey,
    options: EnsureAssetOptions
): Promise<EnsureAssetResult> {
    assertStringContent(options.defaultContent, 'defaultContent');

    const { forceRefresh = false, allowProvider = true, defaultContent } = options;
    const config = getAssetConfig(key);
    const filePath = getAssetFilePath(key);

    if (!forceRefresh && fs.existsSync(filePath)) {
        return {
            filePath,
            source: 'local'
        };
    }

    if (allowProvider && config.provider) {
        try {
            const response = await fetch(config.provider, {
                method: 'GET'
            });
            if (response.ok) {
                const content = await response.text();
                writeTextFileAtomically(filePath, content);
                logger.info(
                    `[data-assets] ensured key=${key} source=provider file=${filePath} provider=${config.provider}`
                );
                return {
                    filePath,
                    source: 'provider'
                };
            }

            logger.warn(
                `[data-assets] provider_failed key=${key} file=${filePath} provider=${config.provider} status=${response.status}`
            );
        } catch (error) {
            const message =
                error instanceof Error ? `${error.name}: ${error.message}` : String(error);
            logger.warn(
                `[data-assets] provider_failed key=${key} file=${filePath} provider=${config.provider} error=${message}`
            );
        }
    }

    writeTextFileAtomically(filePath, defaultContent);
    logger.warn(
        `[data-assets] ensured key=${key} source=default file=${filePath}`
    );
    return {
        filePath,
        source: 'default'
    };
}
