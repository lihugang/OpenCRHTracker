import { getShanghaiDayStartUnixSeconds } from './shanghaiDateTime';

/**
 * @description YYYYMMDD -> second timestamp at 00:00:00 Asia/Shanghai
 * */
export default function parseDateAsTimestamp(date: string) {
    return getShanghaiDayStartUnixSeconds(date);
}
