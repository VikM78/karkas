/* ============================================================
   АВТОРИЗАЦИЯ
   ============================================================ */

const AUTH = {
    HOVER_DELAY: 300,
    hideTimeout: null,
    isHovering: false,

    async check() {
        try {
            const response = await fetch('/api/v1/auth/me', { credentials: 'include' });
            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Ошибка проверки авторизации:', error);
            return null;
        }
    },

    async require() {
        const user = await this.check();
        if (!user) {
            window.location.href = '/login';
            return null;
        }
        return user;
    },

    async logout() {
        try {
            await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
        } catch (error) {
            console.error('Ошибка выхода:', error);
        }
        window.location.href = '/login';
    },

    updateUI(user) {
        const statusDot = document.getElementById('statusDot');
        const userName = document.getElementById('dropdownUserName');
        const userRole = document.getElementById('dropdownUserRole');

        if (user) {
            if (statusDot) statusDot.className = 'my-status-dot online';
            if (userName) userName.textContent = user.full_name || user.username;
            const roleMap = {
                'admin': 'Администратор',
                'engineer': 'Инженер',
                'operator': 'Оператор',
                'viewer': 'Просмотр'
            };
            if (userRole) userRole.textContent = roleMap[user.role] || user.role;
        } else {
            if (statusDot) statusDot.className = 'my-status-dot offline';
            if (userName) userName.textContent = 'Не авторизован';
            if (userRole) userRole.textContent = '—';
        }
    },

    _clearTimeouts() {
        if (this.hideTimeout) { clearTimeout(this.hideTimeout); this.hideTimeout = null; }
    },

    showDropdown() {
        this._clearTimeouts();
        this.isHovering = true;
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) dropdown.classList.add('show');
    },

    hideDropdown() {
        this.isHovering = false;
        this._clearTimeouts();
        this.hideTimeout = setTimeout(() => {
            const dropdown = document.getElementById('userDropdown');
            if (dropdown) dropdown.classList.remove('show');
            this.hideTimeout = null;
        }, this.HOVER_DELAY);
    },

    initLogout() {
        document.querySelectorAll('[data-action="logout"]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        });
    },

    initHover() {
        const avatar = document.getElementById('userAvatarBtn');
        const dropdown = document.getElementById('userDropdown');

        if (avatar) {
            avatar.addEventListener('mouseenter', () => this.showDropdown());
            avatar.addEventListener('mouseleave', () => this.hideDropdown());
        }

        if (dropdown) {
            dropdown.addEventListener('mouseenter', () => {
                this._clearTimeouts();
                this.isHovering = true;
            });
            dropdown.addEventListener('mouseleave', () => {
                this.hideDropdown();
            });
        }

        if (avatar) {
            avatar.addEventListener('click', (e) => {
                if (window.innerWidth <= 768) {
                    e.stopPropagation();
                    const dropdown = document.getElementById('userDropdown');
                    if (dropdown) {
                        dropdown.classList.toggle('show');
                    }
                }
            });
        }

        document.addEventListener('click', (e) => {
            const avatar = document.getElementById('userAvatarBtn');
            const dropdown = document.getElementById('userDropdown');
            if (avatar && dropdown && !avatar.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
                this._clearTimeouts();
            }
        });
    }
};