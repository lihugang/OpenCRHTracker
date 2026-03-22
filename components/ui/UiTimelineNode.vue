<template>
    <div class="rail-track">
        <span class="rail-node rail-node--start" />
        <span class="rail-node rail-node--end" />

        <div class="space-y-5">
            <div>
                <p
                    class="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
                    始发
                </p>
                <p class="mt-1 text-sm font-medium text-crh-grey-dark">
                    {{ start }}
                </p>
            </div>

            <div>
                <p
                    class="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
                    终到
                </p>
                <p class="mt-1 text-sm font-medium text-crh-grey-dark">
                    {{ end }}
                </p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineProps<{
    start: string;
    end: string;
}>();
</script>
