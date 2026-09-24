import TableRenderer from './TableRenderer.js';

/**
 * Universal Table Component — Класс управления данными, пагинацией и событиями таблицы.
 */
class Table {
    constructor(options) {
        this.containerId = options.containerId;
        this.tableKey = options.tableKey;
        this.pageSize = options.pageSize || 50;
        this.currentPage = 1;
        this.search = '';
        this.filters = {};
        this.sort = { key: 'id', direction: 'asc' };
        this.settings = {};

        this.schema = null;
        this.data = [];
        this.total = 0;
        this.loading = false;
        this._initialized = false;

        this.renderer = new TableRenderer();

        this._boundOnFilters = this._onFiltersChanged.bind(this);
        this._boundOnSettings = this._onSettingsChanged.bind(this);
        this._boundOnClick = this._onTableClick.bind(this);
        this._boundOnInput = this._onSearchInput.bind(this);
        this._boundOnDblClick = this._onCellDblClick.bind(this);
        
        this._searchTimeout = null;
    }

    async init() {
        if (this._initialized) return;
        this._initialized = true;

        await this.loadSchema();
        await this.loadData();
        this.render();
        this._bindEvents();
    }

    _bindEvents() {
        document.addEventListener('filtersChanged', this._boundOnFilters);
        document.addEventListener('tableSettingsChanged', this._boundOnSettings);
        
        const container = document.getElementById(this.containerId);
        if (container) {
            container.addEventListener('click', this._boundOnClick);
            container.addEventListener('input', this._boundOnInput);
            container.addEventListener('dblclick', this._boundOnDblClick);
        }
    }

    destroy() {
        document.removeEventListener('filtersChanged', this._boundOnFilters);
        document.removeEventListener('tableSettingsChanged', this._boundOnSettings);
        
        const container = document.getElementById(this.containerId);
        if (container) {
            container.removeEventListener('click', this._boundOnClick);
            container.removeEventListener('input', this._boundOnInput);
            container.removeEventListener('dblclick', this._boundOnDblClick);
        }
        
        if (this._searchTimeout) clearTimeout(this._searchTimeout);
        this._initialized = false;
    }

    _onFiltersChanged(e) {
        this.filters = e.detail?.filters || {};
        this.currentPage = 1;
        this.loadData();
    }

    _onSettingsChanged(e) {
        this.settings = e.detail?.settings || {};
        this.render();
    }

    _onTableClick(e) {
        const th = e.target.closest('th.sortable');
        if (th) {
            const key = th.dataset.col;
            if (key) this._toggleSort(key);
            return;
        }

        const btn = e.target.closest('.page-btn');
        if (btn) {
            const page = parseInt(btn.dataset.page);
            if (page && page !== this.currentPage) this.goToPage(page);
            return;
        }

        if (e.target.closest('.btn-column-settings')) {
            if (window._tableSettingsComponent) {
                window._tableSettingsComponent.openSettings(this.tableKey);
            } else {
                alert('Компонент настройки столбцов не подключен');
            }
        }
    }

    _onSearchInput(e) {
        const input = e.target.closest('.table-search-input');
        if (input) {
            clearTimeout(this._searchTimeout);
            this._searchTimeout = setTimeout(() => {
                this.search = input.value.trim();
                this.currentPage = 1;
                this.loadData();
            }, 300);
        }
    }

    _onCellDblClick(e) {
        const expander = e.target.closest('.col-expandable');
        if (expander) {
            const isExpanded = expander.dataset.expanded === 'true';
            if (isExpanded) {
                expander.dataset.expanded = 'false';
                expander.style.whiteSpace = 'nowrap';
                expander.style.overflow = 'hidden';
            } else {
                expander.dataset.expanded = 'true';
                expander.style.whiteSpace = 'normal';
                expander.style.overflow = 'visible';
            }
        }
    }

    async loadSchema() {
        try {
            const response = await fetch('/api/v1/tables/' + this.tableKey + '/schema', { credentials: 'include' });
            if (!response.ok) throw new Error('Код ответа сервера: ' + response.status);
            this.schema = await response.json();
            this.settings = this.schema.settings || this.schema.default_settings || {};
        } catch (error) {
            console.error('Ошибка загрузки схемы метаданных:', error);
            this._showError('Не удалось построить интерфейс таблицы из метаданных');
        }
    }

    async loadData() {
        if (!this.schema) await this.loadSchema();
        this.loading = true;
        this._showLoading();

        try {
            let url = '/api/v1/tables/' + this.tableKey + '/data?page=' + this.currentPage + '&per_page=' + this.pageSize;
            if (this.search) url += '&search=' + encodeURIComponent(this.search);
            if (this.sort.key) url += '&sort=' + this.sort.key + '&order=' + this.sort.direction;

            for (const [key, values] of Object.entries(this.filters)) {
                if (values && values.length > 0) {
                    url += '&filter_' + key + '=' + encodeURIComponent(values.join(','));
                }
            }

            const response = await fetch(url, { credentials: 'include' });
            if (!response.ok) throw new Error('Код ответа сервера: ' + response.status);
            
            const result = await response.json();
            this.data = result.data || [];
            this.total = result.meta?.total || 0;
        } catch (error) {
            console.error('Ошибка получения набора данных:', error);
            this._showError('Сбой загрузки данных с сервера');
        } finally {
            this.loading = false;
        }
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container || this.loading || !this.schema) return;

        // Отрисовываем чистую HTML-сетку таблицы контента
        container.innerHTML = this.renderer.render(this.schema, this.data, this.settings, this.currentPage, this.sort);

        // 1. Записываем имя страницы и аккуратный бадж записей вdynamicPageTitle
        const titleContainer = document.getElementById("dynamicPageTitle");
        if (titleContainer) {
            const label = this.schema.table?.table_name || "Справочник";
            let titleHtml = '<span class="page-title" style="font-weight: 600; font-size: var(--font-size-lg, 1rem); color: var(--text-primary, #1a1a2e);">' + label + '</span>';
            titleHtml += ' <span class="badge bg-secondary" style="font-size: 0.75rem; font-weight: 700; padding: 0.35em 0.65em; border-radius: 0.25rem;">' + this.total + ' записей</span>';
            titleContainer.innerHTML = titleHtml;
        }

        // 2. Выводим кнопки управления в dynamicToolbarRight в одну линию перед аватаром
        const toolbarRight = document.getElementById("dynamicToolbarRight");
        if (toolbarRight) {
            let btns = '';
            
            // Кнопка "Столбцы" рендерится на панели только если включен режим редактирования (this.editMode === true)
            if (this.editMode) {
                btns += '<button class="btn btn-sm btn-outline-secondary btn-column-settings" id="btnColumnSettings" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 0.25rem;"><span class="bi bi-layout-three-columns me-1"></span> Столбцы</button> ';
            }
            
            btns += '<button class="btn btn-sm btn-outline-secondary btn-edit-mode ' + (this.editMode ? 'active' : '') + '" id="editModeToggle" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 0.25rem;"><span class="bi bi-pencil me-1"></span> Редактировать</button> ';
            btns += '<button class="btn btn-sm btn-primary btn-add-row" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 0.25rem; background-color: var(--color-primary, #4a6cf7); color: #fff; border: 1px solid var(--color-primary, #4a6cf7);"><span class="bi bi-plus-circle me-1"></span> Добавить</button>';
            
            toolbarRight.innerHTML = btns;
        }

        this._renderPagination();
        this._checkTruncatedCells();
    }


    _renderPagination() {
        const container = document.getElementById(this.containerId);
        if (!container || !this.total || this.total <= this.pageSize) return;

        const pages = Math.ceil(this.total / this.pageSize);
        const current = this.currentPage;

        let html = '<nav class="table-pagination mt-3"><ul class="pagination pagination-sm justify-content-center mb-0">';
        html += '<li class="page-item ' + (current <= 1 ? 'disabled' : '') + '"><a class="page-link page-btn" data-page="' + (current - 1) + '">&laquo;</a></li>';
        
        for (let i = 1; i <= pages; i++) {
            if (i === current) {
                html += '<li class="page-item active"><span class="page-link">' + i + '</span></li>';
            } else if (i <= 2 || i > pages - 2 || Math.abs(i - current) <= 1) {
                html += '<li class="page-item"><a class="page-link page-btn" data-page="' + i + '">' + i + '</a></li>';
            } else if (i === 3 && current > 4) {
                html += '<li class="page-item disabled"><span class="page-link">…</span></li>';
            } else if (i === pages - 2 && current < pages - 3) {
                html += '<li class="page-item disabled"><span class="page-link">…</span></li>';
            }
        }
        
        html += '<li class="page-item ' + (current >= pages ? 'disabled' : '') + '"><a class="page-link page-btn" data-page="' + (current + 1) + '">&raquo;</a></li></ul></nav>';
        
        const wrapper = container.querySelector('.table-wrap');
        if (wrapper) wrapper.insertAdjacentHTML('afterend', html);
    }

    _checkTruncatedCells() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        
        setTimeout(() => {
            container.querySelectorAll('.col-truncated[data-tooltip]').forEach(el => {
                if (el.scrollWidth <= el.clientWidth) {
                    el.removeAttribute('data-tooltip');
                    el.style.cursor = 'default';
                }
            });
        }, 50);
    }

    _toggleSort(key) {
        this.sort = {
            key,
            direction: (this.sort.key === key && this.sort.direction === 'asc') ? 'desc' : 'asc'
        };
        this.currentPage = 1;
        this.loadData();
    }

    goToPage(page) {
        this.currentPage = page;
        this.loadData();
    }

    _showLoading() {
        const el = document.getElementById(this.containerId);
        if (el) el.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Загрузка данных...</p></div>';
    }

    _showError(msg) {
        const el = document.getElementById(this.containerId);
        if (el) el.innerHTML = '<div class="alert alert-danger m-3">⚠️ Сбой: ' + msg + '</div>';
    }
}

export default Table;