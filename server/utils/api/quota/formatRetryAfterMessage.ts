export default function formatRetryAfterMessage(retryAfter?: number): string {
    if (retryAfter === undefined) {
        return '请求额度不足，请稍后重试';
    }

    const totalSeconds = Math.max(1, Math.floor(retryAfter));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const duration =
        minutes > 0 ? `${minutes} 分钟 ${seconds} 秒` : ` ${seconds} 秒`;

    return `请求额度不足，请在 ${duration} 后重试`;
}
