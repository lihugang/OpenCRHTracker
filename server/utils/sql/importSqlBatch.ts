import fs from 'fs';
import path from 'path';

const cache = new Map<string, Record<string, string>>();

/**
 * Load all .sql files from assets/sql/<dir>, sorted by filename.
 * The returned object uses filename (without .sql) as key.
 */
export default function importSqlBatch(dir: string) {
    const baseDir = path.resolve(process.cwd(), 'assets', 'sql', dir);
    const cached = cache.get(baseDir);
    if (cached) {
        return cached;
    }

    if (!fs.existsSync(baseDir)) {
        throw new Error(`SQL directory not found: ${baseDir}`);
    }

    const files = fs
        .readdirSync(baseDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));

    const statements: Record<string, string> = {};
    for (const file of files) {
        const filePath = path.join(baseDir, file);
        const key = path.basename(file, '.sql');
        statements[key] = fs.readFileSync(filePath, 'utf8').trim();
    }

    cache.set(baseDir, statements);
    return statements;
}
