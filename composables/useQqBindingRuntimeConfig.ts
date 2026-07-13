import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import type { AboutExposedConfigData } from '~/types/about';
import type { TrackerApiResponse } from '~/types/homepage';

const DEFAULT_QQ_BINDING_RUNTIME_CONFIG = {
    enabled: false,
    codeTtlSeconds: 1800,
    sendIntervalSeconds: 120
} as const;

export default function useQqBindingRuntimeConfig() {
    const requestFetch: TrackedRequestFetch = import.meta.server
        ? useTrackedRequestFetch()
        : ($fetch as TrackedRequestFetch);

    return useAsyncData(
        'qq-binding-runtime-config',
        async () => {
            try {
                const response = await requestFetch<
                    TrackerApiResponse<AboutExposedConfigData>
                >('/api/v1/exposed-config', { retry: 0 });

                if (!response.ok) {
                    return DEFAULT_QQ_BINDING_RUNTIME_CONFIG;
                }

                return response.data.qqBinding;
            } catch {
                return DEFAULT_QQ_BINDING_RUNTIME_CONFIG;
            }
        },
        {
            default: () => DEFAULT_QQ_BINDING_RUNTIME_CONFIG
        }
    );
}
