<template>
    <DocsShell
        eyebrow="DOCS"
        title="API 文档"
        description="这套文档由仓库内维护的 OpenAPI 元数据驱动，包括鉴权接口、车次车组历史查询和每日数据导出。">
        <div
            class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <UiCard :show-accent-bar="false">
                <div class="space-y-3">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-crh-blue/80">
                        BASE PATH
                    </p>
                    <p class="text-sm leading-6 text-slate-600">
                        所有 API 接口都以
                    </p>

                    <p class="font-mono text-sm text-slate-700">
                        {{ apiConfig.versionPrefix }}
                    </p>

                    <p class="text-sm leading-6 text-slate-600">
                        作为基础路径。
                    </p>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-3">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-crh-blue/80">
                        AUTH
                    </p>
                    <p class="text-sm leading-6 text-slate-600">
                        除鉴权和每日数据导出外其他接口都允许匿名访问和使用 API
                        Key 访问。请打开用户页，切换选项卡至“开发”页，轻击“签发”按钮以获取您的
                        API Key。
                    </p>
                    <p class="font-mono text-xs text-slate-500">
                        API Key 请求头：{{ apiConfig.apiKeyHeader }}
                    </p>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-3">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-crh-blue/80">
                        API TOKEN
                    </p>
                    <p class="text-sm leading-6 text-slate-600">
                        每次响应都可能通过响应头返回剩余额度、请求耗额和重试等待时间。
                        请注意的是，由于大部分查询接口都使用了 Cloudflare
                        的缓存层，具体配额使用情况请以鉴权接口返回的结果为准。
                    </p>
                    <div class="space-y-2 font-mono text-xs text-slate-500">
                        <p>{{ apiConfig.headers.remain }}</p>
                        <p>{{ apiConfig.headers.cost }}</p>
                        <p>{{ apiConfig.headers.retryAfter }}</p>
                    </div>
                </div>
            </UiCard>
        </div>

        <UiCard :show-accent-bar="false">
            <div class="space-y-4">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.2em] text-crh-blue/80">
                        AGREEMENT
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        统一响应结构
                    </h2>
                    <p class="text-sm leading-6 text-slate-600">
                        成功的 JSON 响应统一使用 ok、data、error
                        这层包装；支持分页的查询接口还会额外使用 limit 和
                        cursor。
                    </p>
                </div>

                <DocsCodeBlock :code="responseEnvelopeExample" />
            </div>
        </UiCard>

        <div
            v-for="group in groups"
            :key="group.key"
            class="space-y-4">
            <div class="px-1">
                <h2 class="text-2xl font-semibold text-slate-900">
                    {{ group.label }}
                </h2>
                <p class="mt-2 text-sm leading-6 text-slate-600">
                    {{ group.description }}
                </p>
            </div>

            <div class="grid gap-4">
                <UiCard
                    v-for="endpoint in group.endpoints"
                    :key="endpoint.slug"
                    :show-accent-bar="false">
                    <div class="space-y-4">
                        <div
                            class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                            <div class="min-w-0 space-y-2">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span
                                        class="inline-flex rounded-full border border-crh-blue/20 bg-blue-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-crh-blue">
                                        {{ endpoint.method }}
                                    </span>
                                    <code
                                        class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                                        {{
                                            apiConfig.versionPrefix +
                                            endpoint.path
                                        }}
                                    </code>
                                </div>
                                <h3
                                    class="text-xl font-semibold text-slate-900">
                                    {{ endpoint.summary }}
                                </h3>
                                <p class="text-sm leading-6 text-slate-600">
                                    {{ endpoint.description }}
                                </p>
                            </div>

                            <NuxtLink
                                :to="'/docs/api/' + endpoint.slug"
                                class="shrink-0 md:self-start">
                                <UiButton
                                    variant="secondary"
                                    class="whitespace-nowrap">
                                    查看接口
                                </UiButton>
                            </NuxtLink>
                        </div>

                        <div class="flex flex-wrap gap-2">
                            <span
                                v-for="
                                    label in getDocsVisibleAuthModeLabels(
                                        endpoint.authModes
                                    )
                                "
                                :key="endpoint.slug + ':mode:' + label"
                                class="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                                {{ label }}
                            </span>
                            <span
                                v-for="scope in endpoint.requiredScopes"
                                :key="endpoint.slug + ':scope:' + scope"
                                class="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-xs text-slate-600">
                                {{ scope }}
                            </span>
                        </div>

                        <p
                            v-if="getEndpointCostSummary(endpoint)"
                            class="text-sm leading-6 text-slate-600">
                            {{ getEndpointCostSummary(endpoint) }}
                        </p>
                    </div>
                </UiCard>
            </div>
        </div>
    </DocsShell>
</template>

<script setup lang="ts">
import useDocsApiRuntimeConfig from '~/composables/useDocsApiRuntimeConfig';
import {
    getDocsApiCostDisplay,
    getDocsVisibleAuthModeLabels,
    listDocsApiGroups
} from '~/utils/docs/apiDocs';
import type { DocsApiEndpoint } from '~/types/docs';

const groups = listDocsApiGroups();
const { data: apiConfig } = await useDocsApiRuntimeConfig();
const responseEnvelopeExample = [
    '{',
    '    "ok": true,',
    '    "data": {},',
    '    "error": ""',
    '}'
].join('\n');

function getEndpointCostSummary(endpoint: DocsApiEndpoint) {
    return getDocsApiCostDisplay(endpoint, apiConfig.value)?.summary ?? '';
}

definePageMeta({
    pageTransition: {
        name: 'docs-page',
        mode: 'out-in'
    }
});

useSiteSeo({
    title: 'API 文档 | Open CRH Tracker',
    description:
        'OpenCRHTracker API 文档，提供会话、记录、历史和导出接口的文档和实时调试功能。',
    path: '/docs/api'
});
</script>
