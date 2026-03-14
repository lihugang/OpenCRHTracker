interface AuthRateLimitRecord {
    count: number;
    windowStartedAt: number;
}

interface AuthRateLimitStore {
    records: Map<string, AuthRateLimitRecord>;
}

interface GlobalWithAuthRateLimitStore {
    __openCrhAuthRateLimitStore?: AuthRateLimitStore;
}

export default function getAuthRateLimitStore() {
    const globalScope = globalThis as GlobalWithAuthRateLimitStore;
    if (!globalScope.__openCrhAuthRateLimitStore) {
        globalScope.__openCrhAuthRateLimitStore = {
            records: new Map()
        };
    }

    return globalScope.__openCrhAuthRateLimitStore;
}
