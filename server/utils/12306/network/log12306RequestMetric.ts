import { record12306RequestMetric } from '~/server/services/requestMetrics12306Store';

interface Log12306RequestMetricOptions {
    operation: string;
    type: 'query' | 'search';
    url: string;
    context?: Record<string, unknown>;
}

export default function log12306RequestMetric(
    options: Log12306RequestMetricOptions
): void {
    record12306RequestMetric({
        operation: options.operation
    });
}
