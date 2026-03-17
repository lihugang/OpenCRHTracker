export default defineNuxtRouteMiddleware(async () => {
    const { ensureSession, isAuthenticated } = useAuthState();

    await ensureSession();

    if (!isAuthenticated.value) {
        return navigateTo('/login');
    }
});
