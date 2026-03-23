import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import getDayTimestampRange from '~/server/utils/date/getDayTimestampRange';
import type {
    Admin12306RequestBucket,
    AdminPassiveAlertItem,
    AdminPassiveAlertsResponse
} from '~/types/admin';

const ALERT_LINE_PATTERN =
    /^\[(?<timestamp>[^\]]+)\] \[(?<level>[A-Z]+)\] (?<logger>[^ ]+) - (?<message>.*)$/;
const REQUEST_BUCKET_SECONDS = 30 * 60;
const REQUEST_BUCKET_COUNT = 48;
const MAX_ALERT_ITEMS = 200;
const REQUEST_METRIC_LOGGER = '12306-network:request-metric';
const REQUEST_METRIC_PREFIX = 'request ';

function toDashedDate(date: string): string {
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function readLogText(date: string): { filePath: string | null; text: string } {
    const baseName = `logs.${toDashedDate(date)}`;
    const logsDirectory = path.resolve('logs');
    const plainPath = path.join(logsDirectory, baseName);

    if (fs.existsSync(plainPath)) {
        return {
            filePath: plainPath,
            text: fs.readFileSync(plainPath, 'utf8')
        };
    }

    const gzipPath = `${plainPath}.gz`;
    if (fs.existsSync(gzipPath)) {
        return {
            filePath: gzipPath,
            text: zlib.gunzipSync(fs.readFileSync(gzipPath)).toString('utf8')
        };
    }

    return {
        filePath: null,
        text: ''
    };
}

function parseTimestampSeconds(rawValue: string): number | null {
    const timestampMs = Date.parse(rawValue);
    if (!Number.isFinite(timestampMs)) {
        return null;
    }

    return Math.floor(timestampMs / 1000);
}

function createRequestBuckets(date: string): Admin12306RequestBucket[] {
    const dayRange = getDayTimestampRange(date);

    return Array.from({ length: REQUEST_BUCKET_COUNT }, (_, index) => {
        const startAt = dayRange.startAt + index * REQUEST_BUCKET_SECONDS;

        return {
            startAt,
            endAt: startAt + REQUEST_BUCKET_SECONDS - 1,
            total: 0,
            byOperation: {}
        };
    });
}

function parseMetricFields(message: string): Record<string, string> {
    const fields: Record<string, string> = {};
    const normalizedMessage = message.startsWith(REQUEST_METRIC_PREFIX)
        ? message.slice(REQUEST_METRIC_PREFIX.length)
        : message;

    for (const part of normalizedMessage.split(/\s+/)) {
        if (!part.includes('=')) {
            continue;
        }

        const separatorIndex = part.indexOf('=');
        const key = part.slice(0, separatorIndex);
        const value = part.slice(separatorIndex + 1);

        if (key && value) {
            fields[key] = value;
        }
    }

    return fields;
}

export function readPassiveAlerts(date: string): AdminPassiveAlertsResponse {
    const { filePath, text } = readLogText(date);
    const requestBuckets = createRequestBuckets(date);
    const allAlerts: AdminPassiveAlertItem[] = [];
    const loggerCounts = new Map<string, number>();
    let warnCount = 0;
    let errorCount = 0;

    if (text.length > 0) {
        const dayRange = getDayTimestampRange(date);

        for (const line of text.split(/\r?\n/)) {
            if (line.length === 0) {
                continue;
            }

            const match = ALERT_LINE_PATTERN.exec(line);
            if (!match?.groups) {
                continue;
            }

            const timestamp = parseTimestampSeconds(match.groups.timestamp);
            if (timestamp === null) {
                continue;
            }

            const level = match.groups.level;
            const logger = match.groups.logger ?? 'unknown';
            const message = match.groups.message ?? '';

            if (level === 'WARN' || level === 'ERROR') {
                if (level === 'WARN') {
                    warnCount += 1;
                } else {
                    errorCount += 1;
                }

                allAlerts.push({
                    timestamp,
                    level: level as AdminPassiveAlertItem['level'],
                    logger,
                    message
                });
                loggerCounts.set(logger, (loggerCounts.get(logger) ?? 0) + 1);
            }

            if (
                level !== 'INFO' ||
                logger !== REQUEST_METRIC_LOGGER ||
                !message.startsWith(REQUEST_METRIC_PREFIX)
            ) {
                continue;
            }

            const bucketIndex = Math.floor(
                (timestamp - dayRange.startAt) / REQUEST_BUCKET_SECONDS
            );

            if (
                bucketIndex < 0 ||
                bucketIndex >= requestBuckets.length ||
                !requestBuckets[bucketIndex]
            ) {
                continue;
            }

            const metricFields = parseMetricFields(message);
            const operation = metricFields.operation ?? 'unknown';
            const bucket = requestBuckets[bucketIndex]!;

            bucket.total += 1;
            bucket.byOperation[operation] =
                (bucket.byOperation[operation] ?? 0) + 1;
        }
    }

    allAlerts.sort((left, right) => right.timestamp - left.timestamp);

    return {
        date,
        logFile: filePath,
        total: warnCount + errorCount,
        warnCount,
        errorCount,
        topLoggers: Array.from(loggerCounts.entries())
            .map(([logger, count]) => ({
                logger,
                count
            }))
            .sort((left, right) => right.count - left.count)
            .slice(0, 8),
        truncated: allAlerts.length > MAX_ALERT_ITEMS,
        requestBuckets,
        items: allAlerts.slice(0, MAX_ALERT_ITEMS)
    };
}
