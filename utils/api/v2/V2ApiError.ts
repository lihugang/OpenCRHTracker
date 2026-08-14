export class V2ApiError extends Error {
    readonly operation: string;
    readonly status: number | null;
    readonly code: string;
    readonly userMessage: string;

    constructor(
        operation: string,
        status: number | null,
        code: string,
        userMessage: string,
        options?: { cause?: unknown }
    ) {
        super(userMessage, options);
        this.name = 'V2ApiError';
        this.operation = operation;
        this.status = status;
        this.code = code;
        this.userMessage = userMessage;
    }
}
