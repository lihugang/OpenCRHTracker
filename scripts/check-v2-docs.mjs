#!/usr/bin/env node

// 对生成的 v2 API 文档做静态完整性检查：
// 校验手工元数据覆盖层与操作清单 / protobuf 定义一致，
// 并确认提交的生成文件与当前源码保持一致。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    formatGeneratedJson,
    formatGeneratedTs,
    generateDocs,
    loadTypeScriptModule,
    metadataPath,
    operationNamesPath,
    parseManifestEntries,
    renderGeneratedJson,
    renderGeneratedTs
} from './generate-v2-docs.mjs';

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);
const outputTsPath = path.join(repoRoot, 'utils/docs/generated/openApi.ts');
const outputJsonPath = path.join(repoRoot, 'public/docs/api/openapi.json');

const EXPECTED_ENDPOINT_COUNT = 11;

function parseOperationNames() {
    const text = fs.readFileSync(operationNamesPath, 'utf8');
    const names = new Set();
    for (const line of text.split('\n')) {
        const match = line.match(/^\s*'([A-Za-z0-9]+)',?\s*$/);
        if (match) {
            names.add(match[1]);
        }
    }
    return names;
}

function listPathParams(pathTemplate) {
    return [...pathTemplate.matchAll(/:([A-Za-z0-9_]+)/g)].map(
        (match) => match[1]
    );
}

const failures = [];

function expect(condition, message) {
    if (!condition) {
        failures.push(message);
    }
}

async function main() {
    const metadata = loadTypeScriptModule(metadataPath);
    const endpoints = metadata.V2_DOC_ENDPOINTS;
    const manifests = parseManifestEntries();
    const operationNames = parseOperationNames();

    expect(
        Array.isArray(endpoints) &&
            endpoints.length === EXPECTED_ENDPOINT_COUNT,
        `expected ${EXPECTED_ENDPOINT_COUNT} documented endpoints, got ${endpoints?.length ?? 0}`
    );

    const seenSlugs = new Set();
    const seenOperations = new Set();

    for (const endpoint of endpoints ?? []) {
        expect(
            typeof endpoint.slug === 'string' &&
                /^[a-z0-9-]+$/.test(endpoint.slug),
            `invalid slug: ${String(endpoint.slug)}`
        );
        expect(
            !seenSlugs.has(endpoint.slug),
            `duplicate docs slug: ${endpoint.slug}`
        );
        seenSlugs.add(endpoint.slug);

        expect(
            typeof endpoint.operationName === 'string' &&
                operationNames.has(endpoint.operationName),
            `unknown v2 operation: ${String(endpoint.operationName)}`
        );
        expect(
            !seenOperations.has(endpoint.operationName),
            `duplicate docs operation: ${endpoint.operationName}`
        );
        seenOperations.add(endpoint.operationName);

        const manifest = manifests.get(endpoint.operationName);
        expect(
            manifest !== undefined,
            `missing manifest entry for ${endpoint.operationName}`
        );

        if (manifest) {
            const manifestPathParams = listPathParams(manifest.pathTemplate);
            const overlayPathParams = (endpoint.parameters ?? [])
                .filter((parameter) => parameter.in === 'path')
                .map((parameter) => parameter.name)
                .sort();
            const expectedPathParams = [...manifestPathParams].sort();
            expect(
                JSON.stringify(overlayPathParams) ===
                    JSON.stringify(expectedPathParams),
                `${endpoint.slug}: path params mismatch (overlay=${overlayPathParams.join(
                    ','
                )}, manifest=${expectedPathParams.join(',')})`
            );
            expect(
                (manifest.requiredScopes?.length ?? 0) > 0,
                `${endpoint.slug}: missing required scopes in manifest`
            );
        }

        expect(
            Array.isArray(endpoint.examples) && endpoint.examples.length > 0,
            `${endpoint.slug}: needs at least one example`
        );
        expect(
            Array.isArray(endpoint.usageScenarios) &&
                endpoint.usageScenarios.length > 0,
            `${endpoint.slug}: needs at least one usage scenario`
        );
        expect(
            Array.isArray(endpoint.faq) && endpoint.faq.length > 0,
            `${endpoint.slug}: needs at least one FAQ item`
        );
        expect(
            typeof endpoint.successExample === 'object' &&
                endpoint.successExample !== null,
            `${endpoint.slug}: missing success example`
        );
        expect(
            Array.isArray(endpoint.errors) && endpoint.errors.length > 0,
            `${endpoint.slug}: needs at least one error response`
        );
    }

    const generated = generateDocs();
    const expectedTs = await formatGeneratedTs(
        renderGeneratedTs(generated.document)
    );
    const expectedJson = await formatGeneratedJson(
        renderGeneratedJson(generated.document)
    );

    const actualTs = fs.existsSync(outputTsPath)
        ? fs.readFileSync(outputTsPath, 'utf8')
        : null;
    const actualJson = fs.existsSync(outputJsonPath)
        ? fs.readFileSync(outputJsonPath, 'utf8')
        : null;

    expect(
        actualTs === expectedTs,
        `generated TS is out of date; run pnpm docs:generate (${path.relative(
            repoRoot,
            outputTsPath
        )})`
    );
    expect(
        actualJson === expectedJson,
        `generated JSON is out of date; run pnpm docs:generate (${path.relative(
            repoRoot,
            outputJsonPath
        )})`
    );

    if (actualJson !== null) {
        try {
            const parsed = JSON.parse(actualJson);
            expect(
                parsed.openapi === '3.1.0' &&
                    Object.keys(parsed.paths ?? {}).length ===
                        EXPECTED_ENDPOINT_COUNT,
                'openapi.json must be valid OpenAPI 3.1 with 11 paths'
            );
        } catch {
            expect(false, 'openapi.json is not valid JSON');
        }
    }

    if (failures.length > 0) {
        console.error(`v2 docs check failed with ${failures.length} issue(s):`);
        for (const failure of failures) {
            console.error(`- ${failure}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log(
        `v2 docs check passed: ${generated.endpointCount} endpoints, generated files up to date`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
