<template>
    <DocsShell
        eyebrow="文档"
        title="API 文档"
        description="面向开发者的 v2 API 文档，覆盖鉴权、每日记录、历史查询、时刻表、配属与导出接口，并附带可交互的调试器。">
        <div
            class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <UiCard :show-accent-bar="false">
                <div class="space-y-3">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-crh-blue/80">
                        基础路径
                    </p>
                    <p class="text-sm leading-6 text-slate-600">
                        所有 v2 API 接口都以
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
                        鉴权方式
                    </p>
                    <p class="text-sm leading-6 text-slate-600">
                        大部分查询接口默认都支持匿名访问；需要读取账户信息或更高额度的接口，则使用
                        API Key
                        或登录会话。请打开用户页并切换到“开发”页，点击“签发”按钮获取您的
                        API Key。
                    </p>
                    <p class="font-mono text-xs text-slate-500">
                        API Key 请求头：{{ apiConfig.apiKeyHeader }}
                    </p>
                    <p class="text-sm leading-6 text-slate-600">
                        如果你要让第三方应用接入用户登录流程，请阅读
                        <NuxtLink
                            to="/docs/oauth"
                            class="font-semibold text-crh-blue transition hover:text-slate-900">
                            OAuth 文档
                        </NuxtLink>
                        。
                    </p>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-3">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-crh-blue/80">
                        额度响应头
                    </p>
                    <p class="text-sm leading-6 text-slate-600">
                        每次响应都可能通过响应头返回剩余额度、本次扣费和重试等待时间；
                        响应体里的 meta
                        字段也会带上同样的信息。由于大部分查询接口都使用了
                        Cloudflare
                        的缓存层，具体配额使用情况请以鉴权接口返回的结果为准。
                    </p>
                    <div class="space-y-2 font-mono text-xs text-slate-500">
                        <p>{{ apiConfig.headers.remain }}</p>
                        <p>{{ apiConfig.headers.cost }}</p>
                        <p>{{ apiConfig.headers.retryAfter }}</p>
                    </div>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-3">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-crh-blue/80">
                        访问额度
                    </p>
                    <p class="text-sm leading-6 text-slate-600">
                        游客默认可用额度上限为
                        {{ apiConfig.quota.anonymousMaxTokens }}
                        点，登录用户默认可用额度上限为
                        {{ apiConfig.quota.userMaxTokens }}
                        点。同一用户下签发的所有 API Key
                        都共享同一份用户级额度，切换 Key
                        不会额外增加额度。额度会按配置的恢复周期自动补充，默认每
                        {{ apiConfig.quota.refillIntervalSeconds }} 秒恢复
                        {{ apiConfig.quota.refillAmount }}
                        点，补充后不会超过当前用户上限。如果默认额度不够，你可以在反馈里说明需求，向管理员申请更多额度。
                    </p>
                </div>
            </UiCard>
        </div>

        <UiCard :show-accent-bar="false">
            <div class="space-y-4">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.2em] text-crh-blue/80">
                        响应约定
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        v2 统一响应结构
                    </h2>
                    <p class="text-sm leading-6 text-slate-600">
                        v2 的成功响应统一使用 meta + data 这层包装，失败时返回
                        meta + error（包含 code 和 message）；不再使用 v1 的 ok
                        字段。 支持分页的查询接口还会额外返回 cursor、limit 和
                        nextCursor。
                    </p>
                </div>

                <DocsCodeBlock :code="responseEnvelopeExample" />
                <DocsCodeBlock :code="responseErrorExample" />
            </div>
        </UiCard>

        <UiCard :show-accent-bar="false">
            <div class="space-y-5">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.2em] text-crh-blue/80">
                        约定
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        v2 接口约定
                    </h2>
                    <p class="text-sm leading-6 text-slate-600">
                        在调用下面的接口之前，先花一分钟了解这些约定，可以少踩很多坑。
                    </p>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                    <div
                        v-for="item in conventions"
                        :key="item.title"
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
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
const conventions = [
    {
        title: '基础路径',
        description:
            '所有接口都以 ' +
            apiConfig.value.versionPrefix +
            ' 开头，文档里展示的路径会自动拼接上前缀。'
    },
    {
        title: '字段命名',
        description:
            'JSON 字段统一使用小驼峰命名，例如 serviceDayStart；不要使用 v1 的下划线命名。'
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
