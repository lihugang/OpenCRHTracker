import type { V2Manifest } from '~/server/utils/api/v2/V2Types';
import { ADMIN_MANIFEST_ENTRIES } from '~/server/utils/api/v2/manifestEntries/admin';
import { ADMIN_PROVENANCE_MANIFEST_ENTRIES } from '~/server/utils/api/v2/manifestEntries/adminProvenance';
import { ADMIN_USERS_MANIFEST_ENTRIES } from '~/server/utils/api/v2/manifestEntries/adminUsers';
import { AUTH_MANIFEST_ENTRIES } from '~/server/utils/api/v2/manifestEntries/auth';
import { EXPORTS_MANIFEST_ENTRIES } from '~/server/utils/api/v2/manifestEntries/exports';
import { FEEDBACK_MANIFEST_ENTRIES } from '~/server/utils/api/v2/manifestEntries/feedback';
import { LOOKUP_MANIFEST_ENTRIES } from '~/server/utils/api/v2/manifestEntries/lookup';
import { NOTIFICATIONS_MANIFEST_ENTRIES } from '~/server/utils/api/v2/manifestEntries/notifications';
import { OAUTH_MANIFEST_ENTRIES } from '~/server/utils/api/v2/manifestEntries/oauth';
import { SYSTEM_MANIFEST_ENTRIES } from '~/server/utils/api/v2/manifestEntries/system';

export const V2_OPERATION_MANIFEST: V2Manifest = {
    ...ADMIN_MANIFEST_ENTRIES,
    ...ADMIN_PROVENANCE_MANIFEST_ENTRIES,
    ...ADMIN_USERS_MANIFEST_ENTRIES,
    ...AUTH_MANIFEST_ENTRIES,
    ...EXPORTS_MANIFEST_ENTRIES,
    ...FEEDBACK_MANIFEST_ENTRIES,
    ...LOOKUP_MANIFEST_ENTRIES,
    ...NOTIFICATIONS_MANIFEST_ENTRIES,
    ...OAUTH_MANIFEST_ENTRIES,
    ...SYSTEM_MANIFEST_ENTRIES
};
