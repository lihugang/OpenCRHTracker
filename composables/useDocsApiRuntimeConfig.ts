import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import type { AboutExposedConfigData } from '~/types/about';
import type { TrackerApiResponse } from '~/types/homepage';
import { DEFAULT_DOCS_API_RUNTIME_CONFIG } from '~/utils/docs/apiDocs';

export default function useDocsApiRuntimeConfig() {
    const requestFetch: TrackedRequestFetch = import.meta.server
        ? useTrackedRequestFetch()
        : ($fetch as TrackedRequestFetch);

    return useAsyncData(
        'docs-api-runtime-config',
        async () => {
            try {
                const response = await requestFetch<
                    TrackerApiResponse<AboutExposedConfigData>
                >('/api/v1/exposed-config', {
                    retry: 0
                });

                if (!response.ok) {
                    return DEFAULT_DOCS_API_RUNTIME_CONFIG;
                }

                return response.data.api;
            } catch {
                return DEFAULT_DOCS_API_RUNTIME_CONFIG;
            }
        },
        {
            default: () => DEFAULT_DOCS_API_RUNTIME_CONFIG
        }
    );
}
