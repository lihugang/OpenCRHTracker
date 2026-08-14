#!/usr/bin/env node

// Static completeness check for the client-safe v2 operation registry.
// It parses only client-safe registry files and never imports server code.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);
const registryDir = path.join(repoRoot, 'shared/api/v2/registry');
const expectedOperationCount = 99;

const entries = [];
for (const fileName of fs.readdirSync(registryDir).sort()) {
    if (!fileName.endsWith('.ts') || fileName === 'index.ts') {
        continue;
    }

    const fileText = fs.readFileSync(
        path.join(registryDir, fileName),
        'utf8'
    );
    const entryPattern =
        /operationName:\s*'([^']+)',\s*method:\s*'([A-Z]+)',\s*pathTemplate:\s*'([^']+)'/g;
    for (const match of fileText.matchAll(entryPattern)) {
        entries.push({
            operationName: match[1],
            method: match[2],
            pathTemplate: match[3]
        });
    }
}

const names = new Set(entries.map((entry) => entry.operationName));
const methodPathPairs = new Set(
    entries.map((entry) => `${entry.method} ${entry.pathTemplate}`)
);

if (entries.length !== expectedOperationCount) {
    throw new Error(
        `expected ${expectedOperationCount} client registry entries, got ${entries.length}`
    );
}
if (names.size !== expectedOperationCount) {
    throw new Error('client registry operation names are not unique');
}
if (methodPathPairs.size !== expectedOperationCount) {
    throw new Error('client registry method/path pairs are not unique');
}

console.log(`client registry OK (${entries.length} operations)`);
