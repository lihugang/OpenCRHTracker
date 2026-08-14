import { fetchExposedConfig } from '~/utils/api/v2/domain/system';
import { DEFAULT_DOCS_API_RUNTIME_CONFIG } from '~/utils/docs/apiDocs';

export default function useDocsApiRuntimeConfig() {
    return useAsyncData(
        'docs-api-runtime-config',
        async () => {
            try {
                const data = await fetchExposedConfig();
                return data.api;
            } catch {
                return DEFAULT_DOCS_API_RUNTIME_CONFIG;
            }
        },
        {
            default: () => DEFAULT_DOCS_API_RUNTIME_CONFIG
        }
    );
}
