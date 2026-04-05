export type DocsAuthMode = 'anonymous' | 'cookie' | 'apiKey';

export type OpenApiHttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type OpenApiSchemaType =
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'array'
    | 'object';

export interface OpenApiReference {
    $ref: string;
}

export interface OpenApiTag {
    name: string;
    description?: string;
}

export interface OpenApiServer {
    url: string;
    description?: string;
}

export interface OpenApiInfo {
    title: string;
    version: string;
    description?: string;
}

export interface OpenApiSchema {
    type?: OpenApiSchemaType;
    format?: string;
    description?: string;
    nullable?: boolean;
    enum?: Array<string | number | boolean>;
    default?: unknown;
    example?: unknown;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    pattern?: string;
    properties?: Record<string, OpenApiSchema | OpenApiReference>;
    required?: string[];
    items?: OpenApiSchema | OpenApiReference;
    additionalProperties?: boolean | OpenApiSchema | OpenApiReference;
    oneOf?: Array<OpenApiSchema | OpenApiReference>;
}

export interface OpenApiExample {
    summary?: string;
    value: unknown;
}

export interface OpenApiHeader {
    description?: string;
    schema?: OpenApiSchema | OpenApiReference;
    example?: unknown;
}

export interface OpenApiMediaType {
    schema?: OpenApiSchema | OpenApiReference;
    example?: unknown;
    examples?: Record<string, OpenApiExample>;
}

export interface OpenApiParameter {
    name: string;
    in: 'path' | 'query' | 'header';
    description?: string;
    required?: boolean;
    schema?: OpenApiSchema | OpenApiReference;
    example?: unknown;
}

export interface OpenApiRequestBody {
    description?: string;
    required?: boolean;
    content: Record<string, OpenApiMediaType>;
}

export interface OpenApiResponse {
    description: string;
    headers?: Record<string, OpenApiHeader | OpenApiReference>;
    content?: Record<string, OpenApiMediaType>;
}

export interface DocsApiExample {
    id: string;
    label: string;
    summary: string;
    authMode?: DocsAuthMode;
    pathParams?: Record<string, string | undefined>;
    query?: Record<string, string | undefined>;
    headers?: Record<string, string | undefined>;
    body?: unknown;
}

export interface OpenApiOperation {
    operationId: string;
    tags: string[];
    summary: string;
    description?: string;
    parameters?: Array<OpenApiParameter | OpenApiReference>;
    requestBody?: OpenApiRequestBody | OpenApiReference;
    responses: Record<string, OpenApiResponse | OpenApiReference>;
    security?: Array<Record<string, string[] | undefined>>;
    'x-slug': string;
    'x-group': string;
    'x-sort-order': number;
    'x-auth-modes': DocsAuthMode[];
    'x-required-scopes': string[];
    'x-examples': DocsApiExample[];
}

export interface OpenApiPathItem {
    get?: OpenApiOperation;
    post?: OpenApiOperation;
    put?: OpenApiOperation;
    patch?: OpenApiOperation;
    delete?: OpenApiOperation;
}

export interface OpenApiComponents {
    schemas?: Record<string, OpenApiSchema>;
    parameters?: Record<string, OpenApiParameter>;
    responses?: Record<string, OpenApiResponse>;
    headers?: Record<string, OpenApiHeader>;
    securitySchemes?: Record<string, Record<string, unknown>>;
}

export interface OpenApiDocument {
    openapi: string;
    info: OpenApiInfo;
    servers?: OpenApiServer[];
    tags?: OpenApiTag[];
    components?: OpenApiComponents;
    paths: Record<string, OpenApiPathItem>;
}

export interface DocsResolvedResponse {
    statusCode: string;
    description: string;
    headers: Array<{
        name: string;
        description: string;
        schema?: OpenApiSchema;
        example?: unknown;
    }>;
    content: Array<{
        contentType: string;
        schema?: OpenApiSchema;
        example?: unknown;
    }>;
}

export interface DocsApiEndpoint {
    slug: string;
    method: OpenApiHttpMethod;
    operationId: string;
    group: string;
    tag: string;
    path: string;
    summary: string;
    description: string;
    authModes: DocsAuthMode[];
    requiredScopes: string[];
    parameters: OpenApiParameter[];
    requestBody: OpenApiRequestBody | null;
    responses: DocsResolvedResponse[];
    examples: DocsApiExample[];
}

export interface DocsApiGroup {
    key: string;
    label: string;
    description: string;
    endpoints: DocsApiEndpoint[];
}

export interface DocsApiPerRecordCostRule {
    unitCost: number;
    rounding: 'ceil';
}

export interface DocsApiCostRuntimeConfig {
    minimumRequestCost: number;
    fixed: {
        authMe: number;
        timetableTrain: number;
        exportDailyIndex: number;
        exportDaily: number;
    };
    perRecord: {
        recordsDaily: DocsApiPerRecordCostRule;
        timetableStation: DocsApiPerRecordCostRule;
        historyTrain: DocsApiPerRecordCostRule;
        historyEmu: DocsApiPerRecordCostRule;
    };
}

export interface DocsApiCostDisplay {
    summary: string;
    ruleText: string;
    description: string;
    note: string;
}

export interface DocsApiRuntimeConfig {
    versionPrefix: string;
    apiKeyHeader: string;
    authCookieName: string;
    timestampUnit: string;
    headers: {
        remain: string;
        cost: string;
        retryAfter: string;
    };
    pagination: {
        defaultLimit: number;
        maxLimit: number;
    };
    cost: DocsApiCostRuntimeConfig;
}
