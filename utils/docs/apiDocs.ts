import developerDocsOpenApi from '~/utils/docs/openApi';
import type {
    DocsApiCostDisplay,
    DocsApiEndpoint,
    DocsApiGroup,
    DocsAuthMode,
    DocsApiRuntimeConfig,
    DocsResolvedResponse,
    OpenApiHeader,
    OpenApiHttpMethod,
    OpenApiOperation,
    OpenApiParameter,
    OpenApiPathItem,
    OpenApiReference,
    OpenApiRequestBody,
    OpenApiResponse,
    OpenApiSchema
} from '~/types/docs';

export const DEFAULT_DOCS_API_RUNTIME_CONFIG: DocsApiRuntimeConfig = {
    versionPrefix: '/api/v1',
    apiKeyHeader: 'authorization',
    authCookieName: 'token',
    timestampUnit: 'seconds',
    headers: {
        remain: 'x-api-remain',
        cost: 'x-api-cost',
        retryAfter: 'Retry-After'
    },
    pagination: {
        defaultLimit: 20,
        maxLimit: 200
    },
    cost: {
        minimumRequestCost: 1,
        fixed: {
            authMe: 1,
            timetableTrain: 1,
            exportDailyIndex: 2,
            exportDaily: 50
        },
        perRecord: {
            recordsDaily: {
                unitCost: 0.05,
                rounding: 'ceil'
            },
            timetableStation: {
                unitCost: 0.05,
                rounding: 'ceil'
            },
            historyTrain: {
                unitCost: 0.05,
                rounding: 'ceil'
            },
            historyEmu: {
                unitCost: 0.05,
                rounding: 'ceil'
            }
        }
    }
};

const PUBLIC_DOCS_API_SLUGS = new Set<string>([
    'auth-me',
    'records-daily',
    'timetable-train',
    'timetable-station',
    'history-train',
    'history-emu',
    'exports-daily-index',
    'exports-daily-date'
]);

function isReference(value: unknown): value is OpenApiReference {
    return (
        typeof value === 'object' &&
        value !== null &&
        '$ref' in value &&
        typeof (value as { $ref?: unknown }).$ref === 'string'
    );
}

function resolveLocalRef(ref: string) {
    if (!ref.startsWith('#/')) {
        throw new Error('Unsupported ref: ' + ref);
    }

    const segments = ref.slice(2).split('/');
    let current: unknown = developerDocsOpenApi;

    for (const segment of segments) {
        if (
            typeof current !== 'object' ||
            current === null ||
            !(segment in current)
        ) {
            throw new Error('Unresolved ref: ' + ref);
        }

        current = (current as Record<string, unknown>)[segment];
    }

    return current;
}

function resolveSchema(
    value?: OpenApiSchema | OpenApiReference
): OpenApiSchema | undefined {
    if (!value) {
        return undefined;
    }

    return isReference(value)
        ? (resolveLocalRef(value.$ref) as OpenApiSchema)
        : value;
}

function resolveParameter(
    value: OpenApiParameter | OpenApiReference
): OpenApiParameter {
    return isReference(value)
        ? (resolveLocalRef(value.$ref) as OpenApiParameter)
        : value;
}

function resolveHeader(value: OpenApiHeader | OpenApiReference): OpenApiHeader {
    return isReference(value)
        ? (resolveLocalRef(value.$ref) as OpenApiHeader)
        : value;
}

function resolveRequestBody(
    value?: OpenApiRequestBody | OpenApiReference
): OpenApiRequestBody | null {
    if (!value) {
        return null;
    }

    return isReference(value)
        ? (resolveLocalRef(value.$ref) as OpenApiRequestBody)
        : value;
}

function resolveResponse(
    statusCode: string,
    value: OpenApiResponse | OpenApiReference
): DocsResolvedResponse {
    const response = isReference(value)
        ? (resolveLocalRef(value.$ref) as OpenApiResponse)
        : value;

    return {
        statusCode,
        description: response.description,
        headers: Object.entries(response.headers ?? {}).map(
            ([name, header]) => {
                const resolvedHeader = resolveHeader(header);

                return {
                    name,
                    description: resolvedHeader.description ?? '',
                    schema: resolveSchema(resolvedHeader.schema),
                    example: resolvedHeader.example
                };
            }
        ),
        content: Object.entries(response.content ?? {}).map(
            ([contentType, mediaType]) => ({
                contentType,
                schema: resolveSchema(mediaType.schema),
                example: (() => {
                    if (mediaType.example !== undefined) {
                        return mediaType.example;
                    }

                    return extractSchemaExample(
                        resolveSchema(mediaType.schema)
                    );
                })()
            })
        )
    };
}

function createEndpoint(
    method: OpenApiHttpMethod,
    path: string,
    operation: OpenApiOperation
): DocsApiEndpoint {
    return {
        slug: operation['x-slug'],
        method,
        operationId: operation.operationId,
        group: operation['x-group'],
        tag: operation.tags[0] ?? operation['x-group'],
        path,
        summary: operation.summary,
        description: operation.description ?? '',
        authModes: operation['x-auth-modes'],
        requiredScopes: operation['x-required-scopes'],
        parameters: (operation.parameters ?? []).map(resolveParameter),
        requestBody: resolveRequestBody(operation.requestBody),
        responses: Object.entries(operation.responses)
            .map(([statusCode, response]) =>
                resolveResponse(statusCode, response)
            )
            .sort(
                (left, right) =>
                    Number(left.statusCode) - Number(right.statusCode)
            ),
        examples: operation['x-examples']
    };
}

function readOperation(pathItem: OpenApiPathItem, method: OpenApiHttpMethod) {
    switch (method) {
        case 'get':
            return pathItem.get;
        case 'post':
            return pathItem.post;
        case 'put':
            return pathItem.put;
        case 'patch':
            return pathItem.patch;
        case 'delete':
            return pathItem.delete;
    }
}

const endpointList = Object.entries(developerDocsOpenApi.paths)
    .flatMap(([path, pathItem]) => {
        return (['get', 'post', 'put', 'patch', 'delete'] as const).flatMap(
            (method) => {
                const operation = readOperation(pathItem, method);
                return operation
                    ? [createEndpoint(method, path, operation)]
                    : [];
            }
        );
    })
    .filter((endpoint) => PUBLIC_DOCS_API_SLUGS.has(endpoint.slug))
    .sort((left, right) => {
        if (left.group !== right.group) {
            return left.group.localeCompare(right.group);
        }

        return left.slug.localeCompare(right.slug);
    });

const endpointMap = new Map(
    endpointList.map((endpoint) => [endpoint.slug, endpoint])
);

const tagDescriptionMap = new Map(
    (developerDocsOpenApi.tags ?? []).map((tag) => [
        tag.name,
        tag.description ?? ''
    ])
);

const FIXED_COST_ENDPOINT_KEYS = {
    'auth-me': 'authMe',
    'timetable-train': 'timetableTrain',
    'exports-daily-index': 'exportDailyIndex',
    'exports-daily-date': 'exportDaily'
} as const satisfies Record<
    string,
    keyof DocsApiRuntimeConfig['cost']['fixed']
>;

const PER_RECORD_COST_ENDPOINT_KEYS = {
    'records-daily': 'recordsDaily',
    'timetable-station': 'timetableStation',
    'history-train': 'historyTrain',
    'history-emu': 'historyEmu'
} as const satisfies Record<
    string,
    keyof DocsApiRuntimeConfig['cost']['perRecord']
>;

export function listDocsApiEndpoints() {
    return endpointList;
}

export function getDocsApiEndpointBySlug(slug: string) {
    return endpointMap.get(slug) ?? null;
}

export function getDocsVisibleAuthModeLabels(modes: DocsAuthMode[]) {
    return modes.flatMap((mode) =>
        mode === 'anonymous' ? ['可匿名访问'] : []
    );
}

function formatCostValue(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatCostRounding(rounding: DocsApiRuntimeConfig['cost']['perRecord'][keyof DocsApiRuntimeConfig['cost']['perRecord']]['rounding']) {
    if (rounding === 'ceil') {
        return '向上取整';
    }

    return rounding;
}

export function getDocsApiCostDisplay(
    endpoint: DocsApiEndpoint,
    runtimeConfig: DocsApiRuntimeConfig
): DocsApiCostDisplay | null {
    const fixedCostKey =
        FIXED_COST_ENDPOINT_KEYS[
            endpoint.slug as keyof typeof FIXED_COST_ENDPOINT_KEYS
        ];
    if (fixedCostKey) {
        const fixedCost = runtimeConfig.cost.fixed[fixedCostKey];
        const ruleText = `固定 ${formatCostValue(fixedCost)} 点额度/次`;

        return {
            summary: `扣费规则：${ruleText}`,
            ruleText,
            description: '每次请求按固定额度扣费，不随返回条数变化。',
            note: `实际扣费以响应头 ${runtimeConfig.headers.cost} 为准。`
        };
    }

    const perRecordCostKey =
        PER_RECORD_COST_ENDPOINT_KEYS[
            endpoint.slug as keyof typeof PER_RECORD_COST_ENDPOINT_KEYS
        ];
    if (perRecordCostKey) {
        const rule = runtimeConfig.cost.perRecord[perRecordCostKey];
        const minimumRequestCost = runtimeConfig.cost.minimumRequestCost;
        const ruleText =
            '按本页返回条数计费，' +
            formatCostValue(rule.unitCost) +
            ' 额度/条，' +
            formatCostRounding(rule.rounding) +
            '，最低扣费额度为 ' +
            formatCostValue(minimumRequestCost);

        return {
            summary: '扣费规则：' + ruleText,
            ruleText,
            description:
                'items 表示本次响应实际返回的记录条数，按记录数计算后再应用最低扣费。',
            note:
                '实际扣费以响应头 ' +
                runtimeConfig.headers.cost +
                ' 为准；请求失败时也可能触发最低扣费。'
        };
    }

    return null;
}

export function listDocsApiGroups(): DocsApiGroup[] {
    const groups = new Map<string, DocsApiGroup>();

    for (const endpoint of endpointList) {
        const existing = groups.get(endpoint.group);
        if (existing) {
            existing.endpoints.push(endpoint);
            continue;
        }

        groups.set(endpoint.group, {
            key: endpoint.group,
            label: endpoint.group,
            description: tagDescriptionMap.get(endpoint.tag) ?? '',
            endpoints: [endpoint]
        });
    }

    return [...groups.values()];
}

export function formatSchemaType(schema?: OpenApiSchema): string {
    if (!schema) {
        return 'unknown';
    }

    if (schema.oneOf && schema.oneOf.length > 0) {
        return schema.oneOf
            .map((item) => formatSchemaType(resolveSchema(item)))
            .join(' | ');
    }

    if (schema.enum && schema.enum.length > 0) {
        return schema.enum.map((item) => String(item)).join(' | ');
    }

    let typeLabel = schema.type ?? 'any';

    if (typeLabel === 'array') {
        typeLabel =
            'array<' + formatSchemaType(resolveSchema(schema.items)) + '>';
    }

    if (schema.nullable) {
        typeLabel += ' | null';
    }

    return typeLabel;
}

function extractSchemaExample(schema?: OpenApiSchema): unknown {
    if (!schema) {
        return undefined;
    }

    if (schema.example !== undefined) {
        return schema.example;
    }

    if (schema.oneOf && schema.oneOf.length > 0) {
        for (const item of schema.oneOf) {
            const example = extractSchemaExample(resolveSchema(item));
            if (example !== undefined) {
                return example;
            }
        }

        return undefined;
    }

    if (schema.type === 'object') {
        const properties = Object.entries(schema.properties ?? {});
        const exampleEntries = properties
            .map(
                ([name, value]) =>
                    [name, extractSchemaExample(resolveSchema(value))] as const
            )
            .filter((entry) => entry[1] !== undefined);

        if (exampleEntries.length === 0) {
            return undefined;
        }

        return Object.fromEntries(exampleEntries);
    }

    if (schema.type === 'array') {
        const itemExample = extractSchemaExample(resolveSchema(schema.items));
        return itemExample === undefined ? undefined : [itemExample];
    }

    if (schema.default !== undefined) {
        return schema.default;
    }

    return undefined;
}

function describeResolvedSchema(schema?: OpenApiSchema): unknown {
    if (!schema) {
        return undefined;
    }

    if (schema.oneOf && schema.oneOf.length > 0) {
        return {
            oneOf: schema.oneOf.map((item) =>
                describeResolvedSchema(resolveSchema(item))
            )
        };
    }

    if (schema.type === 'object') {
        const properties = Object.fromEntries(
            Object.entries(schema.properties ?? {}).map(([name, value]) => {
                const resolvedProperty = resolveSchema(value);
                const propertyDescription: Record<string, unknown> = {
                    type: formatSchemaType(resolvedProperty)
                };

                if (resolvedProperty?.description) {
                    propertyDescription.description =
                        resolvedProperty.description;
                }

                if (schema.required?.includes(name)) {
                    propertyDescription.required = true;
                }

                if (
                    resolvedProperty?.enum &&
                    resolvedProperty.enum.length > 0
                ) {
                    propertyDescription.enum = resolvedProperty.enum;
                }

                if (resolvedProperty?.default !== undefined) {
                    propertyDescription.default = resolvedProperty.default;
                }

                if (
                    resolvedProperty &&
                    (resolvedProperty.type === 'object' ||
                        resolvedProperty.type === 'array' ||
                        (resolvedProperty.oneOf?.length ?? 0) > 0)
                ) {
                    propertyDescription.shape =
                        describeResolvedSchema(resolvedProperty);
                }

                return [name, propertyDescription];
            })
        );

        const description: Record<string, unknown> = {
            type: 'object'
        };

        if (schema.description) {
            description.description = schema.description;
        }

        if (schema.required && schema.required.length > 0) {
            description.required = schema.required;
        }

        if (Object.keys(properties).length > 0) {
            description.properties = properties;
        }

        return description;
    }

    if (schema.type === 'array') {
        const description: Record<string, unknown> = {
            type: 'array'
        };

        if (schema.description) {
            description.description = schema.description;
        }

        description.items = describeResolvedSchema(
            resolveSchema(schema.items)
        ) ?? { type: 'any' };

        return description;
    }

    const description: Record<string, unknown> = {
        type: formatSchemaType(schema)
    };

    if (schema.description) {
        description.description = schema.description;
    }

    if (schema.enum && schema.enum.length > 0) {
        description.enum = schema.enum;
    }

    if (schema.default !== undefined) {
        description.default = schema.default;
    }

    return description;
}

export function describeSchema(schema?: OpenApiSchema) {
    return describeResolvedSchema(schema);
}

export function stringifyExample(value: unknown) {
    if (value === undefined || value === null) {
        return '';
    }

    if (typeof value === 'string') {
        return value;
    }

    return JSON.stringify(value, null, 4);
}

export function getDocsParameterGroups(endpoint: DocsApiEndpoint) {
    return {
        path: endpoint.parameters.filter(
            (parameter) => parameter.in === 'path'
        ),
        query: endpoint.parameters.filter(
            (parameter) => parameter.in === 'query'
        ),
        header: endpoint.parameters.filter(
            (parameter) => parameter.in === 'header'
        )
    };
}
