<template>
    <component
        :is="isMobile ? UiBottomSheet : UiModal"
        :model-value="modelValue"
        eyebrow="GUIDE"
        title="提问的智慧"
        size="lg"
        @update:model-value="emit('update:modelValue', $event)">
        <div class="space-y-4">
            <div
                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                <p class="font-semibold text-slate-900">
                    以下内容删改自《提问的智慧》，请在提交反馈前完整阅读。
                </p>
                <p class="mt-2">
                    本指南用于帮助你更高质量地提交反馈，不代表本页面提供额外人工支持服务。
                </p>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                    FULL TEXT
                </p>
                <a
                    :href="sourceUrl"
                    target="_blank"
                    rel="noreferrer"
                    class="text-sm font-medium text-crh-blue underline underline-offset-4 transition hover:text-slate-900">
                    在 GitHub 查看原文
                </a>
            </div>

            <div
                class="rounded-[1.2rem] border border-slate-200 bg-white/90 px-5 py-5">
                <article
                    ref="articleRef"
                    class="feedback-smart-questions text-sm leading-7 text-slate-700"
                    @click="handleArticleClick"
                    v-html="smartQuestionsHtml" />
            </div>
        </div>
    </component>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import UiBottomSheet from '~/components/ui/UiBottomSheet.vue';
import UiModal from '~/components/ui/UiModal.vue';
import smartQuestionsHtml from '~/assets/text/feedback/smart-questions-zh_CN.html?raw';

defineProps<{
    modelValue: boolean;
    isMobile: boolean;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const articleRef = ref<HTMLElement | null>(null);

function findInternalAnchorTarget(rawId: string) {
    const article = articleRef.value;
    if (!article) {
        return null;
    }

    return (
        Array.from(article.querySelectorAll<HTMLElement>('[id]')).find(
            (element) => element.id === rawId
        ) ?? null
    );
}

function handleArticleClick(event: MouseEvent) {
    const article = articleRef.value;
    const target = event.target;
    if (!article || !(target instanceof Element)) {
        return;
    }

    const anchor = target.closest('a');
    if (!(anchor instanceof HTMLAnchorElement) || !article.contains(anchor)) {
        return;
    }

    const href = anchor.getAttribute('href')?.trim() ?? '';
    if (!href.startsWith('#') || href === '#') {
        return;
    }

    const targetId = decodeURIComponent(href.slice(1));
    const targetElement = findInternalAnchorTarget(targetId);
    if (!targetElement) {
        return;
    }

    event.preventDefault();
    targetElement.scrollIntoView({
        block: 'start',
        behavior: 'smooth'
    });
}

const sourceUrl =
    'https://github.com/ryanhanwu/How-To-Ask-Questions-The-Smart-Way/blob/main/README-zh_CN.md';
</script>

<style scoped>
.feedback-smart-questions :deep(h1),
.feedback-smart-questions :deep(h2),
.feedback-smart-questions :deep(h3),
.feedback-smart-questions :deep(h4),
.feedback-smart-questions :deep(h5),
.feedback-smart-questions :deep(h6) {
    color: rgb(15 23 42);
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
}

.feedback-smart-questions :deep(h1) {
    font-size: 1.75rem;
    line-height: 2.25rem;
    margin-top: 0;
    scroll-margin-top: 1rem;
}

.feedback-smart-questions :deep(h2) {
    font-size: 1.35rem;
    line-height: 1.9rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgb(226 232 240);
    scroll-margin-top: 1rem;
}

.feedback-smart-questions :deep(h3) {
    font-size: 1.1rem;
    line-height: 1.75rem;
    scroll-margin-top: 1rem;
}

.feedback-smart-questions :deep(p),
.feedback-smart-questions :deep(blockquote),
.feedback-smart-questions :deep(pre),
.feedback-smart-questions :deep(ul),
.feedback-smart-questions :deep(ol),
.feedback-smart-questions :deep(hr) {
    margin-top: 0.9rem;
    margin-bottom: 0.9rem;
}

.feedback-smart-questions :deep(ul),
.feedback-smart-questions :deep(ol) {
    padding-left: 1.35rem;
}

.feedback-smart-questions :deep(ul) {
    list-style: disc;
}

.feedback-smart-questions :deep(ol) {
    list-style: decimal;
}

.feedback-smart-questions :deep(li) {
    margin-top: 0.35rem;
}

.feedback-smart-questions :deep(a) {
    color: rgb(0 82 155);
    text-decoration: underline;
    text-underline-offset: 0.18em;
}

.feedback-smart-questions :deep(code) {
    border: 1px solid rgb(226 232 240);
    background: rgb(248 250 252);
    border-radius: 0.4rem;
    padding: 0.1rem 0.35rem;
    font-size: 0.92em;
}

.feedback-smart-questions :deep(pre) {
    overflow-x: auto;
    border: 1px solid rgb(226 232 240);
    background: rgb(248 250 252);
    border-radius: 1rem;
    padding: 1rem 1rem;
}

.feedback-smart-questions :deep(pre code) {
    border: none;
    background: transparent;
    border-radius: 0;
    padding: 0;
}

.feedback-smart-questions :deep(blockquote) {
    border: 1px solid rgb(191 219 254);
    border-left: 5px solid rgb(0 82 155);
    background:
        linear-gradient(
            135deg,
            rgb(239 246 255 / 0.96),
            rgb(248 250 252 / 0.98)
        );
    border-radius: 0 1rem 1rem 0.95rem;
    padding: 0.95rem 1.1rem 0.95rem 1.2rem;
    color: rgb(51 65 85);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.85);
}

.feedback-smart-questions :deep(blockquote > :first-child) {
    margin-top: 0;
}

.feedback-smart-questions :deep(blockquote > :last-child) {
    margin-bottom: 0;
}

.feedback-smart-questions :deep(blockquote p) {
    color: inherit;
}

.feedback-smart-questions :deep(hr) {
    border: 0;
    border-top: 1px solid rgb(226 232 240);
}

.feedback-smart-questions :deep(img) {
    display: inline-block;
    max-width: 100%;
    height: auto;
}
</style>
