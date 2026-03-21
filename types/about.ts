import type { DocsApiRuntimeConfig } from '~/types/docs';

export interface AboutExposedConfigData {
    about: {
        schedulerPollIntervalMs: number;
        schedulerPollIntervalMinutes: number;
    };
    api: DocsApiRuntimeConfig;
}
