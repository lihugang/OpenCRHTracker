import type { ApiKeyUsageStoreContainer } from '~/server/utils/api/keyUsage/KeyUsageTypes';

interface GlobalWithApiKeyUsageStore {
    __openCrhApiKeyUsageStore?: ApiKeyUsageStoreContainer;
}

export default function getApiKeyUsageStore() {
    const globalScope = globalThis as GlobalWithApiKeyUsageStore;
    if (!globalScope.__openCrhApiKeyUsageStore) {
        globalScope.__openCrhApiKeyUsageStore = {
            byKeyId: new Map()
        };
    }

    return globalScope.__openCrhApiKeyUsageStore;
}
