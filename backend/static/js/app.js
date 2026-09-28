/* ============================================================
   ТОЧКА ВХОДА — APP
   ============================================================ */

if (!window._appInitialized) {
    window._appInitialized = true;

    document.addEventListener('DOMContentLoaded', async function() {
        console.log('🚀 КАРКАС: инициализация...');

        const user = await AUTH.require();
        if (!user) return;

        AUTH.updateUI(user);
        AUTH.initHover();
        AUTH.initLogout();

        await MENU.init();

        console.log('✅ КАРКАС инициализирован');
    });
}