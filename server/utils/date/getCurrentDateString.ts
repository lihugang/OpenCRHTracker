import { SHANGHAI_OFFSET_MS } from './shanghaiDateTime';

export default function getCurrentDateString() {
    const shanghaiNow = new Date(Date.now() + SHANGHAI_OFFSET_MS);
    const yearString = shanghaiNow.getUTCFullYear().toString();
    const monthString = (shanghaiNow.getUTCMonth() + 1) /* month index */
        .toString()
        .padStart(2, '0');
    const dateString = shanghaiNow.getUTCDate().toString().padStart(2, '0');
    return `${yearString}${monthString}${dateString}`;
}
