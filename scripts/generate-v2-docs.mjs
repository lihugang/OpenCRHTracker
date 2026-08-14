#!/usr/bin/env node

// 从三个事实来源生成 v2 API 文档：
//  1. utils/docs/v2DocMetadata.ts         - 手工维护的中文元数据
//  2. server/utils/api/v2/manifestEntries - 操作的路径、方法与权限
//  3. proto/opencrh/v2/*.proto            - 响应消息结构
//
// 输出：
//  - utils/docs/generated/openApi.ts      （页面数据源）
//  - public/docs/api/openapi.json         （机器可读的 OpenAPI 3.1 规范）

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import prettier from 'prettier';

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);
const metadataPath = path.join(repoRoot, 'utils/docs/v2DocMetadata.ts');
const manifestDir = path.join(repoRoot, 'server/utils/api/v2/manifestEntries');
const protoDir = path.join(repoRoot, 'proto/opencrh/v2');
const operationNamesPath = path.join(
    repoRoot,
    'server/utils/api/v2/operationNames.ts'
);
const apiScopesPath = path.join(
    repoRoot,
    'server/utils/api/scopes/apiScopes.ts'
);
const outputTsPath = path.join(repoRoot, 'utils/docs/generated/openApi.ts');
const outputJsonPath = path.join(repoRoot, 'public/docs/api/openapi.json');

const SCALAR_SCHEMAS = {
    double: { type: 'number' },
    float: { type: 'number' },
    int32: { type: 'integer', format: 'int32' },
    sint32: { type: 'integer', format: 'int32' },
    sfixed32: { type: 'integer', format: 'int32' },
    uint32: { type: 'integer', format: 'uint32' },
    fixed32: { type: 'integer', format: 'uint32' },
    int64: { type: 'integer', format: 'int64' },
    sint64: { type: 'integer', format: 'int64' },
    sfixed64: { type: 'integer', format: 'int64' },
    uint64: { type: 'integer', format: 'uint64' },
    fixed64: { type: 'integer', format: 'uint64' },
    bool: { type: 'boolean' },
    string: { type: 'string' },
    bytes: { type: 'string', format: 'byte' }
};

// ---------------------------------------------------------------------------
// 加载手工元数据模块（TypeScript -> CommonJS -> require）
// ---------------------------------------------------------------------------

function loadTypeScriptModule(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    const result = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true
        },
        fileName: filePath
    });
    const module = { exports: {} };
    const require = createRequire(filePath);
    const fn = new Function(
        'exports',
        'module',
        'require',
        '__filename',
        '__dirname',
        result.outputText
    );
    fn(module.exports, module, require, filePath, path.dirname(filePath));
    return module.exports;
}

// ---------------------------------------------------------------------------
// 解析操作清单
// ---------------------------------------------------------------------------

function findMatchingBrace(text, openIndex) {
    let depth = 0;
    for (let index = openIndex; index < text.length; index += 1) {
        if (text[index] === '{') {
            depth += 1;
        } else if (text[index] === '}') {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    throw new Error(`unbalanced brace at ${openIndex}`);
}

function extractBalancedBlock(text, startIndex) {
    const openIndex = text.indexOf('{', startIndex);
    const closeIndex = findMatchingBrace(text, openIndex);
    return text.slice(startIndex, closeIndex + 1);
}

function parseApiScopes() {
    const text = fs.readFileSync(apiScopesPath, 'utf8');
    const root = {};
    const stack = [];
    let current = root;

    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        const objectMatch = line.match(/^([A-Za-z0-9_]+):\s*\{\s*$/);
        if (objectMatch) {
            const key = objectMatch[1];
            current[key] = current[key] ?? {};
            stack.push(current);
            current = current[key];
            continue;
        }

        if (/^\},?\s*$/.test(line) && stack.length > 0) {
            current = stack.pop();
            continue;
        }

        const valueMatch = line.match(/^([A-Za-z0-9_]+):\s*'([^']+)',?\s*$/);
        if (valueMatch) {
            current[valueMatch[1]] = valueMatch[2];
        }
    }

    return root;
}

function resolveScopePath(scopes, expression) {
    let current = scopes;
    for (const part of expression.split('.')) {
        current = current?.[part];
        if (typeof current === 'string') {
            return current;
        }
    }
    return null;
}

export function parseManifestEntries() {
    const entries = new Map();
    const scopes = parseApiScopes();

    for (const fileName of fs.readdirSync(manifestDir).sort()) {
        if (!fileName.endsWith('.ts')) {
            continue;
        }

        const text = fs.readFileSync(path.join(manifestDir, fileName), 'utf8');
        const pattern = /defineV2Operation\(\{/g;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            const block = extractBalancedBlock(text, match.index);
            const operationName =
                block.match(/operationName:\s*'([^']+)'/)?.[1] ?? null;
            if (!operationName) {
                continue;
            }

            const method = block.match(/method:\s*'([A-Z]+)'/)?.[1] ?? null;
            const pathTemplate =
                block.match(/pathTemplate:\s*'([^']+)'/)?.[1] ?? null;
            const dataSchema =
                block.match(/dataSchema:\s*([A-Za-z0-9_]+)/)?.[1] ?? null;
            const scopeExpressions = [
                ...block.matchAll(/API_SCOPES\.([A-Za-z0-9_.]+)/g)
            ].map((item) => item[1]);
            const requiredScopes = scopeExpressions
                .map((expression) => resolveScopePath(scopes, expression))
                .filter((value) => typeof value === 'string');
            const hasRawMedia = /\brawMedia\s*:/.test(block);

            entries.set(operationName, {
                operationName,
                method,
                pathTemplate,
                dataSchema,
                requiredScopes,
                hasRawMedia
            });
        }
    }

    return entries;
}

export { loadTypeScriptModule, metadataPath, operationNamesPath };

// ---------------------------------------------------------------------------
// 解析 protobuf 定义文件
// ---------------------------------------------------------------------------

function scanProtoTypes(text, parentPath, messages, enums) {
    const pattern = /\b(message|enum)\s+([A-Za-z0-9_]+)\s*\{/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        const kind = match[1];
        const name = match[2];
        const openIndex = match.index + match[0].length - 1;
        const closeIndex = findMatchingBrace(text, openIndex);
        const body = text.slice(openIndex + 1, closeIndex);
        const fullName = [...parentPath, name].join('_');

        if (kind === 'message') {
            parseMessage(fullName, body, messages, enums);
        } else {
            enums.set(fullName, {
                fullName,
                values: parseEnumValues(body)
            });
        }

        pattern.lastIndex = closeIndex + 1;
    }
}

function parseEnumValues(body) {
    const values = [];
    const pattern = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*\d+\s*;/gm;
    let match;
    while ((match = pattern.exec(body)) !== null) {
        values.push(match[1]);
    }
    return values;
}

function parseFieldLines(text) {
    const fields = [];
    const pattern =
        /^\s*(optional\s+)?(repeated\s+)?(map\s*<\s*([A-Za-z0-9_.]+)\s*,\s*([A-Za-z0-9_.]+)\s*>\s*|([A-Za-z0-9_.]+))\s+([A-Za-z0-9_]+)\s*=\s*(\d+)\s*;/gm;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        const hasOptional = match[1] !== undefined;
        const repeated = match[2] !== undefined;
        const isMap = match[4] !== undefined && match[5] !== undefined;
        const mapKeyType = match[4] ?? null;
        const mapValueType = match[5] ?? null;
        const typeName = match[6] ?? mapValueType;
        const fieldName = match[7];
        const number = Number(match[8]);

        fields.push({
            name: fieldName,
            number,
            typeName,
            repeated,
            isMap,
            mapKeyType,
            mapValueType,
            hasOptional,
            oneof: null
        });
    }

    return fields;
}

function maskBlockRanges(text, blocks) {
    let masked = text;
    for (const block of [...blocks].sort((a, b) => b.start - a.start)) {
        masked =
            masked.slice(0, block.start) +
            ' '.repeat(block.end - block.start) +
            masked.slice(block.end);
    }
    return masked;
}

function parseMessage(fullName, body, messages, enums) {
    const message = {
        fullName,
        fields: [],
        nestedTypes: new Set()
    };
    messages.set(fullName, message);

    const nestedBlocks = [];
    const nestedPattern = /\b(message|enum)\s+([A-Za-z0-9_]+)\s*\{/g;
    let nestedMatch;
    while ((nestedMatch = nestedPattern.exec(body)) !== null) {
        const kind = nestedMatch[1];
        const name = nestedMatch[2];
        const openIndex = nestedMatch.index + nestedMatch[0].length - 1;
        const closeIndex = findMatchingBrace(body, openIndex);
        const nestedFullName = `${fullName}_${name}`;
        message.nestedTypes.add(nestedFullName);
        nestedBlocks.push({
            start: nestedMatch.index,
            end: closeIndex + 1
        });

        if (kind === 'message') {
            parseMessage(
                nestedFullName,
                body.slice(openIndex + 1, closeIndex),
                messages,
                enums
            );
        } else {
            enums.set(nestedFullName, {
                fullName: nestedFullName,
                values: parseEnumValues(body.slice(openIndex + 1, closeIndex))
            });
        }

        nestedPattern.lastIndex = closeIndex + 1;
    }

    const oneofBlocks = [];
    const oneofPattern = /\boneof\s+([A-Za-z0-9_]+)\s*\{/g;
    let oneofMatch;
    while ((oneofMatch = oneofPattern.exec(body)) !== null) {
        const oneofName = oneofMatch[1];
        const openIndex = oneofMatch.index + oneofMatch[0].length - 1;
        const closeIndex = findMatchingBrace(body, openIndex);
        const oneofBody = body.slice(openIndex + 1, closeIndex);
        const oneofFields = parseFieldLines(oneofBody);
        for (const field of oneofFields) {
            field.oneof = oneofName;
        }
        message.fields.push(...oneofFields);
        oneofBlocks.push({
            start: oneofMatch.index,
            end: closeIndex + 1
        });
        oneofPattern.lastIndex = closeIndex + 1;
    }

    const fieldText = maskBlockRanges(body, [...nestedBlocks, ...oneofBlocks]);
    message.fields.push(...parseFieldLines(fieldText));
}

function collectProtoTypes() {
    const messages = new Map();
    const enums = new Map();
    for (const fileName of fs.readdirSync(protoDir).sort()) {
        if (!fileName.endsWith('.proto')) {
            continue;
        }
        const text = fs.readFileSync(path.join(protoDir, fileName), 'utf8');
        scanProtoTypes(text, [], messages, enums);
    }

    // Classify every field now that all types are known.
    for (const message of messages.values()) {
        for (const field of message.fields) {
            field.kind = classifyField(
                field,
                message.fullName,
                messages,
                enums
            );
            field.optional =
                field.hasOptional ||
                field.isMap ||
                field.oneof !== null ||
                (field.kind === 'message' && !field.repeated);
        }
    }

    return { messages, enums };
}

function resolveTypeName(scopeFullName, typeName, messages, enums) {
    const candidates = [`${scopeFullName}_${typeName}`, typeName];
    for (const candidate of candidates) {
        if (messages.has(candidate) || enums.has(candidate)) {
            return candidate;
        }
    }
    return typeName;
}

function classifyField(field, scopeFullName, messages, enums) {
    if (field.isMap) {
        const resolved = resolveTypeName(
            scopeFullName,
            field.mapValueType,
            messages,
            enums
        );
        return enums.has(resolved)
            ? 'map-enum'
            : messages.has(resolved)
              ? 'map-message'
              : 'map-scalar';
    }
    if (SCALAR_SCHEMAS[field.typeName] !== undefined) {
        return 'scalar';
    }
    const resolved = resolveTypeName(
        scopeFullName,
        field.typeName,
        messages,
        enums
    );
    if (enums.has(resolved)) {
        return 'enum';
    }
    if (messages.has(resolved)) {
        return 'message';
    }
    return 'unknown';
}

// ---------------------------------------------------------------------------
// OpenAPI 结构生成
// ---------------------------------------------------------------------------

function toCamelCase(snakeName) {
    return snakeName.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function toUpperSnake(name) {
    return name
        .replace(/[A-Z]/g, (char) => `_${char}`)
        .replace(/^_/, '')
        .toUpperCase();
}

function enumJsonValue(enumFullName, valueName) {
    const shortName = enumFullName.split('_').at(-1);
    const prefix = `${toUpperSnake(shortName)}_`;
    const name = valueName.startsWith(prefix)
        ? valueName.slice(prefix.length)
        : valueName;
    return name.toLowerCase();
}

function createSchemaBuilder(messages, enums) {
    const components = {
        schemas: {}
    };
    const registeredMessages = new Set();

    function registerEnum(enumFullName) {
        const existing = components.schemas[enumFullName];
        if (existing) {
            return { $ref: `#/components/schemas/${enumFullName}` };
        }

        const enumInfo = enums.get(enumFullName);
        if (!enumInfo) {
            return { type: 'string' };
        }

        components.schemas[enumFullName] = {
            type: 'string',
            enum: enumInfo.values.map((value) =>
                enumJsonValue(enumFullName, value)
            )
        };
        return { $ref: `#/components/schemas/${enumFullName}` };
    }

    function registerMessage(messageFullName) {
        const existing = components.schemas[messageFullName];
        if (existing) {
            return { $ref: `#/components/schemas/${messageFullName}` };
        }

        const message = messages.get(messageFullName);
        if (!message) {
            return { type: 'object' };
        }

        const schema = { type: 'object' };
        components.schemas[messageFullName] = schema;
        registeredMessages.add(messageFullName);

        const properties = {};
        const required = [];
        for (const field of message.fields) {
            const jsonName = toCamelCase(field.name);
            properties[jsonName] = fieldSchema(field, messageFullName);
            if (!field.optional) {
                required.push(jsonName);
            }
        }

        schema.properties = properties;
        if (required.length > 0) {
            schema.required = required;
        }

        return { $ref: `#/components/schemas/${messageFullName}` };
    }

    function fieldSchema(field, scopeFullName) {
        if (field.isMap) {
            return {
                type: 'object',
                additionalProperties: typeSchema(
                    field.mapValueType,
                    scopeFullName
                )
            };
        }

        const base = typeSchema(field.typeName, scopeFullName);
        if (field.repeated) {
            return {
                type: 'array',
                items: base
            };
        }
        return base;
    }

    function typeSchema(typeName, scopeFullName) {
        if (SCALAR_SCHEMAS[typeName] !== undefined) {
            return { ...SCALAR_SCHEMAS[typeName] };
        }

        const resolved = resolveTypeName(
            scopeFullName,
            typeName,
            messages,
            enums
        );
        if (enums.has(resolved)) {
            return registerEnum(resolved);
        }
        if (messages.has(resolved)) {
            return registerMessage(resolved);
        }
        return { type: 'string' };
    }

    return {
        components,
        registerMessage,
        typeSchema
    };
}

// ---------------------------------------------------------------------------
// OpenAPI 文档组装
// ---------------------------------------------------------------------------

const RESPONSE_HEADER_REFS = {
    'x-api-remain': { $ref: '#/components/headers/ApiRemain' },
    'x-api-cost': { $ref: '#/components/headers/ApiCost' },
    'Retry-After': { $ref: '#/components/headers/RetryAfter' }
};

function responseHeaders() {
    return {
        'x-api-remain': { $ref: '#/components/headers/ApiRemain' },
        'x-api-cost': { $ref: '#/components/headers/ApiCost' },
        'Retry-After': { $ref: '#/components/headers/RetryAfter' }
    };
}

export function generateDocs() {
    const metadataModule = loadTypeScriptModule(metadataPath);
    const groups = metadataModule.V2_DOC_GROUPS;
    const endpoints = metadataModule.V2_DOC_ENDPOINTS;
    const groupMap = metadataModule.V2_DOC_GROUP_MAP;
    const manifests = parseManifestEntries();
    const { messages, enums } = collectProtoTypes();
    const builder = createSchemaBuilder(messages, enums);

    const metaRef = builder.registerMessage('ApiMeta');
    const errorRef = builder.registerMessage('ApiError');

    function successSchema(dataMessageName) {
        return {
            type: 'object',
            required: ['meta', 'data'],
            properties: {
                meta: metaRef,
                data: builder.registerMessage(dataMessageName)
            }
        };
    }

    function errorSchema() {
        return {
            type: 'object',
            required: ['meta', 'error'],
            properties: {
                meta: metaRef,
                error: errorRef
            }
        };
    }

    function rawErrorSchema() {
        return {
            type: 'object',
            required: ['ok', 'data', 'error'],
            properties: {
                ok: { type: 'boolean' },
                data: { type: 'string' },
                error: { type: 'string' }
            }
        };
    }

    const paths = {};
    const seenSlugs = new Set();
    const seenOperationNames = new Set();

    for (const endpoint of endpoints) {
        if (seenSlugs.has(endpoint.slug)) {
            throw new Error(`duplicate docs slug: ${endpoint.slug}`);
        }
        if (seenOperationNames.has(endpoint.operationName)) {
            throw new Error(
                `duplicate docs operation: ${endpoint.operationName}`
            );
        }
        seenSlugs.add(endpoint.slug);
        seenOperationNames.add(endpoint.operationName);

        const manifest = manifests.get(endpoint.operationName);
        if (!manifest) {
            throw new Error(
                `missing manifest entry for ${endpoint.operationName}`
            );
        }
        if (!manifest.dataSchema) {
            throw new Error(`missing dataSchema for ${endpoint.operationName}`);
        }

        const group = groupMap[endpoint.groupKey];
        if (!group) {
            throw new Error(
                `unknown group key ${endpoint.groupKey} for ${endpoint.slug}`
            );
        }

        const dataMessageName = manifest.dataSchema.replace(/Schema$/, '');
        const relativePath = manifest.pathTemplate
            .replace(/^\/api\/v2/, '')
            .replace(/:([A-Za-z0-9_]+)/g, '{$1}');
        const method = manifest.method.toLowerCase();
        const raw = endpoint.rawContentTypes !== undefined;
        const successSchemaRef = successSchema(dataMessageName);
        const failureSchema = raw ? rawErrorSchema() : errorSchema();

        const responses = {
            200: {
                description: endpoint.successDescription,
                headers: responseHeaders(),
                content: (() => {
                    const content = {
                        'application/json': {
                            schema: successSchemaRef,
                            example: endpoint.successExample
                        }
                    };
                    for (const contentType of endpoint.rawContentTypes ?? []) {
                        content[contentType] = {
                            schema: { type: 'string', format: 'binary' }
                        };
                    }
                    if (endpoint.rawExample !== undefined) {
                        content['text/csv'] = {
                            schema: { type: 'string' },
                            example: endpoint.rawExample
                        };
                    }
                    return content;
                })()
            }
        };

        for (const errorResponse of endpoint.errors) {
            responses[errorResponse.statusCode] = {
                description: errorResponse.description,
                headers: responseHeaders(),
                content: {
                    'application/json': {
                        schema: failureSchema,
                        example: raw
                            ? {
                                  ok: false,
                                  data: errorResponse.data,
                                  error: errorResponse.errorCode
                              }
                            : {
                                  meta: {
                                      remain: 159,
                                      cost: 1
                                  },
                                  error: {
                                      code: errorResponse.errorCode,
                                      message: errorResponse.data
                                  }
                              }
                    }
                }
            };
        }

        const security = endpoint.authModes.includes('anonymous')
            ? [{}, { bearerAuth: [] }, { cookieAuth: [] }]
            : [{ bearerAuth: [] }, { cookieAuth: [] }];

        const operation = {
            operationId: endpoint.operationName,
            tags: [group.tag],
            summary: endpoint.summary,
            description: endpoint.description,
            parameters: endpoint.parameters,
            security,
            responses,
            'x-slug': endpoint.slug,
            'x-group': group.label,
            'x-sort-order': endpoint.sortOrder,
            'x-auth-modes': endpoint.authModes,
            'x-required-scopes': manifest.requiredScopes,
            'x-examples': endpoint.examples,
            'x-usage-scenarios': endpoint.usageScenarios,
            'x-faq': endpoint.faq
        };

        paths[relativePath] = {
            [method]: operation
        };
    }

    const document = {
        openapi: '3.1.0',
        info: {
            title: 'OpenCRHTracker 开发者 API',
            version: '2.0.0',
            description:
                '面向开发者的 v2 API 文档，覆盖鉴权、每日记录、历史查询、时刻表、配属与导出接口。'
        },
        servers: [
            {
                url: '/api/v2',
                description: '同源 API 服务'
            }
        ],
        tags: groups.map((group) => ({
            name: group.tag,
            description: group.description
        })),
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'API Key'
                },
                cookieAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'token'
                }
            },
            headers: {
                ApiRemain: {
                    description: '本次请求完成后的剩余额度。',
                    schema: { type: 'integer', format: 'int64' },
                    example: 159
                },
                ApiCost: {
                    description: '本次请求实际扣除的额度成本。',
                    schema: { type: 'integer', format: 'int64' },
                    example: 1
                },
                RetryAfter: {
                    description: '请求被限流时建议等待的秒数。',
                    schema: { type: 'integer', format: 'int64' },
                    example: 300
                }
            },
            schemas: builder.components.schemas
        },
        paths
    };

    return {
        document,
        outputTsPath,
        outputJsonPath,
        endpointCount: endpoints.length,
        operationNames: endpoints.map((endpoint) => endpoint.operationName)
    };
}

export async function formatGeneratedTs(content) {
    const config = (await prettier.resolveConfig(outputTsPath)) ?? {};
    return prettier.format(content, { ...config, filepath: outputTsPath });
}

export async function formatGeneratedJson(content) {
    const config = (await prettier.resolveConfig(outputJsonPath)) ?? {};
    return prettier.format(content, { ...config, filepath: outputJsonPath });
}

export function renderGeneratedTs(document) {
    return (
        '// 由 scripts/generate-v2-docs.mjs 生成，请勿手动编辑。\n' +
        "import type { OpenApiDocument } from '~/types/docs';\n\n" +
        `export const developerDocsOpenApi: OpenApiDocument = ${JSON.stringify(
            document,
            null,
            4
        )};\n\nexport default developerDocsOpenApi;\n`
    );
}

export function renderGeneratedJson(document) {
    return JSON.stringify(document, null, 4) + '\n';
}

async function main() {
    const { document, endpointCount } = generateDocs();
    const tsContent = await formatGeneratedTs(renderGeneratedTs(document));
    const jsonContent = await formatGeneratedJson(
        renderGeneratedJson(document)
    );

    fs.mkdirSync(path.dirname(outputTsPath), { recursive: true });
    fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
    fs.writeFileSync(outputTsPath, tsContent, 'utf8');
    fs.writeFileSync(outputJsonPath, jsonContent, 'utf8');

    console.log(
        `generated v2 docs for ${endpointCount} endpoints (${path.relative(
            repoRoot,
            outputTsPath
        )}, ${path.relative(repoRoot, outputJsonPath)})`
    );
}

const isMain =
    process.argv[1] &&
    pathToFileURL(process.argv[1]).href ===
        pathToFileURL(fileURLToPath(import.meta.url)).href;

if (isMain) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
