#!/usr/bin/env node

// Generates the 99 thin /api/v2 route files from the authoritative
// operation names and manifest entries. The client-safe registry and the
// route generator share this source of truth so they cannot drift.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);
const operationNamesPath = path.join(
    repoRoot,
    'server/utils/api/v2/operationNames.ts'
);
const manifestDir = path.join(repoRoot, 'server/utils/api/v2/manifestEntries');
const operationNamesText = fs.readFileSync(operationNamesPath, 'utf8');

const operationNames = [];
for (const line of operationNamesText.split('\n')) {
    const match = line.match(/^\s*'([A-Za-z0-9]+)',?\s*$/);
    if (match) {
        operationNames.push(match[1]);
    }
}

const entries = new Map();
for (const fileName of fs.readdirSync(manifestDir)) {
    if (!fileName.endsWith('.ts')) {
        continue;
    }

    const fileText = fs.readFileSync(path.join(manifestDir, fileName), 'utf8');
    const blockPattern =
        /operationName:\s*'([A-Za-z0-9]+)'[\s\S]*?method:\s*'([A-Z]+)'[\s\S]*?pathTemplate:\s*'([^']+)'/g;
    for (const match of fileText.matchAll(blockPattern)) {
        entries.set(match[1], {
            method: match[2],
            pathTemplate: match[3]
        });
    }
}

const missingOperations = operationNames.filter((name) => !entries.has(name));
if (missingOperations.length > 0) {
    throw new Error(
        `missing manifest entries for operations: ${missingOperations.join(', ')}`
    );
}

if (operationNames.length !== 99) {
    throw new Error(`expected 99 operations, got ${operationNames.length}`);
}

const methodSuffix = {
    GET: 'get',
    POST: 'post',
    PUT: 'put',
    PATCH: 'patch',
    DELETE: 'delete'
};

let generated = 0;
for (const operation of operationNames) {
    const { method, pathTemplate } = entries.get(operation);
    const relative = pathTemplate
        .replace(/^\/api\/v2\//, '')
        .replace(/:([A-Za-z0-9_]+)/g, '[$1]');
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
