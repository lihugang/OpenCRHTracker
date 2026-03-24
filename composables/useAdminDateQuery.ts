import type { RouteLocationRaw } from 'vue-router';
import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';

function readQueryValue(value: unknown): string {
    if (Array.isArray(value)) {
        return typeof value[0] === 'string' ? value[0] : '';
    }

    return typeof value === 'string' ? value : '';
}

export function toAdminDateInputValue(dateYmd: string): string {
    if (!/^\d{8}$/.test(dateYmd)) {
        return '';
    }

    return `${dateYmd.slice(0, 4)}-${dateYmd.slice(4, 6)}-${dateYmd.slice(6, 8)}`;
}

export function fromAdminDateInputValue(dateInput: string): string {
    return dateInput.replaceAll('-', '');
}

export function normalizeAdminDateInputValue(
    rawValue: string,
    fallbackDateInput: string
): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
        return rawValue;
    }

    if (/^\d{8}$/.test(rawValue)) {
        return toAdminDateInputValue(rawValue);
    }

    return fallbackDateInput;
}

export function buildAdminRoute(
    path: string,
    dateInput: string
): RouteLocationRaw {
    return dateInput
        ? {
              path,
              query: {
                  date: dateInput
              }
          }
        : { path };
}

export async function useAdminDateQuery() {
    const route = useRoute();
    const router = useRouter();
    const todayDateInputValue = toAdminDateInputValue(
        formatShanghaiDateString(Math.floor(Date.now() / 1000))
    );

    const syncDateQuery = async (rawQueryValue: unknown) => {
        const rawValue = readQueryValue(rawQueryValue);
        const normalizedValue = normalizeAdminDateInputValue(
            rawValue,
            todayDateInputValue
        );

        if (rawValue === normalizedValue) {
            return normalizedValue;
        }

        const nextLocation = {
            path: route.path,
            query: {
                ...route.query,
                date: normalizedValue
            }
        };

        if (import.meta.server) {
            await navigateTo(nextLocation, {
                replace: true
            });
            return normalizedValue;
        }

        await router.replace(nextLocation);
        return normalizedValue;
    };

    if (import.meta.server) {
        await syncDateQuery(route.query.date);
    }

    if (import.meta.client) {
        watch(
            () => route.query.date,
            (value) => {
                void syncDateQuery(value);
            },
            {
                immediate: true
            }
        );
    }

    const selectedDateInput = computed({
        get() {
            return normalizeAdminDateInputValue(
                readQueryValue(route.query.date),
                todayDateInputValue
            );
        },
        set(nextValue: string) {
            const normalizedValue = normalizeAdminDateInputValue(
                nextValue,
                todayDateInputValue
            );

            void router.replace({
                path: route.path,
                query: {
                    ...route.query,
                    date: normalizedValue
                }
            });
        }
    });

    const selectedDateYmd = computed(() =>
        fromAdminDateInputValue(selectedDateInput.value)
    );

    return {
        selectedDateInput,
        selectedDateYmd,
        todayDateInputValue
    };
}
