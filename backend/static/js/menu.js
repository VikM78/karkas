/* ============================================================
   МЕНЮ
   ============================================================ */

const MENU = {
    STORAGE_KEY: 'karkas_menu_state',
    CACHE_KEY: 'karkas_menu_cache',
    VERSION_KEY: 'karkas_menu_version',
    HOVER_DELAY: 300,
    hideTimeout: null,
    showTimeout: null,
    isHovering: false,

    // Запасные иконки для групп
    DEFAULT_GROUP_ICONS: {
        'catalog': 'bi-folder',
        'constructor': 'bi-puzzle',
        'purchases': 'bi-cart',
        'warehouse': 'bi-box-seam',
        'reports': 'bi-graph-up',
        'system': 'bi-gear'
    },

    getDefaultState() {
        return {
            sidebarOpen: true,
            expandedGroups: []
        };
    },

    loadState() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...this.getDefaultState(), ...parsed };
            }
        } catch (e) {}
        return this.getDefaultState();
    },

    saveState(state) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
        } catch (e) {}
    },

    async loadData() {
        try {
            const cachedVersion = localStorage.getItem(this.VERSION_KEY);
            const cachedMenu = localStorage.getItem(this.CACHE_KEY);

            const response = await fetch('/api/v1/menu', { credentials: 'include' });
            if (!response.ok) throw new Error('Ошибка загрузки меню');
            const data = await response.json();

            if (data.version && cachedVersion && cachedVersion === String(data.version) && cachedMenu) {
                console.log('📦 Меню загружено из кеша (версия:', data.version, ')');
                return JSON.parse(cachedMenu);
            }

            console.log('📦 Меню загружено с сервера (версия:', data.version || 'не задана', ')');
            if (data.version) {
                localStorage.setItem(this.VERSION_KEY, String(data.version));
            }
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(data.menu));

            return data.menu;
        } catch (error) {
            console.error('❌ Ошибка загрузки меню:', error);
            const cached = localStorage.getItem(this.CACHE_KEY);
            if (cached) {
                console.log('📦 Использован кеш меню (офлайн-режим)');
                return JSON.parse(cached);
            }
            return [];
        }
    },

    render(items, state) {
        const nav = document.getElementById('sidebarNav');
        if (!nav) return;

        if (!items || items.length === 0) {
            nav.innerHTML = `<div class="nav-item" style="color: rgba(255,255,255,0.3); padding: 12px;">Меню не загружено</div>`;
            return;
        }

        let html = '';
        const expanded = state.expandedGroups || [];

        items.forEach(item => {
            if (item.is_group) {
                const isOpen = expanded.includes(item.key);
                const icon = item.icon || this.DEFAULT_GROUP_ICONS[item.key] || 'bi-folder';
                const tooltip = item.tooltip || item.title;
                html += `
                    <div class="nav-group">
                        <div class="nav-group-title" data-group="${item.key}" onclick="MENU.toggleGroup('${item.key}')" title="${tooltip}">
                            <span class="group-arrow ${isOpen ? 'open' : ''}">▶</span>
                            <i class="bi ${icon} group-icon"></i>
                            <span>${item.title}</span>
                        </div>
                        <div class="nav-group-items ${isOpen ? 'open' : ''}">
                            ${this._renderItems(item.items)}
                        </div>
                    </div>
                `;
            } else if (item.is_divider) {
                html += `<div class="nav-divider"></div>`;
            } else {
                html += this._renderItem(item);
            }
        });

        nav.innerHTML = html;
        this._updateActiveLink();
    },

    _renderItem(item) {
        const url = item.url && item.url !== '#' ? item.url : 'javascript:void(0)';
        const tooltip = item.tooltip || item.title;
        return `
            <div class="nav-item">
                <a href="${url}" class="nav-link" data-key="${item.key}" title="${tooltip}">
                    ${item.icon ? `<i class="bi ${item.icon}"></i>` : ''}
                    <span class="nav-text">${item.title}</span>
                </a>
            </div>
        `;
    },

    _renderItems(items) {
        if (!items || items.length === 0) {
            return '<div style="padding:4px 12px;color:rgba(255,255,255,0.2);font-size:12px;">Нет пунктов</div>';
        }
        return items.map(item => this._renderItem(item)).join('');
    },

    // ===== АКТИВНАЯ ССЫЛКА =====
    _updateActiveLink() {
        const currentPath = window.location.pathname;
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href');
            // Сравниваем пути
            if (href && href === currentPath) {
                link.classList.add('active');
            }
            // Для корневого пути
            if (href === '/' && currentPath === '/') {
                link.classList.add('active');
            }
            // Для страниц /app/*
            if (href && href.startsWith('/app/') && currentPath === href) {
                link.classList.add('active');
            }
        });
    },

    // ===== УПРАВЛЕНИЕ ГРУППАМИ =====
    toggleGroup(groupKey) {
        const state = this.loadState();
        const index = state.expandedGroups.indexOf(groupKey);
        if (index > -1) {
            state.expandedGroups.splice(index, 1);
        } else {
            state.expandedGroups.push(groupKey);
        }
        this.saveState(state);
        this._updateGroupUI(groupKey);
    },

    _updateGroupUI(groupKey) {
        const state = this.loadState();
        const isOpen = state.expandedGroups.includes(groupKey);

        const titles = document.querySelectorAll('.nav-group-title');
        const items = document.querySelectorAll('.nav-group-items');

        titles.forEach((title, index) => {
            if (title.dataset.group === groupKey) {
                const arrow = title.querySelector('.group-arrow');
                if (arrow) {
                    arrow.classList.toggle('open', isOpen);
                }
                if (items[index]) {
                    items[index].classList.toggle('open', isOpen);
                }
            }
        });
    },

    // ===== УПРАВЛЕНИЕ ВИДИМОСТЬЮ САЙДБАРА =====
    toggleSidebar() {
        const state = this.loadState();
        state.sidebarOpen = !state.sidebarOpen;
        this.saveState(state);
        this.applyState(state);
        this._clearTimeouts();
    },

    applyState(state) {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('sidebarToggle');
        if (!sidebar) return;

        if (state.sidebarOpen) {
            sidebar.classList.remove('hidden');
            if (toggleBtn) toggleBtn.innerHTML = '<i class="bi bi-chevron-left"></i>';
        } else {
            sidebar.classList.add('hidden');
            if (toggleBtn) toggleBtn.innerHTML = '<i class="bi bi-chevron-right"></i>';
        }
    },

    // ===== HOVER-ПОКАЗ МЕНЮ =====
    _clearTimeouts() {
        if (this.showTimeout) { clearTimeout(this.showTimeout); this.showTimeout = null; }
        if (this.hideTimeout) { clearTimeout(this.hideTimeout); this.hideTimeout = null; }
    },

    showOnHover() {
        this._clearTimeouts();
        this.isHovering = true;
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('hidden')) {
            sidebar.classList.add('hover-show');
        }
    },

    hideOnHoverLeave() {
        this.isHovering = false;
        this._clearTimeouts();
        this.hideTimeout = setTimeout(() => {
            const sidebar = document.getElementById('sidebar');
            const state = this.loadState();
            if (sidebar && !state.sidebarOpen) {
                sidebar.classList.remove('hover-show');
            }
            this.hideTimeout = null;
        }, this.HOVER_DELAY);
    },

    // ===== ИНИЦИАЛИЗАЦИЯ =====
    async init() {
        const items = await this.loadData();
        const state = this.loadState();
        this.render(items, state);
        this.applyState(state);

        // Кнопка сворачивания
        const toggleBtn = document.getElementById('sidebarToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSidebar();
            });
        }

        // HOVER-триггер
        const trigger = document.getElementById('sidebarTrigger');
        if (trigger) {
            trigger.addEventListener('mouseenter', () => this.showOnHover());
            trigger.addEventListener('mouseleave', () => this.hideOnHoverLeave());
        }

        // HOVER на самом меню
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.addEventListener('mouseenter', () => {
                this._clearTimeouts();
                this.isHovering = true;
            });
            sidebar.addEventListener('mouseleave', () => {
                this.hideOnHoverLeave();
            });
        }

        // Клик по пункту меню — закрываем hover-режим
        document.addEventListener('click', (e) => {
            const link = e.target.closest('.nav-link');
            if (link) {
                const sidebar = document.getElementById('sidebar');
                const state = this.loadState();
                if (sidebar && !state.sidebarOpen) {
                    sidebar.classList.remove('hover-show');
                    this.isHovering = false;
                    this._clearTimeouts();
                }
            }
        });

        // Клик вне меню — закрываем hover-режим
        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('sidebar');
            const state = this.loadState();
            if (sidebar && !state.sidebarOpen && !sidebar.contains(e.target)) {
                sidebar.classList.remove('hover-show');
                this.isHovering = false;
                this._clearTimeouts();
            }
        });
    }
};