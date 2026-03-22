<template>
    <DocsShell
        eyebrow="DEPLOY"
        title="部署 Open CRH Tracker"
        description="">
        <UiCard :show-accent-bar="false">
            <div class="space-y-4">
                <p
                    class="text-xs font-semibold uppercase tracking-[0.24em] text-crh-blue/80">
                    DEPLOY
                </p>
                <div class="grid gap-3 md:grid-cols-2">
                    <div
                        v-for="item in deployChecklist"
                        :key="item"
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-700">
                        {{ item }}
                    </div>
                </div>
            </div>
        </UiCard>

        <UiCard
            v-for="section in deployDocsSections"
            :key="section.id"
            :show-accent-bar="false">
            <div class="space-y-5">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.24em] text-crh-blue/80">
                        {{ section.id }}
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        {{ section.title }}
                    </h2>
                    <p class="text-sm leading-6 text-slate-600">
                        {{ section.summary }}
                    </p>
                </div>

                <div class="space-y-4">
                    <template
                        v-for="(block, index) in section.blocks"
                        :key="section.id + ':' + index">
                        <p
                            v-if="block.type === 'paragraph'"
                            class="text-sm leading-7 text-slate-600">
                            {{ block.text }}
                        </p>

                        <div
                            v-else-if="block.type === 'linked-paragraph'"
                            class="rounded-[1rem] border border-crh-blue/15 bg-blue-50/70 px-4 py-4 text-sm leading-7 text-slate-700">
                            <span>{{ block.textBefore }}</span>
                            <NuxtLink
                                :to="block.to ?? '/docs/crawl'"
                                class="font-semibold text-crh-blue transition hover:text-slate-900">
                                {{ block.linkText }}
                            </NuxtLink>
                            <span>{{ block.textAfter }}</span>
                        </div>

                        <div
                            v-else-if="block.type === 'list'"
                            class="space-y-3">
                            <p
                                v-if="block.title"
                                class="text-sm font-semibold text-slate-900">
                                {{ block.title }}
                            </p>
                            <ul
                                class="space-y-2 text-sm leading-6 text-slate-600">
                                <li
                                    v-for="item in block.items"
                                    :key="item"
                                    class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-3">
                                    {{ item }}
                                </li>
                            </ul>
                        </div>

                        <div
                            v-else-if="block.type === 'code'"
                            class="space-y-3">
                            <p
                                v-if="block.title"
                                class="text-sm font-semibold text-slate-900">
                                {{ block.title }}
                            </p>
                            <DocsCodeBlock
                                :code="block.code ?? ''"
                                :text-class="
                                    block.language === 'json'
                                        ? 'text-xs leading-6'
                                        : 'text-sm leading-7'
                                " />
                        </div>

                        <div
                            v-else-if="block.type === 'field-cards'"
                            class="space-y-3">
                            <p
                                v-if="block.title"
                                class="text-sm font-semibold text-slate-900">
                                {{ block.title }}
                            </p>
                            <p
                                v-if="block.text"
                                class="text-sm leading-7 text-slate-600">
                                {{ block.text }}
                            </p>

                            <div class="grid gap-4 xl:grid-cols-2">
                                <div
                                    v-for="card in block.cards ?? []"
                                    :key="card.path"
                                    class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4">
                                    <div
                                        class="flex flex-wrap items-center gap-2">
                                        <code
                                            class="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs text-slate-700">
                                            {{ card.path }}
                                        </code>
                                        <span
                                            class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                                            {{ card.valueType }}
                                        </span>
                                        <span
                                            v-if="card.required"
                                            class="rounded-full border border-crh-blue/20 bg-blue-50 px-3 py-1 text-xs font-semibold text-crh-blue">
                                            必填
                                        </span>
                                    </div>

                                    <p
                                        class="mt-3 text-sm leading-6 text-slate-600">
                                        {{ card.description }}
                                    </p>

                                    <ul
                                        v-if="(card.notes ?? []).length > 0"
                                        class="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                                        <li
                                            v-for="note in card.notes ?? []"
                                            :key="card.path + ':' + note"
                                            class="rounded-[0.9rem] border border-slate-200 bg-slate-50/80 px-3 py-2">
                                            {{ note }}
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </UiCard>
    </DocsShell>
</template>

<script setup lang="ts">
import { deployChecklist, deployDocsSections } from '~/utils/docs/deployDocs';

definePageMeta({
    pageTransition: {
        name: 'docs-page',
        mode: 'out-in'
    }
});

useSiteSeo({
    title: '私有部署 | Open CRH Tracker',
    description:
        'Open CRH Tracker 私有部署文档，覆盖 config.json 配置、构建、运行与排障说明。',
    path: '/docs/deploy'
});
</script>
