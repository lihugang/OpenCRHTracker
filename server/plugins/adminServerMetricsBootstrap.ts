import { initializeAdminServerMetricsSampling } from '~/server/services/adminServerMetricsStore';

export default defineNitroPlugin(() => {
    initializeAdminServerMetricsSampling();
});
