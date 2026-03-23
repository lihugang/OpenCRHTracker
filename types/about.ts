import type { DocsApiRuntimeConfig } from '~/types/docs';

export type AboutFontLicenseName =
    | 'Inter'
    | 'JetBrains Mono'
    | 'Source Han Sans SC';

export interface AboutFontLicenseDefinition {
    name: AboutFontLicenseName;
    licenseText: string;
}

export interface AboutExposedConfigData {
    about: {
        schedulerPollIntervalMs: number;
        schedulerPollIntervalMinutes: number;
    };
    api: DocsApiRuntimeConfig;
}
