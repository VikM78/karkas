/* ============================================================
   МЕНЮ И SIDEBAR
   ============================================================
   Логика:
   - Sidebar скрыт по умолчанию (CSS: translateX(-100%)).
   - Открытие: класс .show на .my-sidebar.
   - Закрепление: класс .pinned на .my-sidebar + .sidebar-pinned на body.
   - Оверлей: класс .active на .my-sidebar-overlay.
   ============================================================ */

const MENU = {
    STORAGE_KEY: 'karkas_menu_state',
    CACHE_KEY: 'karkas_menu_cache',
    VERSION_KEY: 'karkas_menu_version',
    HOVER_DELAY: 300,
    hideTimeout: null,
    isHovering: false,

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
            pinned: false,
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

            const response = await fetch('/api/v1/menu/', { credentials: 'include' });
            if (!response.ok) throw new Error('Ошибка загрузки меню');
            const data = await response.json();

            if (data.version && cachedVersion && cachedVersion === String(data.version) && cachedMenu) {
                console.log('📦 Меню загружено из кеша');
                return JSON.parse(cachedMenu);
            }

            console.log('📦 Меню загружено с сервера');
            if (data.version) {
                localStorage.setItem(this.VERSION_KEY, String(data.version));
            }
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(data.menu));

            return data.menu;
        } catch (error) {
            console.error('❌ Ошибка загрузки меню:', error);
            const cached = localStorage.getItem(this.CACHE_KEY);
            if (cached) {
                console.log('📦 Использован кеш меню');
                return JSON.parse(cached);
            }
            return [];
        }
    },

    render(items, state) {
        const nav = document.getElementById('sidebarNav');
        if (!nav) return;

        if (!items || items.length === 0) {
            nav.innerHTML = '<div class="my-nav-item" style="color: rgba(255,255,255,0.3); padding: 12px;">Меню не загружено</div>';
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
                    <div class="my-nav-group">
                        <div class="my-nav-group-title" data-group="${item.key}" onclick="MENU.toggleGroup('${item.key}')" title="${tooltip}">
                            <span class="my-group-arrow ${isOpen ? 'open' : ''}">▶</span>
                            <i class="bi ${icon} my-group-icon"></i>
                            <span class="my-group-text">${item.title}</span>
                        </div>
                        <div class="my-nav-group-items ${isOpen ? 'open' : ''}">
                            ${this._renderItems(item.items)}
                        </div>
                    </div>
                `;
            } else if (item.is_divider) {
                html += `<div class="my-nav-divider"></div>`;
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
            <div class="my-nav-item">
                <a href="${url}" class="my-nav-link" data-key="${item.key}" title="${tooltip}">
                    ${item.icon ? `<i class="bi ${item.icon}"></i>` : ''}
                    <span class="my-nav-text">${item.title}</span>
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

    _updateActiveLink() {
        const currentPath = window.location.pathname;
        document.querySelectorAll('.my-nav-link').forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href');
            if (href && href === currentPath) {
                link.classList.add('active');
            }
            if (href === '/' && currentPath === '/') {
                link.classList.add('active');
            }
            if (href && href.startsWith('/app/') && currentPath === href) {
                link.classList.add('active');
            }
        });
    },

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

        const titles = document.querySelectorAll('.my-nav-group-title');
        const items = document.querySelectorAll('.my-nav-group-items');

        titles.forEach((title, index) => {
            if (title.dataset.group === groupKey) {
                const arrow = title.querySelector('.my-group-arrow');
                if (arrow) {
                    arrow.classList.toggle('open', isOpen);
                }
                if (items[index]) {
                    items[index].classList.toggle('open', isOpen);
                }
            }
        });
    },

    /* ===== УПРАВЛЕНИЕ SIDEBAR ===== */

    _clearTimeouts() {
        if (this.hideTimeout) { clearTimeout(this.hideTimeout); this.hideTimeout = null; }
    },

    showSidebar() {
        this._clearTimeouts();
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.add('show');
        if (overlay) overlay.classList.add('active');
    },

    hideSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const state = this.loadState();
        if (state.pinned) return;
        if (sidebar) sidebar.classList.remove('show');
        if (overlay) overlay.classList.remove('active');
    },

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        if (sidebar.classList.contains('show')) {
            this.hideSidebar();
        } else {
            this.showSidebar();
        }
    },

    togglePin() {
        const state = this.loadState();
        state.pinned = !state.pinned;
        this.saveState(state);
        this.applyState(state);
    },

    applyState(state) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const pinBtn = document.getElementById('sidebarPinBtn');
        const body = document.body;

        if (!sidebar) return;

        if (state.pinned) {
            sidebar.classList.add('pinned');
            sidebar.classList.add('show');
            if (overlay) overlay.classList.remove('active');
            if (pinBtn) pinBtn.classList.add('pinned');
            body.classList.add('sidebar-pinned');
        } else {
            sidebar.classList.remove('pinned');
            sidebar.classList.remove('show');
            if (overlay) overlay.classList.remove('active');
            if (pinBtn) pinBtn.classList.remove('pinned');
            body.classList.remove('sidebar-pinned');
        }
    },

    showOnHover() {
        const state = this.loadState();
        if (state.pinned) return;
        this._clearTimeouts();
        this.isHovering = true;
        this.showSidebar();
    },

    hideOnHoverLeave() {
        const state = this.loadState();
        if (state.pinned) return;
        this.isHovering = false;
        this._clearTimeouts();
        this.hideTimeout = setTimeout(() => {
            this.hideSidebar();
            this.hideTimeout = null;
        }, this.HOVER_DELAY);
    },

    async init() {
        const items = await this.loadData();
        const state = this.loadState();
        this.render(items, state);
        this.applyState(state);

        const menuToggle = document.getElementById('menuToggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSidebar();
            });
        }

        const pinBtn = document.getElementById('sidebarPinBtn');
        if (pinBtn) {
            pinBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.togglePin();
            });
        }

        const closeBtn = document.getElementById('sidebarCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideSidebar();
            });
        }

        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) {
            overlay.addEventListener('click', () => {
                this.hideSidebar();
            });
        }

        const trigger = document.getElementById('sidebarTrigger');
        if (trigger) {
            trigger.addEventListener('mouseenter', () => this.showOnHover());
            trigger.addEventListener('mouseleave', () => this.hideOnHoverLeave());
        }

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

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideSidebar();
            }
        });

        document.addEventListener('click', (e) => {
            const link = e.target.closest('.my-nav-link');
            if (link) {
                const state = this.loadState();
                if (!state.pinned) {
                    this.hideSidebar();
                }
            }
        });
    }
};