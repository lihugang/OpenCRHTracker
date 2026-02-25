import useConfig from '~/server/config';
import sleep from '../time/sleep';

let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

export default function waitFor12306RequestSlot(): Promise<void> {
    const { minIntervalMs } = useConfig().spider.rateLimit;
    if (minIntervalMs <= 0) {
        return Promise.resolve();
    }

    const task = queue.catch(() => undefined).then(async () => {
        const now = Date.now();
        const waitMs = Math.max(0, lastRequestAt + minIntervalMs - now);

        if (waitMs > 0) {
            await sleep(waitMs);
        }

        lastRequestAt = Date.now();
    });

    queue = task;
    return task;
}
