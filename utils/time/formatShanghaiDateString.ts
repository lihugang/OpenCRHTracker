const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

export default function formatShanghaiDateString(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '';
    }

    const parts = dateFormatter.formatToParts(new Date(timestamp * 1000));
    const year = parts.find((part) => part.type === 'year')?.value ?? '';
    const month = parts.find((part) => part.type === 'month')?.value ?? '';
    const day = parts.find((part) => part.type === 'day')?.value ?? '';

    return `${year}${month}${day}`;
}
