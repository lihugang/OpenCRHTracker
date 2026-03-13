const timestampFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

export default function formatTrackerTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp)) {
        return '';
    }

    return timestampFormatter
        .format(new Date(timestamp * 1000))
        .replace(',', '');
}
