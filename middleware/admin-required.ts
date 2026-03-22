import hasClientScope, {
    CLIENT_AUTH_SCOPES
} from '~/utils/auth/hasClientScope';

export default defineNuxtRouteMiddleware(async () => {
    const { ensureSession, isAuthenticated, session } = useAuthState();

    await ensureSession();

    if (!isAuthenticated.value) {
        return navigateTo('/login');
    }

    if (
        !session.value ||
        !hasClientScope(session.value.scopes, CLIENT_AUTH_SCOPES.admin)
    ) {
        return navigateTo('/');
    }
});
