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
            window.location.href = '/login';
        } catch (error) {
            console.error('Ошибка выхода:', error);
            window.location.href = '/login';
        }
    },

    updateUI(user) {
        const statusDot = document.getElementById('statusDot');
        const userName = document.getElementById('dropdownUserName');
        const userRole = document.getElementById('dropdownUserRole');

        if (user) {
            statusDot.className = 'status-dot online';
            userName.textContent = user.full_name || user.username;
            const roleMap = {
                'admin': 'Администратор',
                'engineer': 'Инженер',
                'operator': 'Оператор',
                'viewer': 'Просмотр'
            };
            userRole.textContent = roleMap[user.role] || user.role;
        } else {
            statusDot.className = 'status-dot offline';
            userName.textContent = 'Не авторизован';
            userRole.textContent = '—';
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

        // Клик для мобильных
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

        // Закрытие при клике вне
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