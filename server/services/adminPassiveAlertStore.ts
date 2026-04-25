import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type {
    AdminPassiveAlertItem,
    AdminPassiveAlertsResponse
} from '~/types/admin';
import { get12306RequestMetricsSnapshot } from '~/server/services/requestMetrics12306Store';

const ALERT_LINE_PATTERN =
    /^\[(?<timestamp>[^\]]+)\] \[(?<level>[A-Z]+)\] (?<logger>[^ ]+) - (?<message>.*)$/;

interface PassiveAlertCursorPoint {
    timestamp: number;
    lineIndex: number;
}

interface ParsedPassiveAlertItem extends AdminPassiveAlertItem {
    lineIndex: number;
}

interface ReadPassiveAlertsOptions {
    date: string;
    type: string;
    limit: number;
    cursor: PassiveAlertCursorPoint | null;
    rawCursor: string;
}

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

function buildAlertId(timestamp: number, lineIndex: number): string {
    return `${timestamp}:${lineIndex}`;
}

function buildCursor(item: ParsedPassiveAlertItem): string {
    return `${item.timestamp}:${item.lineIndex}`;
}

function compareAlertsDescending(
    left: ParsedPassiveAlertItem,
    right: ParsedPassiveAlertItem
) {
    return right.timestamp - left.timestamp || right.lineIndex - left.lineIndex;
}

function isAfterCursor(
    item: ParsedPassiveAlertItem,
    cursor: PassiveAlertCursorPoint
) {
    return (
        item.timestamp < cursor.timestamp ||
        (item.timestamp === cursor.timestamp &&
            item.lineIndex < cursor.lineIndex)
    );
}

export function readPassiveAlerts(
    options: ReadPassiveAlertsOptions
): AdminPassiveAlertsResponse {
    const { date, type, limit, cursor, rawCursor } = options;
    const { filePath, text } = readLogText(date);
    const requestMetrics = get12306RequestMetricsSnapshot(date);
    const allAlerts: ParsedPassiveAlertItem[] = [];
    const loggerCounts = new Map<string, number>();
    let warnCount = 0;
    let errorCount = 0;

    if (text.length > 0) {
        const lines = text.split(/\r?\n/);

        for (const [lineIndex, line] of lines.entries()) {
            if (line.length === 0) {
                continue;
            }

            const match = ALERT_LINE_PATTERN.exec(line);
            if (!match?.groups) {
                continue;
            }

            const rawTimestamp = match.groups.timestamp;
            if (!rawTimestamp) {
                continue;
            }

            const timestamp = parseTimestampSeconds(rawTimestamp);
            if (timestamp === null) {
                continue;
            }

            const level = match.groups.level;
            const logger = match.groups.logger ?? 'unknown';
            const message = match.groups.message ?? '';

            if (level !== 'WARN' && level !== 'ERROR') {
                continue;
            }

            if (level === 'WARN') {
                warnCount += 1;
            } else {
                errorCount += 1;
            }

            allAlerts.push({
                id: buildAlertId(timestamp, lineIndex),
                timestamp,
                level: level as AdminPassiveAlertItem['level'],
                logger,
                message,
                lineIndex
            });
            loggerCounts.set(logger, (loggerCounts.get(logger) ?? 0) + 1);
        }
    }

    allAlerts.sort(compareAlertsDescending);

    const filteredAlerts = type
        ? allAlerts.filter((item) => item.logger === type)
        : allAlerts;
    const cursorFilteredAlerts = cursor
        ? filteredAlerts.filter((item) => isAfterCursor(item, cursor))
        : filteredAlerts;
    const pageItems = cursorFilteredAlerts.slice(0, limit);
    const nextCursor =
        cursorFilteredAlerts.length > limit && pageItems.at(-1)
            ? buildCursor(pageItems.at(-1)!)
            : '';

    return {
        date,
        logFile: filePath,
        cursor: rawCursor,
        nextCursor,
        limit,
        total: warnCount + errorCount,
        filteredTotal: filteredAlerts.length,
        warnCount,
        errorCount,
        topLoggers: Array.from(loggerCounts.entries())
            .map(([logger, count]) => ({
                logger,
                count
            }))
            .sort((left, right) => {
                if (right.count !== left.count) {
                    return right.count - left.count;
                }

                return left.logger.localeCompare(right.logger, 'zh-CN');
            })
            .slice(0, 8),
        typeCounts: Array.from(loggerCounts.entries())
            .map(([typeKey, count]) => ({
                type: typeKey,
                count
            }))
            .sort((left, right) => {
                if (right.count !== left.count) {
                    return right.count - left.count;
                }

                return left.type.localeCompare(right.type, 'zh-CN');
            }),
        requestMetricsEnabled: requestMetrics.requestMetricsEnabled,
        requestMetricsRetentionDays: requestMetrics.requestMetricsRetentionDays,
        requestMetricsRetained: requestMetrics.requestMetricsRetained,
        requestBuckets: requestMetrics.requestBuckets,
        items: pageItems.map(({ lineIndex: _lineIndex, ...item }) => item)
    };
}
