export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

const usernamePattern = /^[A-Za-z0-9_-]+$/;
const passwordDigestPattern = /^[a-f0-9]{64}$/;

export function validateUsername(username: string) {
    if (username.length < USERNAME_MIN_LENGTH) {
        return `用户名至少需要 ${USERNAME_MIN_LENGTH} 个字符`;
    }

    if (username.length > USERNAME_MAX_LENGTH) {
        return `用户名不能超过 ${USERNAME_MAX_LENGTH} 个字符`;
    }

    if (!usernamePattern.test(username)) {
        return '用户名只能包含字母、数字、下划线和连字符';
    }

    return '';
}

export function validatePassword(password: string) {
    if (password.length < PASSWORD_MIN_LENGTH) {
        return `密码至少需要 ${PASSWORD_MIN_LENGTH} 个字符`;
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
        return `密码不能超过 ${PASSWORD_MAX_LENGTH} 个字符`;
    }

    return '';
}

export function validatePasswordDigest(passwordDigest: string) {
    if (!passwordDigestPattern.test(passwordDigest)) {
        return 'passwordDigest 格式无效';
    }

    return '';
}
