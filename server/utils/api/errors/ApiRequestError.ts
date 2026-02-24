export default class ApiRequestError extends Error {
    statusCode: number;
    errorCode: string;
    userMessage: string;
    retryAfter?: number;

    constructor(
        statusCode: number,
        errorCode: string,
        userMessage: string,
        retryAfter?: number
    ) {
        super(`${errorCode}: ${userMessage}`);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.userMessage = userMessage;
        this.retryAfter = retryAfter;
    }
}
