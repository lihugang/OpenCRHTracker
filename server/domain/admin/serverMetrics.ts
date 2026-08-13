import { getAdminServerMetricsSnapshot } from '~/server/services/adminServerMetricsStore';

export function getAdminServerMetrics() {
    return getAdminServerMetricsSnapshot();
}
