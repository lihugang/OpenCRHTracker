export interface DashboardScopeTreeNodeItem {
    id: string;
    label: string;
    fullScope: string | null;
    children: DashboardScopeTreeNodeItem[];
    leafScopes: string[];
}
