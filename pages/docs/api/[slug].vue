<template>
    <DocsShell
        eyebrow="DOCS"
        :title="endpoint.summary"
        :description="endpoint.description">
        <UiCard variant="accent">
            <div class="space-y-4">
                <div
                    class="flex min-w-0 flex-wrap items-start justify-between gap-4">
                    <div class="min-w-0 space-y-4">
                        <NuxtLink
                            to="/docs/api"
                            class="inline-flex items-center gap-2 text-sm font-medium text-crh-blue transition hover:text-slate-900">
                            <span aria-hidden="true">&larr;</span>
                            返回 API 列表
                        </NuxtLink>

                        <div class="space-y-3">
                            <div class="flex flex-wrap items-center gap-2">
                                <span
                                    class="inline-flex rounded-full border border-crh-blue/20 bg-blue-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-crh-blue">
                                    {{ endpoint.method }}
                                </span>
                                <code
                                    class="max-w-full break-all rounded-full bg-white/90 px-3 py-1 text-xs text-slate-700">
                                    {{
                                        apiConfig.versionPrefix + endpoint.path
                                    }}
                                </code>
                            </div>

                            <div class="flex flex-wrap gap-2">
                                <span
                                    v-for="mode in endpoint.authModes"
                                    :key="endpoint.slug + ':mode:' + mode"
                                    class="inline-flex rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
                                    {{ mode }}
                                </span>
                                <span
                                    v-for="scope in endpoint.requiredScopes"
                                    :key="endpoint.slug + ':scope:' + scope"
                                    class="inline-flex max-w-full break-all rounded-full border border-white/70 bg-white/80 px-3 py-1 font-mono text-xs text-slate-700">
                                    {{ scope }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <UiButton
                        class="shrink-0"
                        @click="isPlaygroundOpen = true">
                        试一试
                    </UiButton>
                </div>
            </div>
        </UiCard>

        <div class="space-y-6">
            <UiCard :show-accent-bar="false">
                <div class="space-y-5">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-medium uppercase tracking-[0.2em] text-crh-blue/80">
                            请求说明
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            参数
                        </h2>
                    </div>

                    <template v-if="parameterGroups.path.length > 0">
                        <div class="space-y-3">
                            <h3 class="text-sm font-medium text-slate-900">
                                路径参数
                            </h3>
                            <div
                                v-for="parameter in parameterGroups.path"
                                :key="'path:' + parameter.name"
                                class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-4">
                                <div class="flex flex-wrap items-center gap-3">
                                    <span
                                        class="font-mono text-sm font-semibold text-crh-blue">
                                        {{ parameter.name }}
                                    </span>
                                    <span
                                        class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                                        {{
                                            formatSchemaType(
                                                resolveParameterSchema(
                                                    parameter
                                                )
                                            )
                                        }}
                                    </span>
                                    <span
                                        v-if="parameter.required"
                                        class="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-crh-blue">
                                        必填
                                    </span>
                                </div>
                                <p
                                    class="mt-3 text-sm leading-6 text-slate-600">
                                    {{ parameter.description || '暂无说明。' }}
                                </p>
                                <p
                                    v-if="parameter.example !== undefined"
                                    class="mt-3 font-mono text-xs text-slate-500">
                                    示例：{{ parameter.example }}
                                </p>
                            </div>
                        </div>
                    </template>

                    <template v-if="parameterGroups.query.length > 0">
                        <div class="space-y-3">
                            <h3 class="text-sm font-semibold text-slate-900">
                                查询参数
                            </h3>
                            <div
                                v-for="parameter in parameterGroups.query"
                                :key="'query:' + parameter.name"
                                class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-4">
                                <div class="flex flex-wrap items-center gap-3">
                                    <span
                                        class="font-mono text-sm font-semibold text-crh-blue">
                                        {{ parameter.name }}
                                    </span>
                                    <span
                                        class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                                        {{
                                            formatSchemaType(
                                                resolveParameterSchema(
                                                    parameter
                                                )
                                            )
                                        }}
                                    </span>
                                    <span
                                        v-if="parameter.required"
                                        class="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-crh-blue">
                                        必填
                                    </span>
                                </div>
                                <p
                                    class="mt-3 text-sm leading-6 text-slate-600">
                                    {{ parameter.description || '暂无说明。' }}
                                </p>
                                <p
                                    v-if="parameter.example !== undefined"
                                    class="mt-3 font-mono text-xs text-slate-500">
                                    示例：{{ parameter.example }}
                                </p>
                            </div>
                        </div>
                    </template>

                    <template v-if="parameterGroups.header.length > 0">
                        <div class="space-y-3">
                            <h3 class="text-sm font-semibold text-slate-900">
                                请求头参数
                            </h3>
                            <div
                                v-for="parameter in parameterGroups.header"
                                :key="'header:' + parameter.name"
                                class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-4">
                                <div class="flex flex-wrap items-center gap-3">
                                    <span
                                        class="font-mono text-sm font-semibold text-crh-blue">
                                        {{ parameter.name }}
                                    </span>
                                    <span
                                        class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                                        {{
                                            formatSchemaType(
                                                resolveParameterSchema(
                                                    parameter
                                                )
                                            )
                                        }}
                                    </span>
                                    <span
                                        v-if="parameter.required"
                                        class="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-crh-blue">
                                        必填
                                    </span>
                                </div>
                                <p
                                    class="mt-3 text-sm leading-6 text-slate-600">
                                    {{ parameter.description || '暂无说明。' }}
                                </p>
                                <p
                                    v-if="parameter.example !== undefined"
                                    class="mt-3 font-mono text-xs text-slate-500">
                                    示例：{{ parameter.example }}
                                </p>
                            </div>
                        </div>
                    </template>

                    <UiEmptyState
                        v-if="
                            parameterGroups.path.length === 0 &&
                            parameterGroups.query.length === 0 &&
                            parameterGroups.header.length === 0
                        "
                        title="当前接口没有额外请求参数"
                        description="" />
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-5">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-medium uppercase tracking-[0.2em] text-crh-blue/80">
                            响应说明
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            状态码与响应格式
                        </h2>
                    </div>

                    <div
                        v-for="response in endpoint.responses"
                        :key="response.statusCode"
                        class="space-y-4 rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-4">
                        <div class="flex flex-wrap items-center gap-3">
                            <span
                                class="inline-flex rounded-full border px-3 py-1 text-xs font-medium"
                                :class="
                                    Number(response.statusCode) >= 200 &&
                                    Number(response.statusCode) < 300
                                        ? 'border-status-running/20 bg-status-running/10 text-status-running'
                                        : 'border-status-delayed/20 bg-status-delayed/10 text-status-delayed'
                                ">
                                {{ response.statusCode }}
                            </span>
                            <p class="text-sm font-medium text-slate-900">
                                {{ response.description }}
                            </p>
                        </div>

                        <div
                            v-if="response.headers.length > 0"
                            class="space-y-2">
                            <p class="text-sm font-semibold text-slate-900">
                                响应头
                            </p>
                            <div class="flex flex-wrap gap-2">
                                <span
                                    v-for="header in response.headers"
                                    :key="
                                        response.statusCode + ':' + header.name
                                    "
                                    class="break-all rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-xs text-slate-600">
                                    {{ header.name }}
                                </span>
                            </div>
                        </div>

                        <div
                            v-for="content in response.content"
                            :key="
                                response.statusCode + ':' + content.contentType
                            "
                            class="space-y-3">
                            <div class="flex flex-wrap items-center gap-3">
                                <span
                                    class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                                    {{ content.contentType }}
                                </span>
                                <span class="text-xs text-slate-500">
                                    {{ formatSchemaType(content.schema) }}
                                </span>
                            </div>

                            <div
                                v-if="content.schema"
                                class="space-y-2">
                                <p class="text-sm font-semibold text-slate-900">
                                    响应结构
                                </p>
                                <DocsCodeBlock
                                    :code="
                                        stringifyExample(
                                            describeSchema(content.schema)
                                        )
                                    "
                                    text-class="text-xs leading-6" />
                            </div>

                            <div
                                v-if="stringifyExample(content.example)"
                                class="space-y-2">
                                <p class="text-sm font-semibold text-slate-900">
                                    示例响应
                                </p>
                                <DocsCodeBlock
                                    :code="stringifyExample(content.example)"
                                    text-class="text-xs leading-6" />
                            </div>
                        </div>
                    </div>
                </div>
            </UiCard>
        </div>

        <UiModal
            :model-value="isPlaygroundOpen"
            eyebrow="DOCS"
            title="试一试"
            :description="
                '调试当前接口：' + apiConfig.versionPrefix + endpoint.path
            "
            size="lg"
            @update:model-value="handlePlaygroundVisibilityChange">
            <DocsApiPlayground
                :endpoint="endpoint"
                :runtime-config="apiConfig" />
        </UiModal>
    </DocsShell>
</template>

<script setup lang="ts">
import { createError } from 'h3';
import { ref } from 'vue';
import useDocsApiRuntimeConfig from '~/composables/useDocsApiRuntimeConfig';
import {
    describeSchema,
    formatSchemaType,
    getDocsApiEndpointBySlug,
    getDocsParameterGroups,
    stringifyExample
} from '~/utils/docs/apiDocs';
import type { OpenApiParameter } from '~/types/docs';

const route = useRoute();
const slug = typeof route.params.slug === 'string' ? route.params.slug : '';

const endpoint = getDocsApiEndpointBySlug(slug);

if (!endpoint) {
    throw createError({
        statusCode: 404,
        statusMessage: '未找到对应的 API 文档。'
    });
}

const isPlaygroundOpen = ref(false);
const parameterGroups = getDocsParameterGroups(endpoint);
const { data: apiConfig } = await useDocsApiRuntimeConfig();

function resolveParameterSchema(parameter: OpenApiParameter) {
    return parameter.schema && '$ref' in parameter.schema
        ? undefined
        : parameter.schema;
}

function handlePlaygroundVisibilityChange(nextValue: boolean) {
    isPlaygroundOpen.value = nextValue;
}

definePageMeta({
    pageTransition: {
        name: 'docs-page',
        mode: 'out-in'
    }
});

useSiteSeo({
    title: endpoint.summary + ' | API 文档 | Open CRH Tracker',
    description: endpoint.description,
    path: '/docs/api/' + endpoint.slug,
    type: 'article'
});
</script>
