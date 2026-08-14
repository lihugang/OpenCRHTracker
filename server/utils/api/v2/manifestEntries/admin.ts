import { defineV2Operation } from '~/server/utils/api/v2/V2Types';
import {
    DeleteAdminDailyRouteRequestSchema,
    DeleteAdminDailyRouteDataSchema,
    DeleteAdminDailyRouteResponseSchema,
    DeleteAdminOfficialCirculationRequestSchema,
    DeleteAdminOfficialCirculationDataSchema,
    DeleteAdminOfficialCirculationResponseSchema,
    DeleteAdminTimetableHistoryCoverageRequestSchema,
    DeleteAdminTimetableHistoryCoverageDataSchema,
    DeleteAdminTimetableHistoryCoverageResponseSchema,
    GetAdminAnomalyScanRequestSchema,
    GetAdminAnomalyScanDataSchema,
    GetAdminAnomalyScanResponseSchema,
    GetAdminConfigFileRequestSchema,
    GetAdminConfigFileDataSchema,
    GetAdminConfigFileResponseSchema,
    GetAdminConfigFilesRequestSchema,
    GetAdminConfigFilesDataSchema,
    GetAdminConfigFilesResponseSchema,
    GetAdminDailyRoutesRequestSchema,
    GetAdminDailyRoutesDataSchema,
    GetAdminDailyRoutesResponseSchema,
    GetAdminDailyRoutesTimetablesRequestSchema,
    GetAdminDailyRoutesTimetablesDataSchema,
    GetAdminDailyRoutesTimetablesResponseSchema,
    GetAdminMembershipCodesRequestSchema,
    GetAdminMembershipCodesDataSchema,
    GetAdminMembershipCodesResponseSchema,
    GetAdminOauthClientsRequestSchema,
    GetAdminOauthClientsDataSchema,
    GetAdminOauthClientsResponseSchema,
    GetAdminOfficialCirculationsRequestSchema,
    GetAdminOfficialCirculationsDataSchema,
    GetAdminOfficialCirculationsResponseSchema,
    GetAdminPassiveAlertsRequestSchema,
    GetAdminPassiveAlertsDataSchema,
    GetAdminPassiveAlertsResponseSchema,
    GetAdminServerMetricsRequestSchema,
    GetAdminServerMetricsDataSchema,
    GetAdminServerMetricsResponseSchema,
    GetAdminTasksRequestSchema,
    GetAdminTasksDataSchema,
    GetAdminTasksResponseSchema,
    GetAdminTimetableHistoryMergeCandidatesRequestSchema,
    GetAdminTimetableHistoryMergeCandidatesDataSchema,
    GetAdminTimetableHistoryMergeCandidatesResponseSchema,
    GetAdminTrafficRequestSchema,
    GetAdminTrafficDataSchema,
    GetAdminTrafficResponseSchema,
    PatchAdminOauthClientRequestSchema,
    PatchAdminOauthClientDataSchema,
    PatchAdminOauthClientResponseSchema,
    PostAdminAnomalyDeleteByTypeRequestSchema,
    PostAdminAnomalyDeleteByTypeDataSchema,
    PostAdminAnomalyDeleteByTypeResponseSchema,
    PostAdminAnomalyDeleteRouteRequestSchema,
    PostAdminAnomalyDeleteRouteDataSchema,
    PostAdminAnomalyDeleteRouteResponseSchema,
    PostAdminConfigFilesRequestSchema,
    PostAdminConfigFilesDataSchema,
    PostAdminConfigFilesResponseSchema,
    PostAdminDailyRoutesRequestSchema,
    PostAdminDailyRoutesDataSchema,
    PostAdminDailyRoutesResponseSchema,
    PostAdminMembershipCodesRequestSchema,
    PostAdminMembershipCodesDataSchema,
    PostAdminMembershipCodesResponseSchema,
    PostAdminOauthClientRevokeTokensRequestSchema,
    PostAdminOauthClientRevokeTokensDataSchema,
    PostAdminOauthClientRevokeTokensResponseSchema,
    PostAdminTasksRequestSchema,
    PostAdminTasksDataSchema,
    PostAdminTasksResponseSchema,
    PostAdminWebappTokensRevokeAllRequestSchema,
    PostAdminWebappTokensRevokeAllDataSchema,
    PostAdminWebappTokensRevokeAllResponseSchema,
    PutAdminConfigFileRequestSchema,
    PutAdminConfigFileDataSchema,
    PutAdminConfigFileResponseSchema
} from '#shared/generated/proto/opencrh/v2/admin_pb';
import {
    deleteAdminDailyRouteV2Adapter,
    deleteAdminOfficialCirculationV2Adapter,
    deleteAdminTimetableHistoryCoverageV2Adapter,
    getAdminAnomalyScanV2Adapter,
    getAdminConfigFileV2Adapter,
    getAdminConfigFilesV2Adapter,
    getAdminDailyRoutesTimetablesV2Adapter,
    getAdminDailyRoutesV2Adapter,
    getAdminMembershipCodesV2Adapter,
    getAdminOauthClientsV2Adapter,
    getAdminOfficialCirculationsV2Adapter,
    getAdminPassiveAlertsV2Adapter,
    getAdminServerMetricsV2Adapter,
    getAdminTasksV2Adapter,
    getAdminTimetableHistoryMergeCandidatesV2Adapter,
    getAdminTrafficV2Adapter,
    patchAdminOauthClientV2Adapter,
    postAdminAnomalyDeleteByTypeV2Adapter,
    postAdminAnomalyDeleteRouteV2Adapter,
    postAdminConfigFilesV2Adapter,
    postAdminDailyRoutesV2Adapter,
    postAdminMembershipCodesV2Adapter,
    postAdminOauthClientRevokeTokensV2Adapter,
    postAdminTasksV2Adapter,
    postAdminWebappTokensRevokeAllV2Adapter,
    putAdminConfigFileV2Adapter
} from '~/server/utils/api/v2/adapters/adminCore';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

function adminTimetableIds(data: unknown): number[] {
    return (
        (data as { items?: Array<{ timetableId?: number }> }).items
            ?.map((item) => item.timetableId)
            .filter((id): id is number => id !== undefined) ?? []
    );
}

export const ADMIN_MANIFEST_ENTRIES = {
    PostAdminAnomalyDeleteByType: defineV2Operation({
        operationName: 'PostAdminAnomalyDeleteByType',
        method: 'POST',
        pathTemplate: '/api/v2/admin/anomaly-actions/delete-by-type',
        requestSchema: PostAdminAnomalyDeleteByTypeRequestSchema,
        dataSchema: PostAdminAnomalyDeleteByTypeDataSchema,
        responseSchema: PostAdminAnomalyDeleteByTypeResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'optional',
        handler: postAdminAnomalyDeleteByTypeV2Adapter
    }),
    PostAdminAnomalyDeleteRoute: defineV2Operation({
        operationName: 'PostAdminAnomalyDeleteRoute',
        method: 'POST',
        pathTemplate: '/api/v2/admin/anomaly-actions/delete-route',
        requestSchema: PostAdminAnomalyDeleteRouteRequestSchema,
        dataSchema: PostAdminAnomalyDeleteRouteDataSchema,
        responseSchema: PostAdminAnomalyDeleteRouteResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'optional',
        handler: postAdminAnomalyDeleteRouteV2Adapter
    }),
    GetAdminAnomalyScan: defineV2Operation({
        operationName: 'GetAdminAnomalyScan',
        method: 'GET',
        pathTemplate: '/api/v2/admin/anomaly-scan',
        requestSchema: GetAdminAnomalyScanRequestSchema,
        dataSchema: GetAdminAnomalyScanDataSchema,
        responseSchema: GetAdminAnomalyScanResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: true,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getAdminAnomalyScanV2Adapter
    }),
    GetAdminConfigFiles: defineV2Operation({
        operationName: 'GetAdminConfigFiles',
        method: 'GET',
        pathTemplate: '/api/v2/admin/config-files',
        requestSchema: GetAdminConfigFilesRequestSchema,
        dataSchema: GetAdminConfigFilesDataSchema,
        responseSchema: GetAdminConfigFilesResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: true,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getAdminConfigFilesV2Adapter
    }),
    PostAdminConfigFiles: defineV2Operation({
        operationName: 'PostAdminConfigFiles',
        method: 'POST',
        pathTemplate: '/api/v2/admin/config-files',
        requestSchema: PostAdminConfigFilesRequestSchema,
        dataSchema: PostAdminConfigFilesDataSchema,
        responseSchema: PostAdminConfigFilesResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'optional',
        handler: postAdminConfigFilesV2Adapter
    }),
    GetAdminConfigFile: defineV2Operation({
        operationName: 'GetAdminConfigFile',
        method: 'GET',
        pathTemplate: '/api/v2/admin/config-files/:target',
        requestSchema: GetAdminConfigFileRequestSchema,
        dataSchema: GetAdminConfigFileDataSchema,
        responseSchema: GetAdminConfigFileResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getAdminConfigFileV2Adapter
    }),
    PutAdminConfigFile: defineV2Operation({
        operationName: 'PutAdminConfigFile',
        method: 'PUT',
        pathTemplate: '/api/v2/admin/config-files/:target',
        requestSchema: PutAdminConfigFileRequestSchema,
        dataSchema: PutAdminConfigFileDataSchema,
        responseSchema: PutAdminConfigFileResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'optional',
        handler: putAdminConfigFileV2Adapter
    }),
    GetAdminDailyRoutes: defineV2Operation({
        operationName: 'GetAdminDailyRoutes',
        method: 'GET',
        pathTemplate: '/api/v2/admin/daily-routes',
        requestSchema: GetAdminDailyRoutesRequestSchema,
        dataSchema: GetAdminDailyRoutesDataSchema,
        responseSchema: GetAdminDailyRoutesResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        mappings: {
            emuCode: (data) =>
                (data as { items?: Array<{ emuId?: number }> }).items
                    ?.map((item) => item.emuId)
                    .filter((id): id is number => id !== undefined) ?? [],
            timetable: adminTimetableIds
        },
        handler: getAdminDailyRoutesV2Adapter
    }),
    PostAdminDailyRoutes: defineV2Operation({
        operationName: 'PostAdminDailyRoutes',
        method: 'POST',
        pathTemplate: '/api/v2/admin/daily-routes',
        requestSchema: PostAdminDailyRoutesRequestSchema,
        dataSchema: PostAdminDailyRoutesDataSchema,
        responseSchema: PostAdminDailyRoutesResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'optional',
        mappings: {
            emuCode: (data) =>
                (data as { createdRecord?: { emuId?: number } }).createdRecord
                    ?.emuId === undefined
                    ? []
                    : [
                          (data as { createdRecord: { emuId: number } })
                              .createdRecord.emuId
                      ],
            timetable: (data) =>
                (data as { createdRecord?: { timetableId?: number } })
                    .createdRecord?.timetableId === undefined
                    ? []
                    : [
                          (
                              data as {
                                  createdRecord: { timetableId: number };
                              }
                          ).createdRecord.timetableId
                      ]
        },
        handler: postAdminDailyRoutesV2Adapter
    }),
    DeleteAdminDailyRoute: defineV2Operation({
        operationName: 'DeleteAdminDailyRoute',
        method: 'DELETE',
        pathTemplate: '/api/v2/admin/daily-routes/:id',
        requestSchema: DeleteAdminDailyRouteRequestSchema,
        dataSchema: DeleteAdminDailyRouteDataSchema,
        responseSchema: DeleteAdminDailyRouteResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: deleteAdminDailyRouteV2Adapter
    }),
    GetAdminDailyRoutesTimetables: defineV2Operation({
        operationName: 'GetAdminDailyRoutesTimetables',
        method: 'GET',
        pathTemplate: '/api/v2/admin/daily-routes/timetables',
        requestSchema: GetAdminDailyRoutesTimetablesRequestSchema,
        dataSchema: GetAdminDailyRoutesTimetablesDataSchema,
        responseSchema: GetAdminDailyRoutesTimetablesResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        mappings: {
            timetable: (data) => [
                ...((data as { defaultTimetableId?: number })
                    .defaultTimetableId === undefined
                    ? []
                    : [
                          (data as { defaultTimetableId: number })
                              .defaultTimetableId
                      ]),
                ...((
                    data as {
                        items?: Array<{ timetableId?: number }>;
                    }
                ).items
                    ?.map((item) => item.timetableId)
                    .filter((id): id is number => id !== undefined) ?? [])
            ]
        },
        handler: getAdminDailyRoutesTimetablesV2Adapter
    }),
    GetAdminMembershipCodes: defineV2Operation({
        operationName: 'GetAdminMembershipCodes',
        method: 'GET',
        pathTemplate: '/api/v2/admin/membership-codes',
        requestSchema: GetAdminMembershipCodesRequestSchema,
        dataSchema: GetAdminMembershipCodesDataSchema,
        responseSchema: GetAdminMembershipCodesResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getAdminMembershipCodesV2Adapter
    }),
    PostAdminMembershipCodes: defineV2Operation({
        operationName: 'PostAdminMembershipCodes',
        method: 'POST',
        pathTemplate: '/api/v2/admin/membership-codes',
        requestSchema: PostAdminMembershipCodesRequestSchema,
        dataSchema: PostAdminMembershipCodesDataSchema,
        responseSchema: PostAdminMembershipCodesResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'optional',
        handler: postAdminMembershipCodesV2Adapter
    }),
    GetAdminOauthClients: defineV2Operation({
        operationName: 'GetAdminOauthClients',
        method: 'GET',
        pathTemplate: '/api/v2/admin/oauth/clients',
        requestSchema: GetAdminOauthClientsRequestSchema,
        dataSchema: GetAdminOauthClientsDataSchema,
        responseSchema: GetAdminOauthClientsResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getAdminOauthClientsV2Adapter
    }),
    PatchAdminOauthClient: defineV2Operation({
        operationName: 'PatchAdminOauthClient',
        method: 'PATCH',
        pathTemplate: '/api/v2/admin/oauth/clients/:clientId',
        requestSchema: PatchAdminOauthClientRequestSchema,
        dataSchema: PatchAdminOauthClientDataSchema,
        responseSchema: PatchAdminOauthClientResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'optional',
        handler: patchAdminOauthClientV2Adapter
    }),
    PostAdminOauthClientRevokeTokens: defineV2Operation({
        operationName: 'PostAdminOauthClientRevokeTokens',
        method: 'POST',
        pathTemplate: '/api/v2/admin/oauth/clients/:clientId/revoke-tokens',
        requestSchema: PostAdminOauthClientRevokeTokensRequestSchema,
        dataSchema: PostAdminOauthClientRevokeTokensDataSchema,
        responseSchema: PostAdminOauthClientRevokeTokensResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: postAdminOauthClientRevokeTokensV2Adapter
    }),
    GetAdminOfficialCirculations: defineV2Operation({
        operationName: 'GetAdminOfficialCirculations',
        method: 'GET',
        pathTemplate: '/api/v2/admin/official-circulations',
        requestSchema: GetAdminOfficialCirculationsRequestSchema,
        dataSchema: GetAdminOfficialCirculationsDataSchema,
        responseSchema: GetAdminOfficialCirculationsResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: true,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getAdminOfficialCirculationsV2Adapter
    }),
    DeleteAdminOfficialCirculation: defineV2Operation({
        operationName: 'DeleteAdminOfficialCirculation',
        method: 'DELETE',
        pathTemplate: '/api/v2/admin/official-circulations/:entryKey',
        requestSchema: DeleteAdminOfficialCirculationRequestSchema,
        dataSchema: DeleteAdminOfficialCirculationDataSchema,
        responseSchema: DeleteAdminOfficialCirculationResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: deleteAdminOfficialCirculationV2Adapter
    }),
    GetAdminPassiveAlerts: defineV2Operation({
        operationName: 'GetAdminPassiveAlerts',
        method: 'GET',
        pathTemplate: '/api/v2/admin/passive-alerts',
        requestSchema: GetAdminPassiveAlertsRequestSchema,
        dataSchema: GetAdminPassiveAlertsDataSchema,
        responseSchema: GetAdminPassiveAlertsResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: true,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getAdminPassiveAlertsV2Adapter
    }),
    GetAdminServerMetrics: defineV2Operation({
        operationName: 'GetAdminServerMetrics',
        method: 'GET',
        pathTemplate: '/api/v2/admin/server-metrics',
        requestSchema: GetAdminServerMetricsRequestSchema,
        dataSchema: GetAdminServerMetricsDataSchema,
        responseSchema: GetAdminServerMetricsResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: true,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getAdminServerMetricsV2Adapter
    }),
    GetAdminTasks: defineV2Operation({
        operationName: 'GetAdminTasks',
        method: 'GET',
        pathTemplate: '/api/v2/admin/tasks',
        requestSchema: GetAdminTasksRequestSchema,
        dataSchema: GetAdminTasksDataSchema,
        responseSchema: GetAdminTasksResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: true,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getAdminTasksV2Adapter
    }),
    PostAdminTasks: defineV2Operation({
        operationName: 'PostAdminTasks',
        method: 'POST',
        pathTemplate: '/api/v2/admin/tasks',
        requestSchema: PostAdminTasksRequestSchema,
        dataSchema: PostAdminTasksDataSchema,
        responseSchema: PostAdminTasksResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'optional',
        handler: postAdminTasksV2Adapter
    }),
    GetAdminTimetableHistoryMergeCandidates: defineV2Operation({
        operationName: 'GetAdminTimetableHistoryMergeCandidates',
        method: 'GET',
        pathTemplate: '/api/v2/admin/timetable-history/merge-candidates',
        requestSchema: GetAdminTimetableHistoryMergeCandidatesRequestSchema,
        dataSchema: GetAdminTimetableHistoryMergeCandidatesDataSchema,
        responseSchema: GetAdminTimetableHistoryMergeCandidatesResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        mappings: {
            timetable: (data) =>
                (
                    data as {
                        items?: Array<{
                            previous?: { timetableId?: number };
                            middle?: { timetableId?: number };
                            next?: { timetableId?: number };
                        }>;
                    }
                ).items
                    ?.flatMap((item) => [
                        item.previous?.timetableId,
                        item.middle?.timetableId,
                        item.next?.timetableId
                    ])
                    .filter((id): id is number => id !== undefined) ?? []
        },
        handler: getAdminTimetableHistoryMergeCandidatesV2Adapter
    }),
    DeleteAdminTimetableHistoryCoverage: defineV2Operation({
        operationName: 'DeleteAdminTimetableHistoryCoverage',
        method: 'DELETE',
        pathTemplate: '/api/v2/admin/timetable-history/coverages/:coverageId',
        requestSchema: DeleteAdminTimetableHistoryCoverageRequestSchema,
        dataSchema: DeleteAdminTimetableHistoryCoverageDataSchema,
        responseSchema: DeleteAdminTimetableHistoryCoverageResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        mappings: {
            timetable: (data) =>
                [
                    (data as { previous?: { timetableId?: number } }).previous
                        ?.timetableId,
                    (data as { middle?: { timetableId?: number } }).middle
                        ?.timetableId,
                    (data as { next?: { timetableId?: number } }).next
                        ?.timetableId,
                    (data as { merged?: { timetableId?: number } }).merged
                        ?.timetableId
                ].filter((id): id is number => id !== undefined)
        },
        handler: deleteAdminTimetableHistoryCoverageV2Adapter
    }),
    GetAdminTraffic: defineV2Operation({
        operationName: 'GetAdminTraffic',
        method: 'GET',
        pathTemplate: '/api/v2/admin/traffic',
        requestSchema: GetAdminTrafficRequestSchema,
        dataSchema: GetAdminTrafficDataSchema,
        responseSchema: GetAdminTrafficResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: true,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getAdminTrafficV2Adapter
    }),
    PostAdminWebappTokensRevokeAll: defineV2Operation({
        operationName: 'PostAdminWebappTokensRevokeAll',
        method: 'POST',
        pathTemplate: '/api/v2/admin/webapp-tokens/revoke-all',
        requestSchema: PostAdminWebappTokensRevokeAllRequestSchema,
        dataSchema: PostAdminWebappTokensRevokeAllDataSchema,
        responseSchema: PostAdminWebappTokensRevokeAllResponseSchema,
        requiredScopes: [API_SCOPES.admin],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: postAdminWebappTokensRevokeAllV2Adapter
    })
} as const;
