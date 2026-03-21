<template>
    <div class="space-y-6">
        <div
            class="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div class="min-w-0 space-y-4">
                <UiField
                    label="示例"
                    help="">
                    <UiSelect
                        v-model="selectedExampleId"
                        :options="exampleOptions"
                        mobile-sheet-title="选择示例"
                        mobile-sheet-eyebrow="EXAMPLE" />
                </UiField>

                <UiField
                    label="鉴权方式"
                    help="">
                    <UiTabs
                        v-model="authMode"
                        :options="authModeOptions" />
                </UiField>

                <UiField
                    v-if="authMode === 'apiKey'"
                    label="API Key"
                    help="">
                    <input
                        v-model="sharedApiKey"
                        type="password"
                        class="harmony-input w-full px-4 py-3 text-sm"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="请输入你的 API Key" />
                </UiField>

                <div
                    v-if="pathParameters.length > 0"
                    class="space-y-3 rounded-[1rem] border border-slate-200 bg-white/80 p-4">
                    <h4 class="text-sm font-semibold text-slate-900">
                        路径参数
                    </h4>
                    <div
                        v-for="parameter in pathParameters"
                        :key="'path:' + parameter.name"
                        class="space-y-2">
                        <UiField
                            :label="parameter.name"
                            :help="parameter.description">
                            <input
                                v-model="pathValues[parameter.name]"
                                type="text"
                                class="harmony-input w-full px-4 py-3 text-sm"
                                :placeholder="
                                    stringifyFieldExample(parameter.example)
                                " />
                        </UiField>
                    </div>
                </div>

                <div
                    v-if="queryParameters.length > 0"
                    class="space-y-3 rounded-[1rem] border border-slate-200 bg-white/80 p-4">
                    <h4 class="text-sm font-semibold text-slate-900">
                        查询参数
                    </h4>
                    <div
                        v-for="parameter in queryParameters"
                        :key="'query:' + parameter.name"
                        class="space-y-2">
                        <UiField
                            :label="parameter.name"
                            :help="parameter.description">
                            <input
                                v-model="queryValues[parameter.name]"
                                type="text"
                                class="harmony-input w-full px-4 py-3 text-sm"
                                :placeholder="
                                    stringifyFieldExample(parameter.example)
                                " />
                        </UiField>
                    </div>
                </div>

                <div
                    v-if="headerParameters.length > 0"
                    class="space-y-3 rounded-[1rem] border border-slate-200 bg-white/80 p-4">
                    <h4 class="text-sm font-semibold text-slate-900">
                        请求头参数
                    </h4>
                    <div
                        v-for="parameter in headerParameters"
                        :key="'header:' + parameter.name"
                        class="space-y-2">
                        <UiField
                            :label="parameter.name"
                            :help="parameter.description">
                            <input
                                v-model="headerValues[parameter.name]"
                                type="text"
                                class="harmony-input w-full px-4 py-3 text-sm"
                                :placeholder="
                                    stringifyFieldExample(parameter.example)
                                " />
                        </UiField>
                    </div>
                </div>

                <UiField
                    v-if="supportsRequestBody"
                    label="请求体"
                    help="">
                    <textarea
                        v-model="requestBodyText"
                        class="harmony-input min-h-48 w-full px-4 py-3 font-mono text-sm"
                        spellcheck="false" />
                </UiField>

                <div
                    class="rounded-[1rem] border border-slate-200 bg-slate-50/90 p-4">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        请求地址
                    </p>
                    <p class="mt-2 break-all font-mono text-sm text-slate-700">
                        {{ requestUrl }}
                    </p>
                </div>

                <p
                    v-if="requestErrorMessage"
                    class="rounded-[1rem] border border-status-delayed/20 bg-status-delayed/5 px-4 py-3 text-sm text-status-delayed">
                    {{ requestErrorMessage }}
                </p>

                <div class="flex flex-wrap gap-3">
                    <UiButton
                        :loading="isLoading"
                        :disabled="isSubmitDisabled"
                        @click="sendRequest">
                        发送请求
                    </UiButton>
                    <UiButton
                        variant="secondary"
                        @click="resetFromSelectedExample">
                        重置示例
                    </UiButton>
                </div>
            </div>

            <div class="min-w-0 space-y-4">
                <div
                    class="rounded-[1rem] border border-slate-200 bg-white/85 p-4">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        cURL
                    </p>
                    <DocsCodeBlock
                        class="mt-3"
                        :code="curlSnippet"
                        text-class="text-xs leading-6" />
                </div>

                <div
                    class="rounded-[1rem] border border-slate-200 bg-white/85 p-4">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        fetch()
                    </p>
                    <DocsCodeBlock
                        class="mt-3"
                        :code="fetchSnippet"
                        text-class="text-xs leading-6" />
                </div>

                <div
                    class="rounded-[1rem] border border-slate-200 bg-white/85 p-4">
                    <div class="flex min-w-0 items-start justify-between gap-4">
                        <div class="min-w-0">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                响应结果
                            </p>
                            <p
                                v-if="responseState"
                                class="mt-2 text-sm font-semibold text-slate-900">
                                {{ responseState.status }}
                                {{ responseState.statusText }}
                            </p>
                        </div>
                        <span
                            v-if="responseState"
                            class="inline-flex max-w-full break-all rounded-full border px-3 py-1 text-xs font-semibold"
                            :class="
                                responseState.status >= 200 &&
                                responseState.status < 300
                                    ? 'border-status-running/20 bg-status-running/10 text-status-running'
                                    : 'border-status-delayed/20 bg-status-delayed/10 text-status-delayed'
                            ">
                            {{
                                responseState.contentType ||
                                '未返回 content-type'
                            }}
                        </span>
                    </div>

                    <div
                        v-if="responseState"
                        class="mt-4 space-y-4">
                        <div class="grid gap-3 sm:grid-cols-3">
                            <div
                                class="rounded-[1rem] border border-slate-200 bg-slate-50/90 px-4 py-3">
                                <p
                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    {{ runtimeConfig.headers.remain }}
                                </p>
                                <p
                                    class="mt-2 text-lg font-semibold text-slate-900">
                                    {{
                                        getResponseHeader(
                                            runtimeConfig.headers.remain
                                        ) || '--'
                                    }}
                                </p>
                            </div>
                            <div
                                class="rounded-[1rem] border border-slate-200 bg-slate-50/90 px-4 py-3">
                                <p
                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    {{ runtimeConfig.headers.cost }}
                                </p>
                                <p
                                    class="mt-2 text-lg font-semibold text-slate-900">
                                    {{
                                        getResponseHeader(
                                            runtimeConfig.headers.cost
                                        ) || '--'
                                    }}
                                </p>
                            </div>
                            <div
                                class="rounded-[1rem] border border-slate-200 bg-slate-50/90 px-4 py-3">
                                <p
                                    class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    {{ runtimeConfig.headers.retryAfter }}
                                </p>
                                <p
                                    class="mt-2 text-lg font-semibold text-slate-900">
                                    {{
                                        getResponseHeader(
                                            runtimeConfig.headers.retryAfter
                                        ) || '--'
                                    }}
                                </p>
                            </div>
                        </div>

                        <div
                            class="rounded-[1rem] border border-slate-200 bg-white">
                            <div class="border-b border-slate-200 px-4 py-3">
                                <p class="text-sm font-semibold text-slate-900">
                                    响应头
                                </p>
                            </div>
                            <div class="max-h-52 overflow-auto px-4 py-3">
                                <div
                                    v-for="header in responseState.headers"
                                    :key="header.name"
                                    class="grid gap-2 border-b border-slate-100 py-2 last:border-b-0 sm:grid-cols-[14rem_minmax(0,1fr)]">
                                    <span
                                        class="font-mono text-xs text-slate-500">
                                        {{ header.name }}
                                    </span>
                                    <span
                                        class="break-all text-sm text-slate-700">
                                        {{ header.value }}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div
                            class="min-w-0 rounded-[1rem] border border-slate-200 bg-white/95 p-4">
                            <p class="text-sm font-semibold text-slate-900">
                                响应体
                            </p>
                            <DocsCodeBlock
                                class="mt-3"
                                :code="responseState.body"
                                text-class="text-xs leading-6" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type {
    DocsApiEndpoint,
    DocsApiRuntimeConfig,
    DocsAuthMode
} from '~/types/docs';

interface ResponseHeaderItem {
    name: string;
    value: string;
}

interface ResponseState {
    status: number;
    statusText: string;
    contentType: string;
    headers: ResponseHeaderItem[];
    body: string;
}

const props = defineProps<{
    endpoint: DocsApiEndpoint;
    runtimeConfig: DocsApiRuntimeConfig;
}>();

const sharedApiKey = useState<string>('docs-api-playground-api-key', () => '');

function getPlayableAuthModes(modes: DocsAuthMode[]): DocsAuthMode[] {
    return modes.filter((mode) => mode === 'cookie' || mode === 'apiKey');
}

const selectedExampleId = ref(props.endpoint.examples[0]?.id ?? '');
const authMode = ref<DocsAuthMode>(
    getPlayableAuthModes(props.endpoint.authModes)[0] ?? 'cookie'
);
const requestBodyText = ref('');
const isLoading = ref(false);
const requestErrorMessage = ref('');
const responseState = ref<ResponseState | null>(null);

const pathValues = reactive<Record<string, string>>({});
const queryValues = reactive<Record<string, string>>({});
const headerValues = reactive<Record<string, string>>({});

const selectedExample = computed(() => {
    return (
        props.endpoint.examples.find(
            (example) => example.id === selectedExampleId.value
        ) ??
        props.endpoint.examples[0] ??
        null
    );
});

const pathParameters = computed(() =>
    props.endpoint.parameters.filter((parameter) => parameter.in === 'path')
);

const queryParameters = computed(() =>
    props.endpoint.parameters.filter((parameter) => parameter.in === 'query')
);

const headerParameters = computed(() =>
    props.endpoint.parameters.filter((parameter) => parameter.in === 'header')
);

const exampleOptions = computed(() =>
    props.endpoint.examples.map((example) => ({
        value: example.id,
        label: example.label
    }))
);

const authModeOptions = computed(() =>
    getPlayableAuthModes(props.endpoint.authModes).map((mode) => ({
        value: mode,
        label: mode === 'cookie' ? '现有会话' : 'API Key'
    }))
);

const supportsRequestBody = computed(() => props.endpoint.requestBody !== null);

const requestUrl = computed(() => {
    let resolvedPath = props.runtimeConfig.versionPrefix + props.endpoint.path;

    for (const parameter of pathParameters.value) {
        const rawValue = pathValues[parameter.name]?.trim() ?? '';
        const replacement = rawValue
            ? encodeURIComponent(rawValue)
            : '{' + parameter.name + '}';

        resolvedPath = resolvedPath.replace(
            '{' + parameter.name + '}',
            replacement
        );
    }

    const search = new URLSearchParams();

    for (const parameter of queryParameters.value) {
        const rawValue = queryValues[parameter.name]?.trim() ?? '';
        if (rawValue) {
            search.set(parameter.name, rawValue);
        }
    }

    const searchText = search.toString();
    return searchText ? resolvedPath + '?' + searchText : resolvedPath;
});

const missingRequiredPathParams = computed(() =>
    pathParameters.value
        .filter((parameter) => parameter.required)
        .filter((parameter) => !(pathValues[parameter.name] ?? '').trim())
        .map((parameter) => parameter.name)
);

const isSubmitDisabled = computed(() => {
    if (missingRequiredPathParams.value.length > 0) {
        return true;
    }

    if (authMode.value === 'apiKey' && !sharedApiKey.value.trim()) {
        return true;
    }

    return false;
});

const snippetHeaders = computed(() => {
    const nextHeaders: Record<string, string> = {};

    for (const parameter of headerParameters.value) {
        const value = headerValues[parameter.name]?.trim() ?? '';
        if (value) {
            nextHeaders[parameter.name] = value;
        }
    }

    if (supportsRequestBody.value && requestBodyText.value.trim()) {
        nextHeaders['Content-Type'] = 'application/json';
    }

    if (authMode.value === 'apiKey') {
        const headerName = props.runtimeConfig.apiKeyHeader;
        nextHeaders[headerName] =
            headerName.toLowerCase() === 'authorization'
                ? 'Bearer <your-api-key>'
                : '<your-api-key>';
    }

    return nextHeaders;
});

const curlSnippet = computed(() => {
    const parts = [
        'curl',
        '-X',
        props.endpoint.method.toUpperCase(),
        JSON.stringify(requestUrl.value)
    ];

    for (const [name, value] of Object.entries(snippetHeaders.value)) {
        parts.push('-H');
        parts.push(JSON.stringify(name + ': ' + value));
    }

    if (supportsRequestBody.value && requestBodyText.value.trim()) {
        parts.push('--data-raw');
        parts.push(JSON.stringify(requestBodyText.value));
    }

    return parts.join(' ');
});

const fetchSnippet = computed(() => {
    const lines = [
        'const response = await fetch(' +
            JSON.stringify(requestUrl.value) +
            ', {',
        "    method: '" + props.endpoint.method.toUpperCase() + "',"
    ];

    const headerEntries = Object.entries(snippetHeaders.value);
    if (headerEntries.length > 0) {
        lines.push('    headers: {');
        for (const [name, value] of headerEntries) {
            lines.push(
                '        ' +
                    JSON.stringify(name) +
                    ': ' +
                    JSON.stringify(value) +
                    ','
            );
        }
        lines.push('    },');
    }

    if (supportsRequestBody.value && requestBodyText.value.trim()) {
        lines.push('    body: ' + JSON.stringify(requestBodyText.value) + ',');
    }

    lines.push('});');
    lines.push('const body = await response.text();');

    return lines.join('\n');
});

function assignRecordValues(
    target: Record<string, string>,
    keys: string[],
    source?: Record<string, string | undefined>
) {
    for (const key of keys) {
        target[key] = source?.[key] ?? '';
    }
}

function resetFromSelectedExample() {
    resetFromExample(selectedExample.value);
}

function resetFromExample(example = selectedExample.value) {
    assignRecordValues(
        pathValues,
        pathParameters.value.map((parameter) => parameter.name),
        example?.pathParams
    );
    assignRecordValues(
        queryValues,
        queryParameters.value.map((parameter) => parameter.name),
        example?.query
    );
    assignRecordValues(
        headerValues,
        headerParameters.value.map((parameter) => parameter.name),
        example?.headers
    );

    requestBodyText.value =
        example?.body === undefined
            ? ''
            : JSON.stringify(example.body, null, 4);

    const preferredMode = example?.authMode;
    if (
        preferredMode &&
        getPlayableAuthModes(props.endpoint.authModes).includes(preferredMode)
    ) {
        authMode.value = preferredMode;
        return;
    }

    authMode.value =
        getPlayableAuthModes(props.endpoint.authModes)[0] ?? 'cookie';
}

watch(
    () => props.endpoint.slug,
    () => {
        selectedExampleId.value = props.endpoint.examples[0]?.id ?? '';
        resetFromExample(props.endpoint.examples[0] ?? null);
        responseState.value = null;
        requestErrorMessage.value = '';
    },
    {
        immediate: true
    }
);

watch(selectedExample, (nextExample) => {
    resetFromExample(nextExample);
});

function stringifyFieldExample(value: unknown) {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value);
}

function buildExecutionHeaders() {
    const headers = new Headers();

    for (const parameter of headerParameters.value) {
        const value = headerValues[parameter.name]?.trim() ?? '';
        if (value) {
            headers.set(parameter.name, value);
        }
    }

    if (supportsRequestBody.value && requestBodyText.value.trim()) {
        headers.set('Content-Type', 'application/json');
    }

    if (authMode.value === 'apiKey') {
        const headerName = props.runtimeConfig.apiKeyHeader;
        const key = sharedApiKey.value.trim();
        headers.set(
            headerName,
            headerName.toLowerCase() === 'authorization' ? 'Bearer ' + key : key
        );
    }

    return headers;
}

function getExecutionCredentials(): RequestCredentials {
    return authMode.value === 'apiKey' ? 'omit' : 'same-origin';
}

function getResponseHeader(name: string) {
    return (
        responseState.value?.headers.find(
            (header) => header.name.toLowerCase() === name.toLowerCase()
        )?.value ?? ''
    );
}

async function sendRequest() {
    requestErrorMessage.value = '';
    responseState.value = null;

    if (missingRequiredPathParams.value.length > 0) {
        requestErrorMessage.value =
            '缺少必填路径参数：' + missingRequiredPathParams.value.join(', ');
        return;
    }

    if (authMode.value === 'apiKey' && !sharedApiKey.value.trim()) {
        requestErrorMessage.value = '使用 API Key 模式时必须填写密钥。';
        return;
    }

    isLoading.value = true;

    try {
        const response = await fetch(requestUrl.value, {
            method: props.endpoint.method.toUpperCase(),
            credentials: getExecutionCredentials(),
            headers: buildExecutionHeaders(),
            body:
                supportsRequestBody.value && requestBodyText.value.trim()
                    ? requestBodyText.value
                    : undefined
        });

        const rawBody = await response.text();
        const contentType = response.headers.get('content-type') ?? '';
        let formattedBody = rawBody;

        if (contentType.includes('application/json')) {
            try {
                formattedBody = JSON.stringify(JSON.parse(rawBody), null, 4);
            } catch {
                formattedBody = rawBody;
            }
        }

        responseState.value = {
            status: response.status,
            statusText: response.statusText,
            contentType,
            headers: [...response.headers.entries()]
                .map(([name, value]) => ({
                    name,
                    value
                }))
                .sort((left, right) => left.name.localeCompare(right.name)),
            body: formattedBody || '(空响应体)'
        };
    } catch (error) {
        requestErrorMessage.value =
            error instanceof Error ? error.message : String(error);
    } finally {
        isLoading.value = false;
    }
}
</script>
