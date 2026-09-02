/* ============================================================
   ТОЧКА ВХОДА — APP
   ============================================================ */

document.addEventListener('DOMContentLoaded', async function() {
    // ===== 1. ПРОВЕРКА АВТОРИЗАЦИИ =====
    const user = await AUTH.require();
    if (!user) return;

    // Обновляем UI пользователя
    AUTH.updateUI(user);

    // ===== 2. ИНИЦИАЛИЗАЦИЯ МЕНЮ =====
    await MENU.init();

    // ===== 3. ПЕРЕКЛЮЧЕНИЕ МЕНЮ (кнопка гамбургер) =====
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            MENU.toggleSidebar();
        });
    }

    // ===== 4. ВЫПАДАЮЩЕЕ МЕНЮ ПОЛЬЗОВАТЕЛЯ =====
    AUTH.initHover();

    // ===== 5. МОБИЛЬНОЕ МЕНЮ =====
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
        overlay.addEventListener('click', function() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.remove('mobile-open');
            this.classList.remove('active');
        });
    }

    console.log('✅ КАРКАС инициализирован');
});