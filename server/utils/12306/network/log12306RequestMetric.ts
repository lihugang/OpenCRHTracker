import getLogger from '~/server/libs/log4js';

interface Log12306RequestMetricOptions {
    operation: string;
    type: 'query' | 'search';
    url: string;
    context?: Record<string, unknown>;
}

const logger = getLogger('12306-network:request-metric');

function appendField(parts: string[], key: string, value: unknown): void {
    if (typeof value === 'undefined' || value === null || value === '') {
        return;
    }

    const normalizedValue = String(value).replace(/\s+/g, '_').trim();
    if (normalizedValue.length === 0) {
        return;
    }

    parts.push(`${key}=${normalizedValue}`);
}

export default function log12306RequestMetric(
    options: Log12306RequestMetricOptions
): void {
    const parts = ['request'];

    appendField(parts, 'operation', options.operation);
    appendField(parts, 'type', options.type);
    appendField(parts, 'url', options.url);

    if (options.context) {
        for (const [key, value] of Object.entries(options.context)) {
            appendField(parts, key, value);
        }
    }

    logger.info(parts.join(' '));
}
