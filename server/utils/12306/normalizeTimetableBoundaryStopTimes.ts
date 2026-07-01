export interface TimetableBoundaryTimeStop {
    arriveAt: number | null;
    departAt: number | null;
}

export default function normalizeTimetableBoundaryStopTimes<
    TStop extends TimetableBoundaryTimeStop
>(stops: readonly TStop[]): TStop[] {
    if (stops.length === 0) {
        return [];
    }

    const lastIndex = stops.length - 1;
    return stops.map((stop, index) => ({
        ...stop,
        arriveAt: index === 0 ? null : stop.arriveAt,
        departAt: index === lastIndex ? null : stop.departAt
    }));
}
