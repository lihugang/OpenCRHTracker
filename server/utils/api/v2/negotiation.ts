import type { V2ResponseCodec, V2TransportFailure } from '~/server/utils/api/v2/V2Types';

interface AcceptEntry {
    type: string;
    subtype: string;
    q: number;
}

function parseAcceptList(
    value: string | null | undefined
): AcceptEntry[] | null {
    if (value === undefined || value === null || value.trim().length === 0) {
        return null;
    }

    const entries: AcceptEntry[] = [];
    for (const part of value.split(',')) {
        const trimmed = part.trim();
        if (trimmed.length === 0) {
            continue;
        }

        const [rawRange, ...params] = trimmed.split(';');
        const [rawType, rawSubtype] =
            (rawRange ?? '').trim().toLowerCase().split('/');
        const type = rawType ?? '*';
        const subtype = rawSubtype ?? '*';
        let q = 1;

        for (const param of params) {
            const [rawKey, rawValue] = param.split('=');
            if (rawKey?.trim().toLowerCase() === 'q') {
                const parsedQ = Number(rawValue?.trim());
                if (Number.isFinite(parsedQ)) {
                    q = parsedQ;
                }
            }
        }

        entries.push({ type, subtype, q });
    }

    return entries.length > 0 ? entries : null;
}

function matchSpecificity(
    entry: AcceptEntry,
    type: string,
    subtype: string
): number {
    if (entry.type === type && entry.subtype === subtype) {
        return 3;
    }
    if (entry.type === type && entry.subtype === '*') {
        return 2;
    }
    if (entry.type === '*' && entry.subtype === '*') {
        return 1;
    }
    return 0;
}

function qualityFor(entries: readonly AcceptEntry[], type: string, subtype: string) {
    let bestSpecificity = 0;
    let bestQuality = 0;

    for (const entry of entries) {
        const specificity = matchSpecificity(entry, type, subtype);
        if (specificity > bestSpecificity) {
            bestSpecificity = specificity;
            bestQuality = entry.q;
        } else if (specificity === bestSpecificity && specificity > 0) {
            bestQuality = Math.max(bestQuality, entry.q);
        }
    }

    return bestQuality;
}

export function negotiateResponseCodec(
    acceptValue: string | null | undefined
): V2ResponseCodec {
    const entries = parseAcceptList(acceptValue);
    if (entries === null) {
        return 'json';
    }

    const jsonQ = qualityFor(entries, 'application', 'json');
    const protobufQ = qualityFor(entries, 'application', 'x-protobuf');

    if (jsonQ <= 0 && protobufQ <= 0) {
        const failure: V2TransportFailure = {
            statusCode: 406,
            errorCode: 'not_acceptable',
            userMessage: 'Accept 不支持 application/json 或 application/x-protobuf'
        };
        throw failure;
    }

    if (protobufQ > jsonQ) {
        return 'protobuf';
    }

    return 'json';
}

export type V2RequestBodyCodec = 'json' | 'protobuf';

export function parseRequestBodyCodec(
    contentTypeValue: string | null | undefined
): V2RequestBodyCodec | null {
    if (contentTypeValue === undefined || contentTypeValue === null) {
        return null;
    }

    const value = Array.isArray(contentTypeValue)
        ? contentTypeValue[0]
        : contentTypeValue;
    const mediaType = value?.split(';')[0]?.trim().toLowerCase() ?? '';

    if (mediaType === 'application/json') {
        return 'json';
    }

    if (mediaType === 'application/x-protobuf') {
        return 'protobuf';
    }

    return null;
}
