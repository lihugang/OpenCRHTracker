import { SHANGHAI_OFFSET_MS } from './shanghaiDateTime';

export function formatShanghaiDateString(nowMs: number) {
    const shanghaiNow = new Date(nowMs + SHANGHAI_OFFSET_MS);
    const yearString = shanghaiNow.getUTCFullYear().toString();
    const monthString = (shanghaiNow.getUTCMonth() + 1) /* month index */
        .toString()
        .padStart(2, '0');
    const dateString = shanghaiNow.getUTCDate().toString().padStart(2, '0');
    return `${yearString}${monthString}${dateString}`;
}

export function getRelativeDateString(offsetDays: number) {
    if (!Number.isInteger(offsetDays)) {
        throw new Error('offsetDays must be an integer');
    }

    return formatShanghaiDateString(
        Date.now() + offsetDays * 24 * 60 * 60 * 1000
    );
}

export default function getCurrentDateString() {
    return formatShanghaiDateString(Date.now());
}
