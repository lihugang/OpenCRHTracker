function isWhitespaceOrSemicolon(char: string) {
    return char === ';' || /\s/.test(char);
}

export default function parseJsonpToJson<T = unknown>(
    jsonp: string,
    expectedCallbackName?: string
): T {
    const input = jsonp.trim();
    const openParenIndex = input.indexOf('(');

    if (openParenIndex <= 0) {
        throw new Error('Invalid JSONP: missing callback wrapper.');
    }

    const callbackName = input.slice(0, openParenIndex).trim()
        .replace(/\/\*.*?\*\//g, ''); // remove javascript notes

    if (!callbackName) {
        throw new Error('Invalid JSONP: empty callback name.');
    }

    if (
        typeof expectedCallbackName === 'string' &&
        callbackName !== expectedCallbackName
    ) {
        throw new Error(
            `Invalid JSONP: callback name mismatch (expected "${expectedCallbackName}", got "${callbackName}").`
        );
    }

    let cursor = openParenIndex + 1;
    let depth = 1;
    let inString = false;
    let escaped = false;

    while (cursor < input.length) {
        const char = input[cursor];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
        } else if (char === '"') {
            inString = true;
        } else if (char === '(') {
            depth += 1;
        } else if (char === ')') {
            depth -= 1;
            if (depth === 0) {
                break;
            }
        }

        cursor += 1;
    }

    if (depth !== 0) {
        throw new Error('Invalid JSONP: unbalanced parentheses.');
    }

    const payload = input.slice(openParenIndex + 1, cursor).trim();
    if (!payload) {
        throw new Error('Invalid JSONP: empty payload.');
    }

    const tail = input.slice(cursor + 1);
    for (const char of tail) {
        if (!isWhitespaceOrSemicolon(char)) {
            throw new Error('Invalid JSONP: unexpected trailing content.');
        }
    }

    try {
        return JSON.parse(payload) as T;
    } catch {
        throw new Error('Invalid JSONP: payload is not valid JSON.');
    }
}
