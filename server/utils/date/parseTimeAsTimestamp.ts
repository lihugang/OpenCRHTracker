/**
 * @description HHMM -> second timestamp since 00:00
 */
export default function parseTimeAsTimestamp(time: string) {
    const hours = parseInt(time.slice(0, 2));
    const minutes = parseInt(time.slice(2, 4));
    return hours * 60 * 60 + minutes * 60;
}
