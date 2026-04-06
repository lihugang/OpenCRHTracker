import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const scriptPaths = [
    resolve(scriptDir, 'write-commit-id.mjs'),
    resolve(scriptDir, 'write-route-template-manifest.mjs')
];

for (const scriptPath of scriptPaths) {
    execFileSync(process.execPath, [scriptPath], {
        stdio: 'inherit'
    });
}
