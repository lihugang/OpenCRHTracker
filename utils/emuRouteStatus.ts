const EMU_ROUTE_STATUS_MASK = 0x1f;
const EMU_ROUTE_STATUS_CONFIRMED = 0x01;
const EMU_ROUTE_STATUS_FORMATION_POSITION_MASK = 0x06;
const EMU_ROUTE_STATUS_FORMATION_POSITION_UNKNOWN = 0x02;
const EMU_ROUTE_STATUS_FORMATION_POSITION_I = 0x04;
const EMU_ROUTE_STATUS_FORMATION_POSITION_II = 0x06;
const EMU_ROUTE_STATUS_FAULT = 0x08;
const EMU_ROUTE_STATUS_HOT_SPARE = 0x10;

export const ADMIN_DAILY_ROUTE_STATUS_OPTIONS = [
    { value: '1', label: '单组' },
    { value: '5', label: '重联 I' },
    { value: '7', label: '重联 II' },
    { value: '9', label: '故障' },
    { value: '13', label: '故障 I' },
    { value: '15', label: '故障 II' },
    { value: '17', label: '热备' },
    { value: '21', label: '热备 I' },
    { value: '23', label: '热备 II' }
];

export function formatEmuRouteStatus(status: number): string {
    if (
        !Number.isInteger(status) ||
        status < 0 ||
        status > EMU_ROUTE_STATUS_MASK
    ) {
        return `未知状态（${status}）`;
    }

    const formation = status & EMU_ROUTE_STATUS_FORMATION_POSITION_MASK;
    const labels = [formation === 0 ? '单组' : '多组'];
    labels.push(
        (status & EMU_ROUTE_STATUS_CONFIRMED) !== 0 ? '已确认' : '未确认'
    );

    if (formation === EMU_ROUTE_STATUS_FORMATION_POSITION_UNKNOWN) {
        labels.push('重联');
    } else if (formation === EMU_ROUTE_STATUS_FORMATION_POSITION_I) {
        labels.push('重联 I');
    } else if (formation === EMU_ROUTE_STATUS_FORMATION_POSITION_II) {
        labels.push('重联 II');
    }

    if ((status & EMU_ROUTE_STATUS_FAULT) !== 0) {
        labels.push('故障');
    }
    if ((status & EMU_ROUTE_STATUS_HOT_SPARE) !== 0) {
        labels.push('热备');
    }

    return labels.join(' / ');
}
