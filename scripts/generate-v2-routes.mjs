#!/usr/bin/env node

// Generates the 100 thin /api/v2 route files from the authoritative
// operation index (docs/api-v2-operation-index.md).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);
const indexPath = path.join(repoRoot, 'docs/api-v2-operation-index.md');
const indexText = fs.readFileSync(indexPath, 'utf8');

const rows = [];
for (const line of indexText.split('\n')) {
    if (!line.startsWith('|') || line.includes('---') || line.includes('Method')) {
        continue;
    }
    const parts = line.split('|').map((part) => part.trim().replace(/`/g, ''));
    const method = parts[1];
    const apiPath = parts[2];
    const operation = parts[3];
    if (!method || !apiPath || !operation) {
        continue;
    }
    rows.push({ method, apiPath, operation });
}

if (rows.length !== 100) {
    throw new Error(`expected 100 operations, got ${rows.length}`);
}

const methodSuffix = {
    GET: 'get',
    POST: 'post',
    PUT: 'put',
    PATCH: 'patch',
    DELETE: 'delete'
};

let generated = 0;
for (const { method, apiPath, operation } of rows) {
    const relative = apiPath.replace(/^\/api\/v2\//, '');
    const segments = relative.split('/');
    const fileName = `${segments.at(-1)}.${methodSuffix[method]}.ts`;
    const dirPath = path.join(
        repoRoot,
        'server/api/v2',
        ...segments.slice(0, -1)
    );
    const filePath = path.join(dirPath, fileName);

    fs.mkdirSync(dirPath, { recursive: true });
    const content = [
        "import { defineEventHandler } from 'h3';",
        "import executeV2Operation from '~/server/utils/api/v2/executeV2Operation';",
        '',
        'export default defineEventHandler((event) => {',
        `    return executeV2Operation(event, '${operation}');`,
        '});',
        ''
    ].join('\n');

    fs.writeFileSync(filePath, content, 'utf8');
    generated += 1;
}

console.log(`generated ${generated} route files`);
