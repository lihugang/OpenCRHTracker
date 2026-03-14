type RetryAfterMessageKind =
    | 'auth_login'
    | 'auth_register'
    | 'quota_anonymous'
    | 'quota_user';

function formatRetryAfterDuration(retryAfter?: number) {
    if (retryAfter === undefined) {
        return '稍后';
    }

    const totalSeconds = Math.max(1, Math.floor(retryAfter));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0) {
        return `${minutes} 分 ${seconds} 秒`;
    }

    return `${seconds} 秒`;
}

export default function formatRetryAfterMessage(
    retryAfter?: number,
    kind: RetryAfterMessageKind = 'quota_user'
): string {
    const duration = formatRetryAfterDuration(retryAfter);

    switch (kind) {
        case 'auth_login':
            return `登录操作过于频繁，请在 ${duration} 后重试`;
        case 'auth_register':
            return `注册操作过于频繁，请在 ${duration} 后重试`;
        case 'quota_anonymous':
            return `请求太频繁啦！请在 ${duration} 后重试。登录账号或添加 API Key 后可获得更多请求配额哦~`;
        case 'quota_user':
        default:
            return `API 配额已用尽，请在 ${duration} 后重试。如果默认 API 配额不能满足您的需求，请通过反馈功能申请更多 API 配额哦。`;
    }
}
