import isPlainJsonObject from './isPlainJsonObject';

export default function parseJsonlToJson<
    T extends Record<string, unknown> = Record<string, unknown>
>(jsonl: string): T[] {
    const input = jsonl.trim();
    if (!input) {
        return [];
    }

    const lines = input.split(/\r?\n/);
    const result: T[] = [];

    for (let index = 0; index < lines.length; index += 1) {
        const lineNumber = index + 1;
        const line = lines[index].trim();

        if (!line) {
            continue;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(line);
        } catch {
            throw new Error(`Invalid JSONL at line ${lineNumber}: not valid JSON.`);
        }

        if (!isPlainJsonObject(parsed)) {
            throw new Error(
                `Invalid JSONL at line ${lineNumber}: expected a JSON object.`
            );
        }

        result.push(parsed as T);
    }

    return result;
}
