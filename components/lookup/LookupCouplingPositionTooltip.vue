<template>
    <span
        ref="triggerRef"
        :class="['inline-flex', triggerClass]"
        @mouseenter="openTooltip"
        @mouseleave="closeTooltip"
        @focusin="openTooltip"
        @focusout="closeTooltip"
        @keydown.esc="closeTooltip">
        <slot />
    </span>

    <Teleport to="body">
        <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="translate-y-1 opacity-0"
            enter-to-class="translate-y-0 opacity-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="translate-y-0 opacity-100"
            leave-to-class="translate-y-1 opacity-0">
            <span
                v-if="isOpen"
                ref="tooltipRef"
                role="tooltip"
                :style="tooltipStyle"
                class="pointer-events-none fixed z-[120] whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
                {{ label }}
            </span>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import {
    computed,
    nextTick,
    onBeforeUnmount,
    ref,
    watch,
    type CSSProperties
} from 'vue';

const props = withDefaults(
    defineProps<{
        label: string;
        disabled?: boolean;
        triggerClass?: string;
    }>(),
    {
        disabled: false,
        triggerClass: ''
    }
);

const VIEWPORT_GAP_PX = 8;
const TOOLTIP_OFFSET_PX = 8;

const triggerRef = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const tooltipLeft = ref(0);
const tooltipTop = ref(0);

const tooltipStyle = computed<CSSProperties>(() => ({
    left: `${tooltipLeft.value}px`,
    top: `${tooltipTop.value}px`
}));

function updatePosition() {
    if (!triggerRef.value || !tooltipRef.value) {
        return;
    }

    const triggerRect = triggerRef.value.getBoundingClientRect();
    const tooltipRect = tooltipRef.value.getBoundingClientRect();
    const centeredLeft =
        triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    tooltipLeft.value = Math.min(
        Math.max(centeredLeft, VIEWPORT_GAP_PX),
        window.innerWidth - tooltipRect.width - VIEWPORT_GAP_PX
    );

    const belowTop = triggerRect.bottom + TOOLTIP_OFFSET_PX;
    tooltipTop.value =
        belowTop + tooltipRect.height <= window.innerHeight - VIEWPORT_GAP_PX
            ? belowTop
            : triggerRect.top - tooltipRect.height - TOOLTIP_OFFSET_PX;
}

function addPositionListeners() {
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
}

function removePositionListeners() {
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition, true);
}

async function openTooltip() {
    if (props.disabled) {
        return;
    }

    isOpen.value = true;
    addPositionListeners();
    await nextTick();
    updatePosition();
}

function closeTooltip() {
    isOpen.value = false;
    removePositionListeners();
}

watch(
    () => props.disabled,
    (disabled) => {
        if (disabled) {
            closeTooltip();
        }
    }
);

onBeforeUnmount(removePositionListeners);
</script>
