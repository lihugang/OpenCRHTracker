import getLogger from '~/server/libs/log4js';

const logger = getLogger('emu-route-status');

export const EMU_ROUTE_STATUS_MASK = 0x1f;

export const EMU_ROUTE_STATUS_CONFIRMED = 0x01;
export const EMU_ROUTE_STATUS_FORMATION_POSITION_MASK = 0x06;
export const EMU_ROUTE_STATUS_FORMATION_POSITION_SINGLE = 0x00;
export const EMU_ROUTE_STATUS_FORMATION_POSITION_UNKNOWN = 0x02;
export const EMU_ROUTE_STATUS_FORMATION_POSITION_I = 0x04;
export const EMU_ROUTE_STATUS_FORMATION_POSITION_II = 0x06;
export const EMU_ROUTE_STATUS_FAULT = 0x08;
export const EMU_ROUTE_STATUS_HOT_SPARE = 0x10;

export const EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE = 0x00;
export const EMU_ROUTE_STATUS_CONFIRMED_SINGLE = 0x01;
export const EMU_ROUTE_STATUS_UNCONFIRMED_COUPLED_UNKNOWN = 0x02;
export const EMU_ROUTE_STATUS_CONFIRMED_COUPLED_UNKNOWN = 0x03;
export const EMU_ROUTE_STATUS_UNCONFIRMED_COUPLED_I = 0x04;
export const EMU_ROUTE_STATUS_CONFIRMED_COUPLED_I = 0x05;
export const EMU_ROUTE_STATUS_UNCONFIRMED_COUPLED_II = 0x06;
export const EMU_ROUTE_STATUS_CONFIRMED_COUPLED_II = 0x07;

export type EmuRouteFormationPosition = 'single' | 'unknown' | 'I' | 'II';

export interface EmuRouteStatusParts {
    confirmed: boolean;
    formationPosition: EmuRouteFormationPosition;
    fault: boolean;
    hotSpare: boolean;
    baseStatus: number;
}

export interface EmuRouteFormationStatusInput {
    confirmed: boolean;
    formationPosition: EmuRouteFormationPosition;
}

export interface EmuRouteStatusInput extends EmuRouteFormationStatusInput {
    fault: boolean;
    hotSpare: boolean;
}

function toFormationPosition(positionBits: number): EmuRouteFormationPosition {
    switch (positionBits) {
        case EMU_ROUTE_STATUS_FORMATION_POSITION_SINGLE:
            return 'single';
        case EMU_ROUTE_STATUS_FORMATION_POSITION_UNKNOWN:
            return 'unknown';
        case EMU_ROUTE_STATUS_FORMATION_POSITION_I:
            return 'I';
        case EMU_ROUTE_STATUS_FORMATION_POSITION_II:
            return 'II';
        default:
            return 'unknown';
    }
}

function toPositionBits(position: EmuRouteFormationPosition): number {
    switch (position) {
        case 'single':
            return EMU_ROUTE_STATUS_FORMATION_POSITION_SINGLE;
        case 'I':
            return EMU_ROUTE_STATUS_FORMATION_POSITION_I;
        case 'II':
            return EMU_ROUTE_STATUS_FORMATION_POSITION_II;
        case 'unknown':
        default:
            return EMU_ROUTE_STATUS_FORMATION_POSITION_UNKNOWN;
    }
}

function logInvalidStatus(value: unknown) {
    logger.warn(`invalid_emu_route_status value=${String(value)}`);
}

export function decodeEmuRouteStatus(
    value: unknown
): EmuRouteStatusParts | null {
    if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > EMU_ROUTE_STATUS_MASK
    ) {
        logInvalidStatus(value);
        return null;
    }

    return {
        confirmed: (value & EMU_ROUTE_STATUS_CONFIRMED) !== 0,
        formationPosition: toFormationPosition(
            value & EMU_ROUTE_STATUS_FORMATION_POSITION_MASK
        ),
        fault: (value & EMU_ROUTE_STATUS_FAULT) !== 0,
        hotSpare: (value & EMU_ROUTE_STATUS_HOT_SPARE) !== 0,
        baseStatus:
            value &
            (EMU_ROUTE_STATUS_CONFIRMED |
                EMU_ROUTE_STATUS_FORMATION_POSITION_MASK)
    };
}

export function isConfirmed(status: number): boolean {
    return decodeEmuRouteStatus(status)?.confirmed ?? false;
}

export function hasFault(status: number): boolean {
    return decodeEmuRouteStatus(status)?.fault ?? false;
}

export function isHotSpare(status: number): boolean {
    return decodeEmuRouteStatus(status)?.hotSpare ?? false;
}

export function encodeEmuRouteStatus(input: EmuRouteStatusInput): number {
    return (
        (input.confirmed ? EMU_ROUTE_STATUS_CONFIRMED : 0) |
        toPositionBits(input.formationPosition) |
        (input.fault ? EMU_ROUTE_STATUS_FAULT : 0) |
        (input.hotSpare ? EMU_ROUTE_STATUS_HOT_SPARE : 0)
    );
}

export function getFormationPositionBits(status: number): number {
    return status & EMU_ROUTE_STATUS_FORMATION_POSITION_MASK;
}

export function isConfirmedCoupled(status: number): boolean {
    return isConfirmed(status) && getFormationPositionBits(status) !== 0;
}

export function isConfirmedSingle(status: number): boolean {
    return isConfirmed(status) && getFormationPositionBits(status) === 0;
}

export function withFormationStatus(
    status: number,
    next: EmuRouteFormationStatusInput
): number | null {
    const decoded = decodeEmuRouteStatus(status);
    if (!decoded) {
        return null;
    }

    return encodeEmuRouteStatus({
        ...next,
        fault: decoded.fault,
        hotSpare: decoded.hotSpare
    });
}

export function withFault(status: number, fault: boolean): number | null {
    const decoded = decodeEmuRouteStatus(status);
    if (!decoded) {
        return null;
    }

    return fault
        ? status | EMU_ROUTE_STATUS_FAULT
        : status & ~EMU_ROUTE_STATUS_FAULT;
}

export function withHotSpare(status: number, hotSpare: boolean): number | null {
    const decoded = decodeEmuRouteStatus(status);
    if (!decoded) {
        return null;
    }

    return hotSpare
        ? status | EMU_ROUTE_STATUS_HOT_SPARE
        : status & ~EMU_ROUTE_STATUS_HOT_SPARE;
}

export function mergeEmuRouteStatuses(statuses: readonly number[]): number {
    const positionPrecedence: Record<EmuRouteFormationPosition, number> = {
        single: 0,
        unknown: 1,
        I: 2,
        II: 3
    };
    let confirmed = false;
    let position: EmuRouteFormationPosition = 'single';
    let fault = false;
    let hotSpare = false;

    for (const status of statuses) {
        const decoded = decodeEmuRouteStatus(status);
        if (!decoded) {
            continue;
        }

        confirmed = confirmed || decoded.confirmed;
        if (
            positionPrecedence[decoded.formationPosition] >
            positionPrecedence[position]
        ) {
            position = decoded.formationPosition;
        }
        fault = fault || decoded.fault;
        hotSpare = hotSpare || decoded.hotSpare;
    }

    return encodeEmuRouteStatus({
        confirmed,
        formationPosition: position,
        fault,
        hotSpare
    });
}
