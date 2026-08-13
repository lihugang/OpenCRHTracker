import { readPassiveAlerts } from '~/server/services/adminPassiveAlertStore';

export function getAdminPassiveAlerts(input: {
    date: string;
    type: string;
    limit: number;
    cursor: { timestamp: number; lineIndex: number } | null;
    rawCursor: string;
}) {
    return readPassiveAlerts(input);
}
