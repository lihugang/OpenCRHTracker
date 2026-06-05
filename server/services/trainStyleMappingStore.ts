import fs from 'fs';
import getLogger from '~/server/libs/log4js';
import {
    ensureAssetFile,
    getAssetFilePath
} from '~/server/utils/dataAssets/store';

export interface TrainStyleMappingAssets {
    mappings: Map<string, string>;
}

const logger = getLogger('train-style-mapping-store');
let cached: TrainStyleMappingAssets | null = null;

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(`Invalid train style mapping config: ${message}`);
    }
}

function parseTrainStyleMappingAssetText(
    text: string
): TrainStyleMappingAssets {
    const raw = JSON.parse(text) as unknown;
    assert(
        typeof raw === 'object' && raw !== null && !Array.isArray(raw),
        'root must be an object'
    );

    const mappings = new Map<string, string>();
    for (const [rawKey, rawValue] of Object.entries(
        raw as Record<string, unknown>
    )) {
        if (rawKey === '$schema') {
            continue;
        }

        assert(rawKey.trim().length > 0, 'mapping key must be non-empty');
        assert(
            typeof rawValue === 'string',
            `mapping value for ${rawKey} must be a string`
        );

        const normalizedKey = rawKey.trim();
        const normalizedValue = rawValue.trim();
        assert(
            normalizedValue.length > 0,
            `mapping value for ${rawKey} must be non-empty`
        );

        if (mappings.has(normalizedKey)) {
            logger.warn(
                `duplicate_train_style_mapping key=${normalizedKey} strategy=first_record`
            );
            continue;
        }

        mappings.set(normalizedKey, normalizedValue);
    }

    return { mappings };
}

export function validateTrainStyleMappingText(text: string): void {
    assert(text.trim().length > 0, 'asset content must not be empty');
    parseTrainStyleMappingAssetText(text);
}

export async function loadTrainStyleMapping(): Promise<TrainStyleMappingAssets> {
    if (cached) {
        return cached;
    }

    const asset = await ensureAssetFile('trainStyleMapping', {
        defaultContent:
            '{\n    "$schema": "../assets/json/trainStyleMappingScheme.json"\n}\n',
        allowProvider: true,
        validateContent: validateTrainStyleMappingText
    });
    const text = fs.readFileSync(asset.filePath, 'utf8');
    cached = parseTrainStyleMappingAssetText(text);
    return cached;
}

export function preloadTrainStyleMappingFromLocalFile(): TrainStyleMappingAssets {
    const filePath = getAssetFilePath('trainStyleMapping');
    const text = fs.readFileSync(filePath, 'utf8');

    validateTrainStyleMappingText(text);
    cached = parseTrainStyleMappingAssetText(text);
    return cached;
}

export async function reloadTrainStyleMapping(): Promise<TrainStyleMappingAssets> {
    invalidateTrainStyleMappingCache();
    return await loadTrainStyleMapping();
}

export function invalidateTrainStyleMappingCache(): void {
    cached = null;
}
