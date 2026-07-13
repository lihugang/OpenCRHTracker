import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
import {
    getQqBindingData,
    mutateQqBindingData,
    type QqBindingData
} from '~/server/services/userProfileStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';
import { sendResendEmail } from '~/server/services/resendEmailService';

const QQ_NUMBER_PATTERN = /^\d{5,12}$/;
const VERIFICATION_CODE_PATTERN = /^\d{6}$/;
const TEMPLATE_PATH = path.resolve(
    process.cwd(),
    'assets/text/auth/qq-binding-verification-zh_CN.html'
);

function ensureQqBindingEnabled() {
    if (!useConfig().user.qqBinding.enabled) {
        throw new ApiRequestError(
            404,
            'qq_binding_disabled',
            'QQ 绑定功能当前未启用'
        );
    }
}

export function normalizeQqNumber(value: unknown) {
    if (typeof value !== 'string') {
        throw new ApiRequestError(400, 'invalid_param', 'QQ 号必须是字符串');
    }

    const qqNumber = value.trim();
    if (!QQ_NUMBER_PATTERN.test(qqNumber)) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            'QQ 号必须是 5-12 位纯数字'
        );
    }

    return qqNumber;
}

function normalizeVerificationCode(value: unknown) {
    if (typeof value !== 'string' || !VERIFICATION_CODE_PATTERN.test(value)) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            '验证码必须是 6 位纯数字'
        );
    }

    return value;
}

function createVerificationCode() {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function getCodeDigest(userId: string, code: string) {
    return crypto
        .createHmac('sha256', useConfig().user.signKey)
        .update(`${userId}:${code}`)
        .digest('hex');
}

function getRetryAfter(lastSentAt: number, now: number, interval: number) {
    return Math.max(1, lastSentAt + interval - now);
}

function getTemplate() {
    return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

function renderTemplate(values: {
    username: string;
    code: string;
    expiresAt: string;
}) {
    return getTemplate().replace(
        /\{\{(username|code|expiresAt)\}\}/g,
        (_, key: 'username' | 'code' | 'expiresAt') => values[key]
    );
}

function createEmptyPendingBinding(binding: QqBindingData): QqBindingData {
    return {
        ...binding,
        status: binding.qqNumber === null ? 'none' : 'bound',
        pendingQqNumber: null,
        codeDigest: null,
        codeExpiresAt: null
    };
}

export function getQqBindingStatus(userId: string) {
    const enabled = useConfig().user.qqBinding.enabled;
    if (!enabled) {
        return {
            enabled: false,
            bound: false,
            qqNumber: null
        };
    }

    const binding = getQqBindingData(userId);
    return {
        enabled: true,
        bound: binding.qqNumber !== null,
        qqNumber: binding.qqNumber
    };
}

export async function sendQqBindingCode(
    userId: string,
    username: string,
    value: unknown
) {
    ensureQqBindingEnabled();
    const qqNumber = normalizeQqNumber(value);
    const config = useConfig();
    const now = Math.floor(Date.now() / 1000);
    const code = createVerificationCode();
    const codeExpiresAt = now + config.user.qqBinding.codeTtlSeconds;
    const codeDigest = getCodeDigest(userId, code);
    const quotaPolicy = config.api.authRateLimit.qqCode;

    mutateQqBindingData(userId, (binding) => {
        if (binding.qqNumber !== null) {
            throw new ApiRequestError(
                409,
                'qq_already_bound',
                '当前账户已经绑定 QQ 号'
            );
        }

        if (
            binding.lastCodeSentAt !== null &&
            now - binding.lastCodeSentAt <
                config.user.qqBinding.sendIntervalSeconds
        ) {
            const retryAfter = getRetryAfter(
                binding.lastCodeSentAt,
                now,
                config.user.qqBinding.sendIntervalSeconds
            );
            throw new ApiRequestError(
                429,
                'qq_code_send_interval',
                `请在 ${retryAfter} 秒后再发送验证码`,
                retryAfter
            );
        }

        const windowStartedAt =
            binding.sendWindowStartedAt === null ||
            now - binding.sendWindowStartedAt >= quotaPolicy.windowSeconds
                ? now
                : binding.sendWindowStartedAt;
        const sendCount =
            windowStartedAt === now &&
            binding.sendWindowStartedAt !== null &&
            now - binding.sendWindowStartedAt < quotaPolicy.windowSeconds
                ? binding.sendCount
                : 0;

        if (sendCount >= quotaPolicy.maxRequests) {
            const retryAfter = Math.max(
                1,
                windowStartedAt + quotaPolicy.windowSeconds - now
            );
            throw new ApiRequestError(
                429,
                'qq_code_quota_exceeded',
                `验证码发送次数已达上限，请在 ${retryAfter} 秒后重试`,
                retryAfter
            );
        }

        return {
            ...binding,
            status: 'pending',
            pendingQqNumber: qqNumber,
            codeDigest,
            codeExpiresAt,
            lastCodeSentAt: now,
            sendWindowStartedAt: windowStartedAt,
            sendCount: sendCount + 1
        };
    });

    try {
        await sendResendEmail({
            to: `${qqNumber}@qq.com`,
            subject: 'Open CRH Tracker QQ 绑定验证码',
            html: renderTemplate({
                username,
                code,
                expiresAt: formatTrackerTimestamp(codeExpiresAt)
            }),
            idempotencyKey: `qq-binding:${userId}:${codeDigest}`
        });
    } catch (error) {
        mutateQqBindingData(userId, (binding) =>
            binding.codeDigest === codeDigest
                ? createEmptyPendingBinding(binding)
                : binding
        );
        throw error;
    }

    return {
        expiresAt: codeExpiresAt,
        nextSendAt: now + config.user.qqBinding.sendIntervalSeconds
    };
}

export function verifyQqBinding(
    userId: string,
    value: unknown,
    codeValue: unknown
) {
    ensureQqBindingEnabled();
    const qqNumber = normalizeQqNumber(value);
    const code = normalizeVerificationCode(codeValue);
    const now = Math.floor(Date.now() / 1000);
    const codeDigest = getCodeDigest(userId, code);
    let verified = false;

    mutateQqBindingData(userId, (binding) => {
        if (
            binding.pendingQqNumber === null ||
            binding.codeDigest === null ||
            binding.codeExpiresAt === null
        ) {
            return binding;
        }

        if (binding.codeExpiresAt <= now) {
            return createEmptyPendingBinding(binding);
        }

        if (
            binding.pendingQqNumber !== qqNumber ||
            binding.codeDigest !== codeDigest
        ) {
            return binding;
        }

        verified = true;
        return {
            ...createEmptyPendingBinding(binding),
            status: 'bound',
            qqNumber
        };
    });

    if (!verified) {
        throw new ApiRequestError(
            400,
            'invalid_qq_verification_code',
            '验证码错误或已过期'
        );
    }

    return {
        enabled: true,
        bound: true,
        qqNumber
    };
}

export function unbindQq(userId: string) {
    ensureQqBindingEnabled();
    const binding = getQqBindingData(userId);
    if (binding.qqNumber === null) {
        throw new ApiRequestError(409, 'qq_not_bound', '当前账户未绑定 QQ 号');
    }

    const nextBinding = mutateQqBindingData(userId, (current) =>
        createEmptyPendingBinding({
            ...current,
            status: 'none',
            qqNumber: null
        })
    );

    return {
        enabled: true,
        bound: false,
        qqNumber: nextBinding.qqNumber
    };
}
