import type { QuotaStoreContainer } from '~/server/utils/api/quota/QuotaTypes';

interface GlobalWithQuotaStore {
    __openCrhQuotaStore?: QuotaStoreContainer;
}

export default function getQuotaStore() {
    const globalScope = globalThis as GlobalWithQuotaStore;
    if (!globalScope.__openCrhQuotaStore) {
        globalScope.__openCrhQuotaStore = {
            buckets: new Map()
        };
    }
    return globalScope.__openCrhQuotaStore;
}
