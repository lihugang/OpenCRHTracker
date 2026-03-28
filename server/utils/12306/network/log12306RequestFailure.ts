import type { Logger } from 'log4js';

interface Log12306RequestFailureOptions {
    logger: Logger;
    operation: string;
    url: string;
    level?: 'warn' | 'debug';
    context?: Record<string, unknown>;
    responseStatus?: number;
    responseOk?: boolean;
    businessStatus?: unknown;
    errorCode?: unknown;
    errorMsg?: unknown;
    errMsg?: unknown;
    detail?: string;
    error?: unknown;
}

function appendField(parts: string[], key: string, value: unknown): void {
    if (typeof value === 'undefined' || value === null || value === '') {
        return;
    }

    const normalizedValue =
        value instanceof Error
            ? `${value.name}: ${value.message}`
            : String(value).replace(/\s+/g, ' ').trim();

    if (normalizedValue.length === 0) {
        return;
    }

    parts.push(`${key}=${normalizedValue}`);
}

export default function log12306RequestFailure(
    options: Log12306RequestFailureOptions
): void {
    const parts = [`operation=${options.operation}`, `url=${options.url}`];

    if (options.context) {
        for (const [key, value] of Object.entries(options.context)) {
            appendField(parts, key, value);
        }
    }

    appendField(parts, 'responseStatus', options.responseStatus);
    appendField(parts, 'responseOk', options.responseOk);
    appendField(parts, 'businessStatus', options.businessStatus);
    appendField(parts, 'errorCode', options.errorCode);
    appendField(parts, 'errorMsg', options.errorMsg);
    appendField(parts, 'errMsg', options.errMsg);
    appendField(parts, 'detail', options.detail);
    appendField(parts, 'error', options.error);

    const level = options.level ?? 'warn';
    options.logger[level](parts.join(' '));
}
