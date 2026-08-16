import type { EmuId } from '~/server/libs/database/emu';
import type { ProbeEmuMultipleState } from '~/server/services/probeAssetStore';
import {
    decodeEmuRouteStatus,
    EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE,
    withFormationStatus,
    type EmuRouteFormationPosition
} from '~/server/utils/emuRouteStatus';
import {
    parseCouplingScanRepeat,
    type CouplingScanRepeatObservation
} from '~/server/utils/emuRouteFormation';

export type FormationWarningSource =
    | 'getCarDetail'
    | 'coupling_scan_repeat'
    | 'model'
    | 'historical_inheritance'
    | 'status_aggregation';

export type FormationWarningKind =
    | 'coach_pic_list_missing'
    | 'picture_name_missing'
    | 'picture_name_invalid'
    | 'repeat_invalid'
    | 'repeat_zero_in_coupled_group'
    | 'repeat_position_conflict'
    | 'model_get_car_detail_conflict'
    | 'model_coupled_group_conflict'
    | 'status_row_conflict'
    | 'position_conflict'
    | 'coupled_position_indeterminate';

export interface FormationStatusWarning {
    source: FormationWarningSource;
    kind: FormationWarningKind;
    emuId: EmuId;
    oldStatus: number | null;
    newStatus: number | null;
    pictureName: string;
    repeat: string;
    reason: string;
}

export interface CoupledScanPositionInput {
    emuCodes: EmuId[];
    existingStatusByEmu: Map<EmuId, number>;
    scanRecords: ReadonlyArray<{
        emuId: EmuId;
        trainRepeat: string;
    }>;
    multipleStateByEmu: Map<EmuId, ProbeEmuMultipleState>;
}

export interface CoupledScanPositionResolution {
    statusByEmu: Map<EmuId, number>;
    warnings: FormationStatusWarning[];
}

function getExistingStatus(
    statusByEmu: Map<EmuId, number>,
    emuId: EmuId
): number {
    return statusByEmu.get(emuId) ?? EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE;
}

function applyFormationPosition(
    status: number,
    position: EmuRouteFormationPosition,
    confirmed: boolean
): number {
    return (
        withFormationStatus(status, {
            confirmed,
            formationPosition: position
        }) ?? status
    );
}

function isExplicitPosition(status: number): boolean {
    const decoded = decodeEmuRouteStatus(status);
    return (
        decoded?.confirmed === true &&
        (decoded.formationPosition === 'I' ||
            decoded.formationPosition === 'II')
    );
}

function isConfirmedI(status: number): boolean {
    const decoded = decodeEmuRouteStatus(status);
    return decoded?.confirmed === true && decoded.formationPosition === 'I';
}

function isConfirmedII(status: number): boolean {
    const decoded = decodeEmuRouteStatus(status);
    return decoded?.confirmed === true && decoded.formationPosition === 'II';
}

function pushWarning(
    warnings: FormationStatusWarning[],
    warning: FormationStatusWarning
): void {
    warnings.push(warning);
}

function resolveCoupledGroup(
    input: CoupledScanPositionInput,
    statusByEmu: Map<EmuId, number>,
    repeatByEmu: Map<EmuId, CouplingScanRepeatObservation>,
    warnings: FormationStatusWarning[]
): void {
    for (const emuId of input.emuCodes) {
        if (input.multipleStateByEmu.get(emuId) !== 'non_multiple') {
            continue;
        }

        const oldStatus = getExistingStatus(statusByEmu, emuId);
        pushWarning(warnings, {
            source: 'model',
            kind: 'model_coupled_group_conflict',
            emuId,
            oldStatus,
            newStatus: null,
            pictureName: '',
            repeat: repeatByEmu.get(emuId)?.repeat ?? '',
            reason: 'model is non_multiple but the emu belongs to a two-emu group; group facts win'
        });
    }

    for (const emuId of input.emuCodes) {
        const parsed = repeatByEmu.get(emuId);
        if (!parsed?.valid) {
            continue;
        }

        const oldStatus = getExistingStatus(statusByEmu, emuId);
        if (parsed.position === 'single') {
            pushWarning(warnings, {
                source: 'coupling_scan_repeat',
                kind: 'repeat_zero_in_coupled_group',
                emuId,
                oldStatus,
                newStatus: null,
                pictureName: '',
                repeat: parsed.repeat,
                reason: 'repeat=0 conflicts with a two-emu group; group facts win and the group is not split'
            });
            continue;
        }

        const oldDecoded = decodeEmuRouteStatus(oldStatus);
        const nextStatus = applyFormationPosition(
            oldStatus,
            parsed.position,
            true
        );
        if (
            oldDecoded?.confirmed &&
            oldDecoded.formationPosition !== 'unknown' &&
            oldDecoded.formationPosition !== parsed.position
        ) {
            pushWarning(warnings, {
                source: 'coupling_scan_repeat',
                kind: 'repeat_position_conflict',
                emuId,
                oldStatus,
                newStatus: nextStatus,
                pictureName: '',
                repeat: parsed.repeat,
                reason: `repeat=${parsed.repeat} changes explicit position ${oldDecoded.formationPosition} -> ${parsed.position}`
            });
        }
        statusByEmu.set(emuId, nextStatus);
    }

    const claimedIIEmuIds = input.emuCodes.filter((emuId) => {
        const parsed = repeatByEmu.get(emuId);
        return parsed?.valid && parsed.position === 'II';
    });
    if (claimedIIEmuIds.length === 1) {
        const anchorEmuId = claimedIIEmuIds[0]!;
        for (const emuId of input.emuCodes) {
            if (emuId === anchorEmuId) {
                continue;
            }

            const oldStatus = getExistingStatus(statusByEmu, emuId);
            if (isConfirmedI(oldStatus)) {
                continue;
            }
            const nextStatus = applyFormationPosition(oldStatus, 'I', true);
            const oldDecoded = decodeEmuRouteStatus(oldStatus);
            if (
                oldDecoded?.confirmed &&
                oldDecoded.formationPosition !== 'unknown' &&
                oldDecoded.formationPosition !== 'I'
            ) {
                pushWarning(warnings, {
                    source: 'coupling_scan_repeat',
                    kind: 'repeat_position_conflict',
                    emuId,
                    oldStatus,
                    newStatus: nextStatus,
                    pictureName: '',
                    repeat: repeatByEmu.get(anchorEmuId)?.repeat ?? '',
                    reason: `repeat=2 anchor assigns the paired emu to I, overriding previous ${oldDecoded.formationPosition}`
                });
            }
            statusByEmu.set(emuId, nextStatus);
        }
        return;
    }

    if (claimedIIEmuIds.length > 1) {
        for (const emuId of input.emuCodes) {
            const oldStatus = getExistingStatus(statusByEmu, emuId);
            statusByEmu.set(
                emuId,
                applyFormationPosition(oldStatus, 'unknown', true)
            );
        }
        pushWarning(warnings, {
            source: 'coupling_scan_repeat',
            kind: 'coupled_position_indeterminate',
            emuId: input.emuCodes[0]!,
            oldStatus: null,
            newStatus: null,
            pictureName: '',
            repeat: '',
            reason: 'multiple emus claim coupled II via repeat; positions remain undetermined'
        });
        return;
    }

    const hasRepeatZero = input.emuCodes.some((emuId) => {
        const parsed = repeatByEmu.get(emuId);
        return parsed?.valid && parsed.position === 'single';
    });
    if (hasRepeatZero) {
        for (const emuId of input.emuCodes) {
            const oldStatus = getExistingStatus(statusByEmu, emuId);
            statusByEmu.set(
                emuId,
                applyFormationPosition(oldStatus, 'unknown', true)
            );
        }
        pushWarning(warnings, {
            source: 'coupling_scan_repeat',
            kind: 'coupled_position_indeterminate',
            emuId: input.emuCodes[0]!,
            oldStatus: null,
            newStatus: null,
            pictureName: '',
            repeat: '',
            reason: 'repeat=0 conflicts with the two-emu group and no current II anchor uniquely determines positions'
        });
        return;
    }

    const existingIIEmuIds = input.emuCodes.filter((emuId) =>
        isConfirmedII(getExistingStatus(statusByEmu, emuId))
    );
    if (existingIIEmuIds.length === 1 && input.emuCodes.length === 2) {
        const anchorEmuId = existingIIEmuIds[0]!;
        const pairedEmuId = input.emuCodes.find(
            (emuId) => emuId !== anchorEmuId
        )!;
        const oldStatus = getExistingStatus(statusByEmu, pairedEmuId);
        const oldDecoded = decodeEmuRouteStatus(oldStatus);
        const nextStatus = applyFormationPosition(oldStatus, 'I', true);
        if (
            oldDecoded?.confirmed &&
            oldDecoded.formationPosition !== 'unknown' &&
            oldDecoded.formationPosition !== 'I'
        ) {
            pushWarning(warnings, {
                source: 'status_aggregation',
                kind: 'position_conflict',
                emuId: pairedEmuId,
                oldStatus,
                newStatus: nextStatus,
                pictureName: '',
                repeat: repeatByEmu.get(pairedEmuId)?.repeat ?? '',
                reason: 'existing confirmed coupled II status anchors the paired emu as coupled I'
            });
        }
        statusByEmu.set(pairedEmuId, nextStatus);
        return;
    }

    const resolvedIEmuIds = input.emuCodes.filter((emuId) =>
        isConfirmedI(getExistingStatus(statusByEmu, emuId))
    );
    const resolvedIIEmuIdsAfterRepeat = input.emuCodes.filter((emuId) =>
        isConfirmedII(getExistingStatus(statusByEmu, emuId))
    );
    if (
        resolvedIEmuIds.length === 1 &&
        resolvedIIEmuIdsAfterRepeat.length === 1
    ) {
        return;
    }

    if (resolvedIEmuIds.length > 0 || resolvedIIEmuIdsAfterRepeat.length > 0) {
        for (const emuId of input.emuCodes) {
            const oldStatus = getExistingStatus(statusByEmu, emuId);
            statusByEmu.set(
                emuId,
                applyFormationPosition(oldStatus, 'unknown', true)
            );
        }
        pushWarning(warnings, {
            source: 'coupling_scan_repeat',
            kind: 'coupled_position_indeterminate',
            emuId: input.emuCodes[0]!,
            oldStatus: null,
            newStatus: null,
            pictureName: '',
            repeat: '',
            reason: 'explicit coupled positions do not form one unique I/II pair; positions remain undetermined'
        });
        return;
    }

    for (const emuId of input.emuCodes) {
        const oldStatus = getExistingStatus(statusByEmu, emuId);
        statusByEmu.set(
            emuId,
            applyFormationPosition(oldStatus, 'unknown', true)
        );
    }
    pushWarning(warnings, {
        source: 'coupling_scan_repeat',
        kind: 'coupled_position_indeterminate',
        emuId: input.emuCodes[0]!,
        oldStatus: null,
        newStatus: null,
        pictureName: '',
        repeat: '',
        reason: 'two-emu group has no evidence that uniquely determines coupled I/II positions'
    });
}

function resolveSingleEmu(
    input: CoupledScanPositionInput,
    statusByEmu: Map<EmuId, number>,
    repeatByEmu: Map<EmuId, CouplingScanRepeatObservation>,
    warnings: FormationStatusWarning[]
): void {
    const emuId = input.emuCodes[0]!;
    const oldStatus = getExistingStatus(statusByEmu, emuId);
    const parsed = repeatByEmu.get(emuId);
    const oldDecoded = decodeEmuRouteStatus(oldStatus);

    if (parsed?.valid && parsed.position !== 'unknown') {
        const nextStatus = applyFormationPosition(
            oldStatus,
            parsed.position,
            true
        );
        if (
            oldDecoded?.confirmed &&
            oldDecoded.formationPosition !== 'unknown' &&
            oldDecoded.formationPosition !== parsed.position
        ) {
            pushWarning(warnings, {
                source: 'coupling_scan_repeat',
                kind: 'repeat_position_conflict',
                emuId,
                oldStatus,
                newStatus: nextStatus,
                pictureName: '',
                repeat: parsed.repeat,
                reason: `repeat=${parsed.repeat} changes explicit position ${oldDecoded.formationPosition} -> ${parsed.position}`
            });
        }
        statusByEmu.set(emuId, nextStatus);
        return;
    }

    const multipleState = input.multipleStateByEmu.get(emuId) ?? 'unknown';
    if (multipleState === 'non_multiple') {
        const nextStatus = applyFormationPosition(oldStatus, 'single', true);
        if (isConfirmedI(oldStatus)) {
            pushWarning(warnings, {
                source: 'model',
                kind: 'repeat_position_conflict',
                emuId,
                oldStatus,
                newStatus: nextStatus,
                pictureName: '',
                repeat: parsed?.repeat ?? '',
                reason: 'model is non_multiple; confirmed coupled I is downgraded to confirmed single'
            });
        }
        statusByEmu.set(emuId, nextStatus);
    }
}

export function resolveCoupledScanPositions(
    input: CoupledScanPositionInput
): CoupledScanPositionResolution {
    const statusByEmu = new Map(input.existingStatusByEmu);
    const warnings: FormationStatusWarning[] = [];
    const repeatByEmu = new Map<EmuId, CouplingScanRepeatObservation>();

    for (const record of input.scanRecords) {
        const parsed = parseCouplingScanRepeat(record.trainRepeat);
        repeatByEmu.set(record.emuId, parsed);
        if (!parsed.valid) {
            pushWarning(warnings, {
                source: 'coupling_scan_repeat',
                kind: 'repeat_invalid',
                emuId: record.emuId,
                oldStatus: statusByEmu.get(record.emuId) ?? null,
                newStatus: null,
                pictureName: '',
                repeat: record.trainRepeat,
                reason: `repeat value ${JSON.stringify(record.trainRepeat)} is not 0/1/2`
            });
        }
    }

    if (input.emuCodes.length >= 2) {
        resolveCoupledGroup(input, statusByEmu, repeatByEmu, warnings);
    } else {
        resolveSingleEmu(input, statusByEmu, repeatByEmu, warnings);
    }

    for (const warning of warnings) {
        if (warning.newStatus === null) {
            warning.newStatus = statusByEmu.get(warning.emuId) ?? null;
        }
    }

    return { statusByEmu, warnings };
}

export function buildCoupledUnknownStatusByEmu(
    emuIds: EmuId[],
    existingStatusByEmu: Map<EmuId, number>
): Map<EmuId, number> {
    const statusByEmu = new Map<EmuId, number>();
    for (const emuId of emuIds) {
        const existingStatus = getExistingStatus(existingStatusByEmu, emuId);
        const position = isExplicitPosition(existingStatus)
            ? decodeEmuRouteStatus(existingStatus)!.formationPosition
            : 'unknown';
        statusByEmu.set(
            emuId,
            applyFormationPosition(existingStatus, position, true)
        );
    }
    return statusByEmu;
}
