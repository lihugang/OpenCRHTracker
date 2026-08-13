# Task: oauth/feedback/notifications domain extraction (agent domain_oa_fb_nt)

Extract shared domain operations for oauth, feedback, and notifications in /root/crhdata/OpenCRHTracker. v1 must keep EXACTLY its current external behavior (status, Chinese messages, response shapes, executeApi options, cookies). Work independently; do not ask questions.

## Read first

1. docs/api-v2-implementation-spec.md (sections 3.3, 8, 10, 11, 13, 14)
2. docs/api-v2-domain-modules.md (module mapping)
3. docs/api-v2-operation-index.md
4. v1 handlers (11):
   - server/api/v1/oauth/authorize/context.get.ts
   - server/api/v1/oauth/clients.get.ts, post.ts, [clientId].get.ts, [clientId].patch.ts, [clientId].delete.ts
   - server/api/v1/feedback/topics.get.ts, post.ts, [id].get.ts, [id].patch.ts, [id].delete.ts, [id]/messages.post.ts
   - server/api/v1/notifications/send.post.ts
5. Their stores/utils: server/services/oauthStore.ts, feedbackStore.ts, eventNotificationService.ts, pushNotificationService.ts, userProfileStore.ts, server/utils/oauth/*, server/utils/feedback/*, utils/feedback/*, types/auth.ts, types/feedback.ts, types/notifications.ts

## Conventions

Create exactly:

- server/domain/oauth.ts -> getOauthAuthorizeContext, getOauthClients, postOauthClients, getOauthClient, patchOauthClient, deleteOauthClient
- server/domain/feedback.ts -> getFeedbackTopics, postFeedbackTopics, getFeedbackTopic, patchFeedbackTopic, deleteFeedbackTopic, postFeedbackTopicMessage
- server/domain/notifications.ts -> postNotificationsSend

Domain functions: plain internal typed inputs/outputs; no H3Event; no cookies/headers; no executeApi; no auth rate limits; no wire formatting; version-independent validation throws ApiRequestError with today's exact status/errorCode/userMessage.

v1 handlers keep: query/body parsing, v1-specific unknown-field rejection, ensureAuthRateLimit calls, cookie handling, executeApi options, v1 response formatting.

## Key design points

- OAuth authorize context: domain function receives the parsed authorize request (plain object) and the current user session context (or anonymous marker). It returns an internal decision result with typed outcome (redirect | invalid_request | consent) plus the data the v1 adapter needs to render the existing `OAuthAuthorizeContextResponse` exactly. Cookie/continuation handling stays in the v1 adapter (and later v2 adapter). Preserve auth rate limit in the v1 adapter.
- OAuth clients: domain functions wrap oauthStore list/get/create/patch/delete and client-secret handling; return internal client records; v1 adapter formats exactly as today.
- Feedback: domain functions wrap feedbackStore create/list/get/patch/delete/messages; preserve visibility/category/status enums as internal string unions; `postFeedbackTopics` keeps the security-issue login rule and auto-subscribe side effect in domain; v1 adapter formats exactly.
- Notifications: `postNotificationsSend(identity, payload)` calls pushNotificationService and returns `{ deliveredCount, removedEndpointCount, hasSubscriptions }`; v1 adapter keeps executeApi options.
- Feedback message `meta` remains an open JSON object; domain returns the raw meta object.

## Constraints

Do not modify export handlers, auth/public/admin domains, package.json, nuxt.config.ts, frontend, docs, proto files; no v2 routes/manifest.

## Validation

`pnpm typecheck:server` must pass for your files.

## Report

Files created/changed; all exported signatures; confirmation v1 unchanged; judgment calls; typecheck result.
