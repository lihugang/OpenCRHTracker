<template>
    <div
        class="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-slate-600">
        <NuxtLink
            to="/"
            class="cursor-pointer transition hover:text-crh-blue">
            Open CRH Tracker
        </NuxtLink>

        <a
            :href="commitUrl"
            class="inline-flex items-center gap-1 font-mono text-[13px] text-[#94A3B8] underline underline-offset-4 transition hover:text-crh-blue"
            rel="noreferrer"
            target="_blank">
            <img
                :src="githubIcon"
                alt="GitHub"
                class="h-3.5 w-3.5" />
            {{ shortCommitId }}
        </a>

        <NuxtLink
            to="/docs"
            class="text-[13px] text-[#94A3B8] transition hover:cursor-pointer hover:text-crh-blue hover:underline hover:underline-offset-4">
            文档
        </NuxtLink>

        <NuxtLink
            to="/about"
            class="text-[13px] text-[#94A3B8] transition hover:cursor-pointer hover:text-crh-blue hover:underline hover:underline-offset-4">
            关于
        </NuxtLink>

        <NuxtLink
            to="/feedback"
            class="text-[13px] text-[#94A3B8] transition hover:cursor-pointer hover:text-crh-blue hover:underline hover:underline-offset-4">
            反馈
        </NuxtLink>
    </div>
</template>

<script setup lang="ts">
import githubIcon from '~/assets/svg/github.svg';
import commitId from '~/utils/meta/commit';

const shortCommitId = commitId.slice(0, 7);
const commitUrl =
    'https://github.com/lihugang/OpenCRHTracker/commit/' + commitId;
</script>
