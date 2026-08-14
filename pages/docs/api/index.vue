<template>
    <DocsShell
        eyebrow="文档"
        title="API 文档"
        description="面向开发者的 v2 API 文档，覆盖鉴权、每日记录、历史查询、时刻表、配属与导出接口，并附带可交互的调试器。">
        <UiCard :show-accent-bar="false">
            <div class="space-y-6">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.2em] text-crh-blue/80">
                        接口约定
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        调用前先看这里
                    </h2>
                    <p class="text-sm leading-6 text-slate-600">
                        在调用下面的接口之前，先花一分钟了解这些约定，可以少踩很多坑。
                    </p>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                    <div
                        v-for="item in basics"
                        :key="item.title"
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                        <p class="text-sm font-semibold text-slate-900">
                            {{ item.title }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-slate-600">
                            <template v-if="item.title === '基础路径'">
                                所有 v2 接口都以
                                <code
                                    class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                                    {{ apiConfig.versionPrefix }}
                                </code>
                                作为基础路径，页面里展示的接口路径会自动拼接上前缀。
                            </template>
                            <template v-else>
                                {{ item.description }}
                                <NuxtLink
                                    v-if="item.linkTo"
                                    :to="item.linkTo"
                                    class="font-semibold text-crh-blue transition hover:text-slate-900">
                                    {{ item.linkText }}
                                </NuxtLink>
                                <span v-if="item.linkTo">。</span>
                            </template>
                        </p>
                    </div>
                </div>

                <div class="grid gap-4 xl:grid-cols-2">
                    <DocsCodeBlock :code="responseEnvelopeExample" />
                    <DocsCodeBlock :code="responseErrorExample" />
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                    <div
                        v-for="item in conventions"
                        :key="item.title"
                        class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-4">
                        <p class="text-sm font-semibold text-slate-900">
                            {{ item.title }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-slate-600">
                            {{ item.description }}
                        </p>
                    </div>
                </div>

                <p class="text-sm leading-6 text-slate-600">
                    如果你想直接用程序读取这份文档（例如接入 AI
                    工具或自动生成客户端），可以下载
                    <a
                        href="/docs/api/openapi.json"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="font-semibold text-crh-blue transition hover:text-slate-900">
                        openapi.json
                    </a>
                    ，它是与页面同源的 OpenAPI 3.1 规范文件。
                </p>
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
                                v-for="label in getDocsVisibleAuthModeLabels(
                                    endpoint.authModes
                                )"
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
    '    "meta": {',
    '        "remain": 199,',
    '        "cost": 1',
    '    },',
    '    "data": {}',
    '}'
].join('\n');
const responseErrorExample = [
    '{',
    '    "meta": {',
    '        "remain": 199,',
    '        "cost": 1',
    '    },',
    '    "error": {',
    '        "code": "invalid_param",',
    '        "message": "date 必须使用 YYYYMMDD 格式。"',
    '    }',
    '}'
].join('\n');
const basics = [
    {
        title: '基础路径',
        description: ''
    },
    {
        title: '鉴权方式',
        description:
            '大部分查询接口支持匿名访问；需要读取账户信息或更高额度的接口，使用 API Key 或登录会话。API Key 通过 ' +
            apiConfig.value.apiKeyHeader +
            ' 请求头以 Bearer 方式传递，在用户页的“开发”页即可签发。第三方应用接入登录流程请看',
        linkTo: '/docs/oauth',
        linkText: 'OAuth 文档'
    },
    {
        title: '额度与响应头',
        description:
            '游客默认上限 ' +
            apiConfig.value.quota.anonymousMaxTokens +
            ' 点，登录用户默认上限 ' +
            apiConfig.value.quota.userMaxTokens +
            ' 点，同一用户的所有 API Key 共享同一份额度；额度每 ' +
            apiConfig.value.quota.refillIntervalSeconds +
            ' 秒恢复 ' +
            apiConfig.value.quota.refillAmount +
            ' 点。每次响应的 meta 字段和响应头（' +
            apiConfig.value.headers.remain +
            '、' +
            apiConfig.value.headers.cost +
            '、' +
            apiConfig.value.headers.retryAfter +
            '）都会带上剩余额度、本次扣费和重试等待时间。'
    },
    {
        title: '响应结构',
        description:
            '成功时返回 meta + data，失败时返回 meta + error（包含 code 和 message）。支持分页的接口还会返回 cursor、limit 和 nextCursor。'
    }
];
const conventions = [
    {
        title: '字段命名',
        description: 'JSON 字段统一使用小驼峰命名，例如 serviceDayStart。'
    },
    {
        title: '可选字段会省略',
        description:
            '没有数据的可选字段会直接不返回，而不是返回空值；普通字段则总是返回默认值（0、空字符串、false 或空数组）。'
    },
    {
        title: '64 位整数按数字返回',
        description:
            '时间戳等 64 位整数字段会以数字形式返回。日常使用没有问题，但如果数值超过 2^53，需要注意精度。'
    },
    {
        title: '分页方式',
        description:
            '分页接口用 cursor 翻页：第一页不传 cursor，之后把上一页的 nextCursor 原样传回。limit 不传时默认 20，上限 200。'
    },
    {
        title: '原始文件下载',
        description:
            '交路图和日导出文件支持 binary=true 直接返回原始内容（PNG/PDF/CSV），否则返回 JSON 包装结构。'
    }
];

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
        'OpenCRHTracker API 文档，提供鉴权、记录、历史、时刻表和导出接口的文档与实时调试功能。',
    path: '/docs/api'
});
</script>
