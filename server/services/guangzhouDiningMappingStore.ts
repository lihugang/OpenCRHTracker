import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';

export interface GuangzhouDiningMappingAssets {
    mappings: Map<string, string>;
}

const logger = getLogger('guangzhou-dining-mapping-store');
let cached: GuangzhouDiningMappingAssets | null = null;

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(`Invalid Guangzhou dining mapping: ${message}`);
    }
}

function normalizeTrainUuid(trainUuid: string): string {
    return trainUuid.trim().toLowerCase();
}

export function getGuangzhouDiningMappingFilePath(): string {
    return path.resolve(useConfig().data.assets.guangzhouDiningMapping.file);
}

export function parseGuangzhouDiningMappingText(
    text: string
): GuangzhouDiningMappingAssets {
    const raw = JSON.parse(text) as unknown;
    assert(
        typeof raw === 'object' && raw !== null && !Array.isArray(raw),
        'root must be an object'
    );

    const mappings = new Map<string, string>();
    for (const [rawUuid, rawEmuCode] of Object.entries(
        raw as Record<string, unknown>
    )) {
        const trainUuid = normalizeTrainUuid(rawUuid);
        assert(trainUuid.length > 0, 'mapping UUID must be non-empty');
        assert(
            typeof rawEmuCode === 'string',
            `mapping value for ${rawUuid} must be a string`
        );

        const emuCode = normalizeCode(rawEmuCode);
        assert(
            emuCode.length > 0,
            `mapping value for ${rawUuid} must be non-empty`
        );
        assert(
            parseEmuCode(emuCode) !== null,
            `mapping value for ${rawUuid} must be a valid EMU code`
        );
        assert(
            !mappings.has(trainUuid),
            `mapping UUID ${rawUuid} is duplicated after normalization`
        );

        mappings.set(trainUuid, emuCode);
    }

    return { mappings };
}

export function validateGuangzhouDiningMappingText(text: string): void {
    parseGuangzhouDiningMappingText(text);
}

function readMappingFromLocalFile(): GuangzhouDiningMappingAssets {
    const filePath = getGuangzhouDiningMappingFilePath();
    const text = fs.readFileSync(filePath, 'utf8');
    return parseGuangzhouDiningMappingText(text);
}

export async function loadGuangzhouDiningMapping(): Promise<GuangzhouDiningMappingAssets> {
    if (cached) {
        return cached;
    }

    const filePath = getGuangzhouDiningMappingFilePath();
    try {
        cached = readMappingFromLocalFile();
        logger.info(`loaded file=${filePath} mappings=${cached.mappings.size}`);
    } catch (error) {
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.warn(
            `load_failed file=${filePath} strategy=empty_mapping error=${message}`
        );
        cached = { mappings: new Map() };
    }

    return cached;
}

export function reloadGuangzhouDiningMappingFromLocalFile(): GuangzhouDiningMappingAssets {
    const next = readMappingFromLocalFile();
    cached = next;
    logger.info(
        `reloaded file=${getGuangzhouDiningMappingFilePath()} mappings=${next.mappings.size}`
    );
    return next;
}

export async function getGuangzhouDiningMappedEmuCode(
    trainUuid: string
): Promise<string | null> {
    const assets = await loadGuangzhouDiningMapping();
    return assets.mappings.get(normalizeTrainUuid(trainUuid)) ?? null;
}

export function invalidateGuangzhouDiningMappingCache(): void {
    cached = null;
}
