import { asEmuId, type EmuId } from '~/server/libs/database/emu';
import { decodeEmuRouteStatus, mergeEmuRouteStatuses } from './emuRouteStatus';
import type { DailyEmuRouteRow } from '~/server/services/emuRoutesStore';

export const CAR_DETAIL_PICTURE_NAME_COUPLED_II_PREFIX = '09';

export type CarDetailFormationWarningKind =
    | 'coach_pic_list_missing'
    | 'picture_name_missing'
    | 'picture_name_invalid';

export interface CarDetailFormationObservation {
    position: 'II' | 'unknown';
    pictureName: string;
    warningKind: CarDetailFormationWarningKind | null;
}

export function parseCarDetailFormationObservation(
    pictureName: string | null | undefined,
    hasCoachPicList: boolean
): CarDetailFormationObservation {
    const normalized = pictureName?.trim() ?? '';
    if (!hasCoachPicList) {
        return {
            position: 'unknown',
            pictureName: normalized,
            warningKind: 'coach_pic_list_missing'
        };
    }
    if (normalized.length === 0) {
        return {
            position: 'unknown',
            pictureName: normalized,
            warningKind: 'picture_name_missing'
        };
    }
    if (normalized.length < 2 || !/^\d{2}/.test(normalized)) {
        return {
            position: 'unknown',
            pictureName: normalized,
            warningKind: 'picture_name_invalid'
        };
    }

    return normalized.startsWith(CAR_DETAIL_PICTURE_NAME_COUPLED_II_PREFIX)
        ? { position: 'II', pictureName: normalized, warningKind: null }
        : { position: 'unknown', pictureName: normalized, warningKind: null };
}

export type CouplingScanRepeatPosition = 'single' | 'I' | 'II' | 'unknown';

export interface CouplingScanRepeatObservation {
    position: CouplingScanRepeatPosition;
    valid: boolean;
    repeat: string;
}

export function parseCouplingScanRepeat(
    raw: string
): CouplingScanRepeatObservation {
    const repeat = raw.trim();
    switch (repeat) {
        case '0':
            return { position: 'single', valid: true, repeat };
        case '1':
            return { position: 'I', valid: true, repeat };
        case '2':
            return { position: 'II', valid: true, repeat };
        default:
            return { position: 'unknown', valid: false, repeat };
    }
}

export function collectStatusByEmuFromRows(
    rows: ReadonlyArray<Pick<DailyEmuRouteRow, 'emu_id' | 'status'>>
): Map<EmuId, number> {
    return collectStatusByEmuFromRowsWithConflicts(rows).statusByEmu;
}

export interface EmuRouteStatusMergeConflict {
    emuId: EmuId;
    statuses: number[];
    mergedStatus: number;
}

export interface CollectedStatusByEmu {
    statusByEmu: Map<EmuId, number>;
    conflicts: EmuRouteStatusMergeConflict[];
}

export function collectStatusByEmuFromRowsWithConflicts(
    rows: ReadonlyArray<Pick<DailyEmuRouteRow, 'emu_id' | 'status'>>
): CollectedStatusByEmu {
    const statusesByEmu = new Map<number, number[]>();
    for (const row of rows) {
        const emuIdNumber = Number(row.emu_id);
        const statuses = statusesByEmu.get(emuIdNumber) ?? [];
        statuses.push(row.status);
        statusesByEmu.set(emuIdNumber, statuses);
    }

    const conflicts: EmuRouteStatusMergeConflict[] = [];
    const statusByEmu = new Map<EmuId, number>();
    for (const [emuIdNumber, statuses] of statusesByEmu) {
        const emuId = asEmuId(emuIdNumber);
        const mergedStatus = mergeEmuRouteStatuses(statuses);
        statusByEmu.set(emuId, mergedStatus);

        const confirmedPositions = new Set(
            statuses.flatMap((status) => {
                const decoded = decodeEmuRouteStatus(status);
                return decoded?.confirmed ? [decoded.formationPosition] : [];
            })
        );
        const explicitPositions = new Set(
            Array.from(confirmedPositions).filter(
                (position) => position !== 'unknown'
            )
        );
        const hasSingleCoupledUnknownConflict =
            confirmedPositions.has('single') &&
            confirmedPositions.has('unknown');
        if (explicitPositions.size > 1 || hasSingleCoupledUnknownConflict) {
            conflicts.push({
                emuId,
                statuses: [...new Set(statuses)],
                mergedStatus
            });
        }
    }

    return { statusByEmu, conflicts };
}
