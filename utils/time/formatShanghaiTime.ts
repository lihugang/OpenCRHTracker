const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

export default function formatShanghaiTime(timestamp: number) {
    if (!Number.isFinite(timestamp)) {
        return '';
    }

    return timeFormatter.format(new Date(timestamp * 1000));
}
