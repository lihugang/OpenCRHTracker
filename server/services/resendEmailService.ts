import getLogger from '~/server/libs/log4js';
import useConfig, { assertValidEmailAddress } from '~/server/config';

export interface ResendEmailMessage {
    to: string | string[];
    subject: string;
    html: string;
    idempotencyKey?: string;
}

export interface ResendEmailSendResult {
    messageId: string;
}

export class ResendEmailError extends Error {
    readonly statusCode: number | null;
    readonly errorType: string | null;
    readonly responseMessage: string | null;

    constructor(
        message: string,
        options: {
            statusCode?: number | null;
            errorType?: string | null;
            responseMessage?: string | null;
        } = {}
    ) {
        super(message);
        this.name = 'ResendEmailError';
        this.statusCode = options.statusCode ?? null;
        this.errorType = options.errorType ?? null;
        this.responseMessage = options.responseMessage ?? null;
    }
}

interface ResendEmailResponse {
    id?: unknown;
    name?: unknown;
    message?: unknown;
}

const logger = getLogger('resend-email');

function normalizeRecipients(value: string | string[], maxRecipients: number) {
    const values = Array.isArray(value) ? value : [value];
    const recipients: string[] = [];
    const seen = new Set<string>();

    for (const [index, item] of values.entries()) {
        if (typeof item !== 'string') {
            throw new Error(
                `email recipient at index ${index} must be a string`
            );
        }

        const recipient = item.trim();
        if (recipient.length === 0) {
            throw new Error(
                `email recipient at index ${index} must not be empty`
            );
        }

        assertValidEmailAddress(recipient, `email recipient at index ${index}`);

        const key = recipient.toLowerCase();
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        recipients.push(recipient);
    }

    if (recipients.length === 0) {
        throw new Error('at least one email recipient is required');
    }

    if (recipients.length > maxRecipients) {
        throw new Error(
            `email recipient count must not exceed ${maxRecipients}`
        );
    }

    return recipients;
}

function parseResponseBody(value: string): ResendEmailResponse {
    if (value.trim().length === 0) {
        return {};
    }

    try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null) {
            return {};
        }

        return parsed as ResendEmailResponse;
    } catch {
        return {};
    }
}

function getResponseString(value: unknown) {
    return typeof value === 'string' ? value : null;
}

function getFromAddress(
    config: ReturnType<typeof useConfig>['services']['resend']
) {
    if (config.email.fromName.length === 0) {
        return config.email.fromAddress;
    }

    return `${config.email.fromName} <${config.email.fromAddress}>`;
}

function buildRequestBody(
    message: ResendEmailMessage,
    recipients: string[],
    config: ReturnType<typeof useConfig>['services']['resend']
) {
    const body: Record<string, unknown> = {
        from: getFromAddress(config),
        to: recipients,
        subject: message.subject.trim(),
        html: message.html
    };

    if (config.email.replyToAddress.length > 0) {
        body.reply_to = config.email.replyToAddress;
    }

    return body;
}

export async function sendResendEmail(
    message: ResendEmailMessage
): Promise<ResendEmailSendResult> {
    const config = useConfig().services.resend;
    if (
        config.apiKey.length === 0 ||
        config.emailApiUrl.length === 0 ||
        config.requestTimeoutMs <= 0 ||
        config.maxRecipients <= 0 ||
        config.email.fromAddress.length === 0
    ) {
        throw new Error('resend_not_configured');
    }

    if (typeof message.subject !== 'string' || message.subject.trim() === '') {
        throw new Error('email subject must not be empty');
    }
    if (typeof message.html !== 'string' || message.html.length === 0) {
        throw new Error('email html body must not be empty');
    }
    if (
        message.idempotencyKey !== undefined &&
        (typeof message.idempotencyKey !== 'string' ||
            message.idempotencyKey.trim() === '' ||
            message.idempotencyKey.length > 256)
    ) {
        throw new Error(
            'email idempotency key must contain between 1 and 256 characters'
        );
    }

    const recipients = normalizeRecipients(message.to, config.maxRecipients);
    const headers: Record<string, string> = {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
    };
    if (message.idempotencyKey !== undefined) {
        headers['Idempotency-Key'] = message.idempotencyKey.trim();
    }

    const response = await fetch(config.emailApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildRequestBody(message, recipients, config)),
        signal: AbortSignal.timeout(config.requestTimeoutMs)
    });
    const responseBody = parseResponseBody(await response.text());
    const errorType = getResponseString(responseBody.name);
    const responseMessage = getResponseString(responseBody.message);

    if (!response.ok) {
        logger.error(`resend_email_request_failed status=${response.status}`);
        throw new ResendEmailError(
            `resend_email_request_failed:${response.status}`,
            {
                statusCode: response.status,
                errorType,
                responseMessage
            }
        );
    }

    const messageId = getResponseString(responseBody.id) ?? '';
    if (messageId.length === 0) {
        logger.warn('resend_email_not_sent_without_message_id');
        throw new ResendEmailError('resend_email_not_sent', {
            errorType,
            responseMessage
        });
    }

    return { messageId };
}
