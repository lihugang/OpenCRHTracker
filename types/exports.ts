export type DailyExportFormat = 'csv' | 'jsonl';

export interface DailyExportIndexItem {
    date: string;
    formats: DailyExportFormat[];
}

export interface DailyExportIndexResponse {
    selectedYear: number;
    selectedMonth: number;
    availableYears: number[];
    availableMonths: number[];
    items: DailyExportIndexItem[];
}
