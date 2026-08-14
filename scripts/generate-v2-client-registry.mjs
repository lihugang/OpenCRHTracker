#!/usr/bin/env node

// Generates the client-safe v2 operation registry from the server manifest
// entries. The generated registry must never import server-only modules; it
// only imports generated protobuf schemas from #shared.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const manifestDir = path.join(
    repoRoot,
    'server/utils/api/v2/manifestEntries'
);
const outputDir = path.join(repoRoot, 'shared/api/v2/registry');
const GENERATED_MODULE_PREFIX =
    '#shared/generated/proto/opencrh/v2/';

const RAW_CONTENT_TYPES_BY_OPERATION = {
    GetTrainCirculationImage: ['image/png', 'application/pdf'],
    GetDailyExport: ['text/csv']
};

function readSource(filePath) {
    return ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );
}

function extractEntries(source) {
    const imports = new Map();
    for (const statement of source.statements) {
        if (
            !ts.isImportDeclaration(statement) ||
            !ts.isStringLiteral(statement.moduleSpecifier)
        ) {
            continue;
        }

        const moduleSpecifier = statement.moduleSpecifier.text;
        if (!moduleSpecifier.includes('/generated/proto/opencrh/v2/')) {
            continue;
        }

        const namedBindings = statement.importClause?.namedBindings;
        if (!namedBindings || !ts.isNamedImports(namedBindings)) {
            continue;
        }

        for (const element of namedBindings.elements) {
            imports.set(element.name.text, moduleSpecifier);
        }
    }

    const entries = [];
    function visit(node) {
        if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'defineV2Operation'
        ) {
            const argument = node.arguments[0];
            if (!argument || !ts.isObjectLiteralExpression(argument)) {
                return;
            }

            const properties = {};
            for (const property of argument.properties) {
                if (!ts.isPropertyAssignment(property)) {
                    continue;
                }

                const propertyName = property.name.getText(source);
                const initializer = property.initializer;
                if (
                    ts.isStringLiteral(initializer) ||
                    ts.isNoSubstitutionTemplateLiteral(initializer)
                ) {
                    properties[propertyName] = initializer.text;
                    continue;
                }

                if (ts.isIdentifier(initializer)) {
                    properties[propertyName] = initializer.text;
                    continue;
                }

                if (ts.isObjectLiteralExpression(initializer)) {
                    for (const nested of initializer.properties) {
                        if (
                            ts.isPropertyAssignment(nested) &&
                            nested.name.getText(source) === 'kind' &&
                            ts.isStringLiteral(nested.initializer)
                        ) {
                            properties[propertyName] = {
                                kind: nested.initializer.text
                            };
                        }
                    }
                }
            }

            entries.push(properties);
            return;
        }

        ts.forEachChild(node, visit);
    }
    visit(source);

    return { imports, entries };
}

function renderModule(domain, entries, imports) {
    const importedModules = new Map();
    for (const entry of entries) {
        for (const schemaName of ['requestSchema', 'responseSchema']) {
            const moduleSpecifier = imports.get(entry[schemaName]);
            if (!moduleSpecifier) {
                throw new Error(
                    `missing import for ${entry[schemaName]} in ${domain}`
                );
            }

            const relativeName = moduleSpecifier
                .replace(/^.*\/opencrh\/v2\//, '')
                .replace(/\.ts$/, '');
            if (!importedModules.has(relativeName)) {
                importedModules.set(relativeName, new Set());
            }
            importedModules.get(relativeName).add(entry[schemaName]);
        }
    }

    const importLines = [];
    for (const [relativeName, schemaNames] of importedModules) {
        importLines.push(
            `import {\n${[...schemaNames]
                .sort()
                .map((name) => `    ${name}`)
                .join(',\n')}\n} from '${GENERATED_MODULE_PREFIX}${relativeName}';`
        );
    }

    const entryLines = entries.map((entry) => {
        const rawContentTypes = RAW_CONTENT_TYPES_BY_OPERATION[entry.operationName];
        const responseKind = entry.rawMedia ? 'raw' : 'protobuf';
        const rawContentTypeLine =
            rawContentTypes === undefined
                ? ''
                : `\n        rawContentTypes: [${rawContentTypes
                      .map((contentType) => `'${contentType}'`)
                      .join(', ')}],`;
        return `    ${entry.operationName}: {
        operationName: '${entry.operationName}',
        method: '${entry.method}',
        pathTemplate: '${entry.pathTemplate}',
        requestSchema: ${entry.requestSchema},
        responseSchema: ${entry.responseSchema},
        bodyMode: '${entry.bodyMode}',
        responseKind: '${responseKind}',${rawContentTypeLine}
    }`;
    });

    const namedExportLines = entries.map(
        (entry) =>
            `export const ${entry.operationName} = ${domain}_V2_OPERATIONS.${entry.operationName};`
    );

    return `// Generated by scripts/generate-v2-client-registry.mjs. Do not edit manually.
${importLines.join('\n')}
import type { V2ClientOperation } from './types';

export const ${domain}_V2_OPERATIONS = {
${entryLines.join(',\n')}
} satisfies Record<string, V2ClientOperation>;

${namedExportLines.join('\n')}
`;
}

function renderIndex(domains) {
    const importLines = domains
        .map(
            ({ domain, baseName }) =>
                `import { ${domain}_V2_OPERATIONS } from './${baseName}';`
        )
        .join('\n');
    const spreadLines = domains
        .map(({ domain }) => `    ...${domain}_V2_OPERATIONS,`)
        .join('\n');

    return `// Generated by scripts/generate-v2-client-registry.mjs. Do not edit manually.
${importLines}

export const V2_CLIENT_OPERATIONS = {
${spreadLines}
} as const;

export type V2ClientOperationName = keyof typeof V2_CLIENT_OPERATIONS;
`;
}

function main() {
    fs.mkdirSync(outputDir, { recursive: true });

    const domains = [];
    const seenOperationNames = new Set();
    for (const fileName of fs.readdirSync(manifestDir).sort()) {
        if (!fileName.endsWith('.ts')) {
            continue;
        }

        const baseName = fileName.replace(/\.ts$/, '');
        const domain = baseName.toUpperCase();
        domains.push({ domain, baseName });
        const source = readSource(path.join(manifestDir, fileName));
        const { imports, entries } = extractEntries(source);

        if (entries.length === 0) {
            throw new Error(`no operations extracted from ${fileName}`);
        }

        for (const entry of entries) {
            if (!entry.operationName || !entry.method || !entry.pathTemplate) {
                throw new Error(`incomplete operation entry in ${fileName}`);
            }
            if (seenOperationNames.has(entry.operationName)) {
                throw new Error(
                    `duplicate operation ${entry.operationName} in ${fileName}`
                );
            }
            seenOperationNames.add(entry.operationName);
        }

        fs.writeFileSync(
            path.join(outputDir, `${baseName}.ts`),
            renderModule(domain, entries, imports),
            'utf8'
        );
    }

    if (seenOperationNames.size !== 99) {
        throw new Error(
            `expected 99 operations, got ${seenOperationNames.size}`
        );
    }

    fs.writeFileSync(
        path.join(outputDir, 'index.ts'),
        renderIndex(domains),
        'utf8'
    );
    console.log(`generated ${seenOperationNames.size} client registry entries`);
}

main();
