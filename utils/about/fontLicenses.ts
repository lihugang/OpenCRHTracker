import interLicenseText from '~/assets/text/licenses/inter-ofl.txt?raw';
import jetBrainsMonoLicenseText from '~/assets/text/licenses/jetbrains-mono-ofl.txt?raw';
import sourceHanSansScLicenseText from '~/assets/text/licenses/source-han-sans-sc-ofl.txt?raw';
import type {
    AboutFontLicenseDefinition,
    AboutFontLicenseName
} from '~/types/about';

export const aboutFontLicenseNames: AboutFontLicenseName[] = [
    'Inter',
    'JetBrains Mono',
    'Source Han Sans SC'
];

export const aboutFontLicenses: Record<
    AboutFontLicenseName,
    AboutFontLicenseDefinition
> = {
    Inter: {
        name: 'Inter',
        licenseText: interLicenseText
    },
    'JetBrains Mono': {
        name: 'JetBrains Mono',
        licenseText: jetBrainsMonoLicenseText
    },
    'Source Han Sans SC': {
        name: 'Source Han Sans SC',
        licenseText: sourceHanSansScLicenseText
    }
};
