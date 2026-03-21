<template>
    <DocsShell
        eyebrow="DOCS"
        title="文档"
        description="">
        <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <UiCard variant="accent">
                <div class="space-y-5">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.24em] text-crh-blue/80">
                            DEPLOY
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            私有部署
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            在自己的服务器上部署 Open CRH Tracker 项目。
                        </p>
                    </div>

                    <ul class="space-y-2 text-sm leading-6 text-slate-600">
                        <li
                            v-for="item in deployChecklist"
                            :key="item"
                            class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-3">
                            {{ item }}
                        </li>
                    </ul>

                    <NuxtLink to="/docs/deploy">
                        <UiButton> 查看部署文档 </UiButton>
                    </NuxtLink>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-5">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.24em] text-crh-blue/80">
                            API
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            API 文档
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            将你的 App 和 AI 连接上 Open CRH Tracker。
                        </p>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-2">
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/90 px-4 py-4">
                            <p
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                接口数量
                            </p>
                            <p
                                class="mt-2 text-3xl font-semibold text-slate-900">
                                {{ endpointCount }}
                            </p>
                        </div>
                        <div
                            class="rounded-[1rem] border border-slate-200 bg-slate-50/90 px-4 py-4">
                            <p
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                分组数量
                            </p>
                            <p
                                class="mt-2 text-3xl font-semibold text-slate-900">
                                {{ groupCount }}
                            </p>
                        </div>
                    </div>

                    <NuxtLink to="/docs/api">
                        <UiButton> 查看 API 文档 </UiButton>
                    </NuxtLink>
                </div>
            </UiCard>
        </div>
    </DocsShell>
</template>

<script setup lang="ts">
import { listDocsApiEndpoints, listDocsApiGroups } from '~/utils/docs/apiDocs';
import { deployChecklist } from '~/utils/docs/deployDocs';

const endpointCount = listDocsApiEndpoints().length;
const groupCount = listDocsApiGroups().length;

definePageMeta({
    pageTransition: {
        name: 'docs-page',
        mode: 'out-in'
    }
});

useHead({
    title: '开发者文档 | Open CRH Tracker',
    meta: [
        {
            name: 'description',
            content:
                'Open CRH Tracker 的开发者文档，包含私有部署说明和 API 使用说明。'
        }
    ]
});
</script>
