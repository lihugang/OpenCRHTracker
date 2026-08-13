# v2 共享 domain 模块与函数映射

本文档固定每个 operation 的 domain 模块路径与导出函数名，供 v1 重构、v2 路由、manifest 和最终审查共同引用。函数名统一为 operation 名的 camelCase。

## 约定

- 模块位于 `server/domain/**`，不接收 `H3Event`，不设置 cookie/header，不进行外部字符串格式化。
- v1 handler 保留外部字符串边界解析、v1 专属未知字段拒绝和 v1 响应格式化；v2 handler 保留 v2 解析与消息构造。
- 业务校验错误抛 `ApiRequestError`，消息与状态码与现有 v1 保持一致。

## 模块映射

| Operation | 模块 | 导出函数 |
|---|---|---|
| GetDailyRecords | `server/domain/records.ts` | `getDailyRecords` |
| GetTrainHistory | `server/domain/history.ts` | `getTrainHistory` |
| GetEmuHistory | `server/domain/history.ts` | `getEmuHistory` |
| GetCurrentTrainTimetable | `server/domain/timetable.ts` | `getCurrentTrainTimetable` |
| GetTrainTimetableHistory | `server/domain/timetable.ts` | `getTrainTimetableHistory` |
| GetTrainTimetableHistoryDetail | `server/domain/timetable.ts` | `getTrainTimetableHistoryDetail` |
| GetStationTimetable | `server/domain/timetable.ts` | `getStationTimetable` |
| GetTrainCirculationImage | `server/domain/timetable.ts` | `getTrainCirculationImage` |
| GetEmuAllocation | `server/domain/allocation.ts` | `getEmuAllocation` |
| GetSearchIndex | `server/domain/search.ts` | `getSearchIndex` |
| GetHealth | `server/domain/system.ts` | `getHealth` |
| GetDebugEchoError | `server/domain/system.ts` | `getDebugEchoError` |
| GetExposedConfig | `server/domain/system.ts` | `getExposedConfig` |
| GetDailyExportIndex | `server/domain/exports.ts` | `getDailyExportIndex` |
| GetDailyExport | `server/domain/exports.ts` | `getDailyExport` |
| GetAuthApiKeys | `server/domain/auth.ts` | `getAuthApiKeys` |
| PostAuthApiKeys | `server/domain/auth.ts` | `postAuthApiKeys` |
| DeleteAuthApiKey | `server/domain/auth.ts` | `deleteAuthApiKey` |
| GetAuthAuthorizations | `server/domain/auth.ts` | `getAuthAuthorizations` |
| DeleteAuthAuthorization | `server/domain/auth.ts` | `deleteAuthAuthorization` |
| GetAuthEventSubscriptions | `server/domain/auth.ts` | `getAuthEventSubscriptions` |
| PutAuthEventSubscriptions | `server/domain/auth.ts` | `putAuthEventSubscriptions` |
| DeleteAuthEventSubscriptions | `server/domain/auth.ts` | `deleteAuthEventSubscriptions` |
| GetAuthFavorites | `server/domain/auth.ts` | `getAuthFavorites` |
| PutAuthFavorites | `server/domain/auth.ts` | `putAuthFavorites` |
| DeleteAuthFavorites | `server/domain/auth.ts` | `deleteAuthFavorites` |
| PostAuthLogin | `server/domain/auth.ts` | `postAuthLogin` |
| PostAuthLogout | `server/domain/auth.ts` | `postAuthLogout` |
| GetAuthMe | `server/domain/auth.ts` | `getAuthMe` |
| GetAuthMemberships | `server/domain/auth.ts` | `getAuthMemberships` |
| PostAuthRedeemMembership | `server/domain/auth.ts` | `postAuthRedeemMembership` |
| PatchAuthPassword | `server/domain/auth.ts` | `patchAuthPassword` |
| PostAuthSendQqBindingCode | `server/domain/auth.ts` | `postAuthSendQqBindingCode` |
| PostAuthUnbindQqBinding | `server/domain/auth.ts` | `postAuthUnbindQqBinding` |
| PostAuthVerifyQqBinding | `server/domain/auth.ts` | `postAuthVerifyQqBinding` |
| PostAuthRegister | `server/domain/auth.ts` | `postAuthRegister` |
| GetAuthSettings | `server/domain/auth.ts` | `getAuthSettings` |
| PatchAuthSettings | `server/domain/auth.ts` | `patchAuthSettings` |
| GetAuthSubscriptions | `server/domain/auth.ts` | `getAuthSubscriptions` |
| PutAuthSubscriptions | `server/domain/auth.ts` | `putAuthSubscriptions` |
| DeleteAuthSubscription | `server/domain/auth.ts` | `deleteAuthSubscription` |
| PatchAuthSubscription | `server/domain/auth.ts` | `patchAuthSubscription` |
| GetOauthAuthorizeContext | `server/domain/oauth.ts` | `getOauthAuthorizeContext` |
| GetOauthClients | `server/domain/oauth.ts` | `getOauthClients` |
| PostOauthClients | `server/domain/oauth.ts` | `postOauthClients` |
| GetOauthClient | `server/domain/oauth.ts` | `getOauthClient` |
| PatchOauthClient | `server/domain/oauth.ts` | `patchOauthClient` |
| DeleteOauthClient | `server/domain/oauth.ts` | `deleteOauthClient` |
| GetFeedbackTopics | `server/domain/feedback.ts` | `getFeedbackTopics` |
| PostFeedbackTopics | `server/domain/feedback.ts` | `postFeedbackTopics` |
| GetFeedbackTopic | `server/domain/feedback.ts` | `getFeedbackTopic` |
| PatchFeedbackTopic | `server/domain/feedback.ts` | `patchFeedbackTopic` |
| DeleteFeedbackTopic | `server/domain/feedback.ts` | `deleteFeedbackTopic` |
| PostFeedbackTopicMessage | `server/domain/feedback.ts` | `postFeedbackTopicMessage` |
| PostNotificationsSend | `server/domain/notifications.ts` | `postNotificationsSend` |
| GetAdminAnomalyScan | `server/domain/admin/anomaly.ts` | `getAdminAnomalyScan` |
| PostAdminAnomalyDeleteByType | `server/domain/admin/anomaly.ts` | `postAdminAnomalyDeleteByType` |
| PostAdminAnomalyDeleteRoute | `server/domain/admin/anomaly.ts` | `postAdminAnomalyDeleteRoute` |
| GetAdminConfigFiles | `server/domain/admin/configFiles.ts` | `getAdminConfigFiles` |
| PostAdminConfigFiles | `server/domain/admin/configFiles.ts` | `postAdminConfigFiles` |
| GetAdminConfigFile | `server/domain/admin/configFiles.ts` | `getAdminConfigFile` |
| PutAdminConfigFile | `server/domain/admin/configFiles.ts` | `putAdminConfigFile` |
| GetAdminDailyRoutes | `server/domain/admin/dailyRoutes.ts` | `getAdminDailyRoutes` |
| PostAdminDailyRoutes | `server/domain/admin/dailyRoutes.ts` | `postAdminDailyRoutes` |
| DeleteAdminDailyRoute | `server/domain/admin/dailyRoutes.ts` | `deleteAdminDailyRoute` |
| GetAdminDailyRoutesTimetables | `server/domain/admin/dailyRoutes.ts` | `getAdminDailyRoutesTimetables` |
| GetAdminMembershipCodes | `server/domain/admin/membershipCodes.ts` | `getAdminMembershipCodes` |
| PostAdminMembershipCodes | `server/domain/admin/membershipCodes.ts` | `postAdminMembershipCodes` |
| GetAdminOauthClients | `server/domain/admin/oauth.ts` | `getAdminOauthClients` |
| PatchAdminOauthClient | `server/domain/admin/oauth.ts` | `patchAdminOauthClient` |
| PostAdminOauthClientRevokeTokens | `server/domain/admin/oauth.ts` | `postAdminOauthClientRevokeTokens` |
| GetAdminOfficialCirculations | `server/domain/admin/officialCirculations.ts` | `getAdminOfficialCirculations` |
| DeleteAdminOfficialCirculation | `server/domain/admin/officialCirculations.ts` | `deleteAdminOfficialCirculation` |
| GetAdminPassiveAlerts | `server/domain/admin/passiveAlerts.ts` | `getAdminPassiveAlerts` |
| GetAdminServerMetrics | `server/domain/admin/serverMetrics.ts` | `getAdminServerMetrics` |
| GetAdminTasks | `server/domain/admin/tasks.ts` | `getAdminTasks` |
| PostAdminTasks | `server/domain/admin/tasks.ts` | `postAdminTasks` |
| GetAdminTimetableHistoryMergeCandidates | `server/domain/admin/timetableHistory.ts` | `getAdminTimetableHistoryMergeCandidates` |
| DeleteAdminTimetableHistoryCoverage | `server/domain/admin/timetableHistory.ts` | `deleteAdminTimetableHistoryCoverage` |
| GetAdminTraffic | `server/domain/admin/traffic.ts` | `getAdminTraffic` |
| GetAdminTrainProvenance | `server/domain/admin/trainProvenance.ts` | `getAdminTrainProvenance` |
| GetAdminTrainProvenanceCouplingScan | `server/domain/admin/trainProvenance.ts` | `getAdminTrainProvenanceCouplingScan` |
| GetAdminTrainProvenanceCouplingScanTasks | `server/domain/admin/trainProvenance.ts` | `getAdminTrainProvenanceCouplingScanTasks` |
| GetAdminTrainProvenanceQrcodeScan | `server/domain/admin/trainProvenance.ts` | `getAdminTrainProvenanceQrcodeScan` |
| GetAdminTrainProvenanceQrcodeScanTasks | `server/domain/admin/trainProvenance.ts` | `getAdminTrainProvenanceQrcodeScanTasks` |
| GetAdminTrainProvenanceRequestStats | `server/domain/admin/trainProvenance.ts` | `getAdminTrainProvenanceRequestStats` |
| GetAdminTrainProvenanceStationBoard | `server/domain/admin/trainProvenance.ts` | `getAdminTrainProvenanceStationBoard` |
| GetAdminTrainProvenanceStationBoardTasks | `server/domain/admin/trainProvenance.ts` | `getAdminTrainProvenanceStationBoardTasks` |
| GetAdminTrainProvenanceStationPlatformRefresh | `server/domain/admin/trainProvenance.ts` | `getAdminTrainProvenanceStationPlatformRefresh` |
| GetAdminUsers | `server/domain/admin/users.ts` | `getAdminUsers` |
| GetAdminUserMemberships | `server/domain/admin/users.ts` | `getAdminUserMemberships` |
| PutAdminUserMembership | `server/domain/admin/users.ts` | `putAdminUserMembership` |
| DeleteAdminUserMembership | `server/domain/admin/users.ts` | `deleteAdminUserMembership` |
| PostAdminQqBanEntry | `server/domain/admin/users.ts` | `postAdminQqBanEntry` |
| DeleteAdminQqBanEntry | `server/domain/admin/users.ts` | `deleteAdminQqBanEntry` |
| PostAdminUsersQuotaReset | `server/domain/admin/users.ts` | `postAdminUsersQuotaReset` |
| PostAdminUsersRiskClear | `server/domain/admin/users.ts` | `postAdminUsersRiskClear` |
| GetAdminUsersSecurity | `server/domain/admin/users.ts` | `getAdminUsersSecurity` |
| PostAdminUsersStatus | `server/domain/admin/users.ts` | `postAdminUsersStatus` |
| PostAdminWebappTokensRevokeAll | `server/domain/admin/users.ts` | `postAdminWebappTokensRevokeAll` |
