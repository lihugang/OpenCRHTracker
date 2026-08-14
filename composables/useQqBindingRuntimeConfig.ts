import { fetchExposedConfig } from '~/utils/api/v2/domain/system';

const DEFAULT_QQ_BINDING_RUNTIME_CONFIG = {
    enabled: false,
    codeTtlSeconds: 1800,
    sendIntervalSeconds: 120
} as const;

export default function useQqBindingRuntimeConfig() {
    return useAsyncData(
        'qq-binding-runtime-config',
        async () => {
            try {
                const data = await fetchExposedConfig();
                return data.qqBinding;
            } catch {
                return DEFAULT_QQ_BINDING_RUNTIME_CONFIG;
            }
        },
        {
            default: () => DEFAULT_QQ_BINDING_RUNTIME_CONFIG
        }
    );
}
