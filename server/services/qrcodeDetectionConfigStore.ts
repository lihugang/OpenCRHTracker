import fs from 'fs';
import {
    buildProbeAssetKey,
    loadProbeAssets
} from '~/server/services/probeAssetStore';
import useConfig from '~/server/config';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';
import { parseDailyTimeHHmm } from '~/server/utils/date/shanghaiDateTime';

export interface QrcodeDetectionConfig {
    detectedAt: string[];
    emu: string[];
}

export interface QrcodeDetectionConfigLoadResult {
    config: QrcodeDetectionConfig;
    missingQrcodeMappings: string[];
}

interface RawQrcodeDetectionConfig {
    detectedAt?: unknown;
    emu?: unknown;
}

let cached: QrcodeDetectionConfig | null = null;

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(`Invalid qrcode detection config: ${message}`);
    }
}

function asObject(value: unknown, name: string): Record<string, unknown> {
    assert(
        typeof value === 'object' && value !== null && !Array.isArray(value),
        `${name} must be an object`
    );
    return value as Record<string, unknown>;
}

function asArray(value: unknown, name: string): Array<unknown> {
    assert(Array.isArray(value), `${name} must be an array`);
    return value;
}

function parseDetectedAt(value: unknown): string[] {
    const detectedAt = asArray(value, 'detectedAt');
    assert(detectedAt.length > 0, 'detectedAt must not be empty');

    const deduped = new Set<string>();
    const result: string[] = [];
    for (const [index, item] of detectedAt.entries()) {
        assert(
            typeof item === 'string',
            `detectedAt[${index}] must be a string`
        );
        const normalized = item.trim();
        assert(normalized.length > 0, `detectedAt[${index}] must be non-empty`);
        try {
            parseDailyTimeHHmm(normalized);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            assert(false, `detectedAt[${index}] is invalid: ${message}`);
        }
        assert(
            !deduped.has(normalized),
            `detectedAt[${index}] is duplicated: ${normalized}`
        );
        deduped.add(normalized);
        result.push(normalized);
    }

    result.sort((left, right) => left.localeCompare(right));
    return result;
}

function parseEmuList(value: unknown): string[] {
    const emuList = asArray(value, 'emu');
    assert(emuList.length > 0, 'emu must not be empty');

    const deduped = new Set<string>();
    const result: string[] = [];
    for (const [index, item] of emuList.entries()) {
        assert(typeof item === 'string', `emu[${index}] must be a string`);
        const normalized = normalizeCode(item);
        assert(normalized.length > 0, `emu[${index}] must be non-empty`);
        assert(
            !deduped.has(normalized),
            `emu[${index}] is duplicated: ${normalized}`
        );
        deduped.add(normalized);
        result.push(normalized);
    }

    result.sort((left, right) => left.localeCompare(right));
    return result;
}

async function assertEmuMappings(emuCodes: string[]): Promise<string[]> {
    const assets = await loadProbeAssets();
    const missingQrcodeMappings: string[] = [];

    for (const emuCode of emuCodes) {
        const parsedEmuCode = parseEmuCode(emuCode);
        assert(
            parsedEmuCode?.trainSetNo,
            `emu ${emuCode} is not a valid EMU code`
        );

        const key = buildProbeAssetKey(
            parsedEmuCode.model,
            parsedEmuCode.trainSetNo
        );
        assert(
            assets.emuByModelAndTrainSetNo.has(key),
            `emu ${emuCode} does not exist in EMUList`
        );

        if (!assets.qrcodeByModelAndTrainSetNo.has(key)) {
            missingQrcodeMappings.push(emuCode);
        }
    }

    return missingQrcodeMappings;
}

async function validateQrcodeDetectionConfig(
    raw: unknown
): Promise<QrcodeDetectionConfigLoadResult> {
    const root = asObject(raw, 'root') as RawQrcodeDetectionConfig;
    const config: QrcodeDetectionConfig = {
        detectedAt: parseDetectedAt(root.detectedAt),
        emu: parseEmuList(root.emu)
    };

    return {
        config,
        missingQrcodeMappings: await assertEmuMappings(config.emu)
    };
}

export function formatQrcodeDetectionMissingMappingsWarning(
    missingQrcodeMappings: readonly string[]
): string {
    if (missingQrcodeMappings.length === 0) {
        return '';
    }

    const samples = missingQrcodeMappings.slice(0, 3).join(', ');
    const sampleSuffix =
        missingQrcodeMappings.length > 3 ? `${samples} etc. ` : samples;
    return `${missingQrcodeMappings.length} train qrcode missing. Samples: ${sampleSuffix}`;
}

export function getQrcodeDetectionConfigPath(): string {
    return useConfig().data.assets.qrcodeDetection.file;
}

export async function validateQrcodeDetectionConfigText(
    text: string
): Promise<QrcodeDetectionConfigLoadResult> {
    const raw = JSON.parse(text) as unknown;
    return await validateQrcodeDetectionConfig(raw);
}

export async function reloadQrcodeDetectionConfig(): Promise<QrcodeDetectionConfigLoadResult> {
    const filePath = getQrcodeDetectionConfigPath();
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    const nextResult = await validateQrcodeDetectionConfig(raw);
    cached = nextResult.config;
    return nextResult;
}

export async function loadQrcodeDetectionConfig(): Promise<QrcodeDetectionConfig> {
    if (cached) {
        return cached;
    }

    return (await reloadQrcodeDetectionConfig()).config;
}

export function invalidateQrcodeDetectionConfigCache(): void {
    cached = null;
}
