import float2int from '@/server/utils/numeric/float2int';

/**
 * @description YYYYMMDD -> second timestamp
 * */
export default function parseDateAsTimestamp(date: string) {
    return float2int(
        new Date(
            parseInt(date.slice(0, 4)),
            parseInt(date.slice(4, 6)) - 1, // month index
            parseInt(date.slice(6, 8))
        ).getTime() / 1000 // ms -> s
    );
}
