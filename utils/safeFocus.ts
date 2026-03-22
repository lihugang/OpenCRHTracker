export type SafeFocusSource =
    | 'mount'
    | 'transition'
    | 'dialog-open'
    | 'state-change'
    | 'user-gesture'
    | 'keyboard-nav';

type SafeFocusSelection =
    | 'start'
    | 'end'
    | 'all'
    | {
          start: number;
          end: number;
          direction?: 'forward' | 'backward' | 'none';
      };

interface SafeFocusOptions {
    preventScroll?: boolean;
    source?: SafeFocusSource;
    scrollIntoView?: ScrollIntoViewOptions;
    selection?: SafeFocusSelection;
}

const BLOCKED_PROGRAMMATIC_SOURCES = new Set<SafeFocusSource>([
    'mount',
    'transition',
    'dialog-open',
    'state-change'
]);

const NON_TEXT_INPUT_TYPES = new Set([
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit'
]);

function isIosDevice() {
    const userAgent = navigator.userAgent;
    return (
        /iPad|iPhone|iPod/i.test(userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
}

function isIosWebKitEnvironment() {
    return isIosDevice() && /AppleWebKit/i.test(navigator.userAgent);
}

function isTextEntryElement(element: HTMLElement) {
    if (element instanceof HTMLTextAreaElement) {
        return true;
    }

    if (element instanceof HTMLInputElement) {
        return !NON_TEXT_INPUT_TYPES.has(element.type.toLowerCase());
    }

    return element.isContentEditable;
}

function applySelection(
    element: HTMLElement,
    selection: SafeFocusSelection | undefined
) {
    if (
        !selection ||
        !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
    ) {
        return;
    }

    if (selection === 'all') {
        element.select();
        return;
    }

    const valueLength = element.value.length;

    if (selection === 'start') {
        element.setSelectionRange(0, 0);
        return;
    }

    if (selection === 'end') {
        element.setSelectionRange(valueLength, valueLength);
        return;
    }

    element.setSelectionRange(
        selection.start,
        selection.end,
        selection.direction ?? 'none'
    );
}

export default function safeFocus(
    element: HTMLElement | null | undefined,
    options: SafeFocusOptions = {}
) {
    if (!import.meta.client || !element) {
        return false;
    }

    const source = options.source ?? 'user-gesture';

    if (
        isTextEntryElement(element) &&
        isIosWebKitEnvironment() &&
        BLOCKED_PROGRAMMATIC_SOURCES.has(source)
    ) {
        options.scrollIntoView && element.scrollIntoView(options.scrollIntoView);
        return false;
    }

    element.focus({
        preventScroll: options.preventScroll
    });
    applySelection(element, options.selection);
    return document.activeElement === element;
}
