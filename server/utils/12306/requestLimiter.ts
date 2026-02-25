import useConfig, { type Config } from '~/server/config';
import sleep from '../time/sleep';

export type RequestRateLimitType = keyof Config['spider']['rateLimit'];

const lastRequestAtByType: Partial<Record<RequestRateLimitType, number>> = {};
const queueByType: Partial<Record<RequestRateLimitType, Promise<void>>> = {};

export default function waitFor12306RequestSlot(
    type: RequestRateLimitType
): Promise<void> {
    const { minIntervalMs } = useConfig().spider.rateLimit[type];
    if (minIntervalMs <= 0) {
        return Promise.resolve();
    }

    const baseQueue = queueByType[type] ?? Promise.resolve();
    const task = baseQueue.catch(() => undefined).then(async () => {
        const now = Date.now();
        const waitMs = Math.max(
            0,
            (lastRequestAtByType[type] ?? 0) + minIntervalMs - now
        );

        if (waitMs > 0) {
            await sleep(waitMs);
        }

        lastRequestAtByType[type] = Date.now();
    });

    queueByType[type] = task;
    return task;
}
