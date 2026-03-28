<template>
    <NuxtLink
        v-if="isClickable"
        v-bind="rootAttrs"
        :to="target"
        :class="resolvedClass">
        {{ displayText }}
    </NuxtLink>
    <span
        v-else
        v-bind="rootAttrs"
        :class="resolvedClass">
        {{ displayText }}
    </span>
</template>

<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { buildLookupPath } from '~/utils/lookup/lookupTarget';

defineOptions({
    inheritAttrs: false
});

const props = withDefaults(
    defineProps<{
        stationName: string;
        currentStationName?: string;
        fallbackText?: string;
        focusTrainCodes?: string[];
    }>(),
    {
        currentStationName: '',
        fallbackText: '--'
    }
);

const attrs = useAttrs();

const normalizedStationName = computed(() => props.stationName.trim());
const normalizedCurrentStationName = computed(() =>
    props.currentStationName.trim()
);
const normalizedFocusTrainCodes = computed(() =>
    Array.from(
        new Set(
            (props.focusTrainCodes ?? [])
                .map((code) => code.trim().toUpperCase())
                .filter((code) => code.length > 0)
        )
    )
);

const isClickable = computed(() => {
    return (
        normalizedStationName.value.length > 0 &&
        normalizedStationName.value !== normalizedCurrentStationName.value
    );
});

const target = computed(() => {
    const path = buildLookupPath({
        type: 'station',
        code: normalizedStationName.value
    });

    if (normalizedFocusTrainCodes.value.length === 0) {
        return path;
    }

    return {
        path,
        query: {
            focusTrain: normalizedFocusTrainCodes.value
        }
    };
});

const displayText = computed(() => {
    return normalizedStationName.value || props.fallbackText;
});

const rootAttrs = computed(() => {
    const { class: _class, ...rest } = attrs;
    return rest;
});

const resolvedClass = computed(() => {
    return [
        attrs.class,
        isClickable.value ? 'cursor-pointer transition hover:underline' : null
    ];
});
</script>
