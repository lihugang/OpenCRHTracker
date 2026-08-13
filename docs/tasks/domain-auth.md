# Task: auth domain extraction (agent domain_auth)

Extract shared domain operations for the auth API family in /root/crhdata/OpenCRHTracker. v1 must keep EXACTLY its current external behavior (status, Chinese messages, response shapes, executeApi options, cookies, unknown-field rejections). Work independently; do not ask questions.

## Read first

1. docs/api-v2-implementation-spec.md (sections 3.3, 8, 10, 13, 14)
2. docs/api-v2-domain-modules.md (module mapping)
3. docs/api-v2-operation-index.md (operation names)
4. These v1 handlers (21; favorites and event-subscriptions v1 routes are removed):
    - server/api/v1/auth/api-keys.get.ts, post.ts, [revokeId].delete.ts
    - server/api/v1/auth/authorizations.get.ts, [clientId].delete.ts
    - server/api/v1/auth/login.post.ts, logout.post.ts, me.get.ts
    - server/api/v1/auth/memberships.get.ts, memberships/redeem.post.ts
    - server/api/v1/auth/password.patch.ts
    - server/api/v1/auth/qq-binding/send-code.post.ts, unbind.post.ts, verify.post.ts
    - server/api/v1/auth/register.post.ts
    - server/api/v1/auth/settings.get.ts, patch.ts
    - server/api/v1/auth/subscriptions.get.ts, put.ts, [id].delete.ts, [id].patch.ts
5. Their stores/utils: authStore, userProfileStore, userEventSubscriptionStore, membershipStore, membershipCodeStore, qqBindingService, oauthStore, pushNotificationService, server/utils/auth/_, utils/auth/_, utils/lookup/lookupFavorite.ts, utils/notifications/target.ts, types/auth.ts, types/notifications.ts, types/lookup.ts

## Conventions

Create exactly server/domain/auth.ts exporting the 27 functions from docs/api-v2-domain-modules.md (getAuthApiKeys ... patchAuthSubscription).

Domain functions: plain internal typed inputs/outputs; no H3Event; no cookies/headers; no executeApi; no auth rate limits; no user-agent reading; no wire formatting; version-independent validation throws ApiRequestError with today's exact status/errorCode/userMessage.

v1 handlers keep: request parsing, v1-specific unknown-field rejection, ensureAuthRateLimit calls, cookie set/clear, user-agent handling, executeApi options, v1 response formatting.

## Key design points

- Login/register/logout: domain performs credential validation/ban check/last-login/session creation/revocation; returns session record (or void). Cookie handling stays in adapter.
- postAuthApiKeys(userId, input): validate name/scopes; return created record including full key (one-time).
- Settings/memberships/qq-binding/authorizations/me: move logic to domain; return internal results for v1 formatting.
- Favorites/event subscriptions (spec section 8): define internal typed targets:
    - favorite: `{ kind:'train', trainCode } | { kind:'emu', emuId } | { kind:'station', stationName }`
    - event: `{ kind:'train', trainCode } | { kind:'emu', emuId } | { kind:'feedback', topicId }`
      Persistent storage is v2 typed: favorites in `user_profiles.data_json` are `{ target, tags, starredAt }` (profile `version: 2`), event subscriptions live in `user_event_subscriptions_v2` (kind + emu_id/topic_id/train_prefix/train_number + target_key). Domain/stores operate on the typed targets directly; server-side helpers live in `server/utils/auth/favoriteTargets.ts` and `server/utils/auth/eventTargets.ts`. Event lists include label/path/createdAt/updatedAt/canView (reuse server/utils/auth/eventSubscriptions.ts logic but return internal data).
      putAuthFavorites/deleteAuthFavorites preserve linked event-subscription deletion (ignore not_found, rethrow others).
      Old string-format data is migrated by `scripts/migrate-emu-storage-v2.mjs` (`pnpm migrate:auth-v2`, default dry-run; skipped entries are warned and written to `data/migrate-auth-v2-skipped.jsonl`). v1 favorites/event-subscription routes are deleted and their behavior is not preserved.
- Device subscriptions: id/endpoint/expirationTime/keys stay strings; keep registration-notification side effect in domain; pass userAgent as plain parameter.
- Preserve exact ApiRequestError codes/messages everywhere.

## Constraints

Do not modify export handlers, other domains, package.json, nuxt.config.ts, frontend, docs, proto files; no v2 routes/manifest.

## Validation

`pnpm typecheck:server` must pass for your files.

## Report

Files created/changed; all 27 signatures (incl. typed target types); confirmation v1 unchanged; judgment calls; typecheck result.
