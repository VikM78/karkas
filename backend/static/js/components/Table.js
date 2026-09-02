/**
 * Table — универсальный компонент таблицы
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
        this._debug = true;  // Включить отладку
    }

    _log(...args) {
        if (this._debug) {
            console.log('[Table]', ...args);
        }
    }

    async init() {
        this._log('Инициализация...');
        if (this._initialized) return;
        this._initialized = true;

        await this.loadSchema();
        await this.loadData();
        this.render();

        this._bindEvents();
        this._log('Готово');
    }

    _bindEvents() {
        // Фильтры
        document.addEventListener('filtersChanged', (e) => {
            this.filters = e.detail?.filters || {};
            this.currentPage = 1;
            this.loadData();
        });

        // Настройки столбцов
        document.addEventListener('tableSettingsChanged', (e) => {
            this.settings = e.detail?.settings || {};
            this.render();
        });

        // Сортировка
        document.addEventListener('click', (e) => {
            const th = e.target.closest('th.sortable');
            if (th) {
                const key = th.dataset.key;
                if (key) {
                    this._toggleSort(key);
                }
            }
        });

        // Пагинация
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.page-btn');
            if (btn) {
                const page = parseInt(btn.dataset.page);
                if (page && page !== this.currentPage) {
                    this.goToPage(page);
                }
            }
        });

        // Поиск
        let searchTimeout;
        document.addEventListener('input', (e) => {
            const input = e.target.closest('.table-search-input');
            if (input) {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.search = input.value;
                    this.currentPage = 1;
                    this.loadData();
                }, 300);
            }
        });
    }

    async loadSchema() {
        this._log('Загрузка схемы...');
        try {
            const response = await fetch(`/api/v1/tables/${this.tableKey}/schema`, {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`Ошибка загрузки схемы: ${response.status}`);
            }

            this.schema = await response.json();
            this.settings = this.schema.settings || this.schema.default_settings || {};
            this._log('Схема загружена:', this.schema);

        } catch (error) {
            console.error('Ошибка загрузки схемы:', error);
            this._showError('Не удалось загрузить структуру таблицы');
        }
    }

    async loadData() {
        this._log('Загрузка данных...');
        if (!this.schema) {
            await this.loadSchema();
        }

        this.loading = true;
        this._showLoading();

        try {
            let url = `/api/v1/tables/${this.tableKey}/data?page=${this.currentPage}&per_page=${this.pageSize}`;

            if (this.search) {
                url += `&search=${encodeURIComponent(this.search)}`;
            }

            if (this.sort.key) {
                url += `&sort=${this.sort.key}&order=${this.sort.direction}`;
            }

            for (const [key, values] of Object.entries(this.filters)) {
                if (values && values.length > 0) {
                    url += `&filter_${key}=${encodeURIComponent(values.join(','))}`;
                }
            }

            this._log('URL:', url);

            const response = await fetch(url, { credentials: 'include' });

            if (!response.ok) {
                throw new Error(`Ошибка загрузки данных: ${response.status}`);
            }

            const result = await response.json();
            this.data = result.data || [];
            this.total = result.meta?.total || 0;
            this._log('Данные загружены:', this.data.length, 'записей');

        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            this._showError('Не удалось загрузить данные');
        }

        this.loading = false;
        this.render();
    }

    render() {
        this._log('Рендеринг...');
        if (!this.schema) {
            this._showError('Схема не загружена');
            return;
        }

        if (this.loading) {
            this._log('Загрузка...');
            return;
        }

        this._renderTable();
        this._renderToolbar();
        this._renderPagination();
        this._updateFilterButtons();
        this._log('Рендеринг завершён');
    }

    _renderTable() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Контейнер не найден:', this.containerId);
            return;
        }

        const visibleColumns = this._getVisibleColumns();
        const data = this.data || [];

        this._log('Рендеринг таблицы:', { columns: visibleColumns.length, rows: data.length });

        if (!data.length) {
            container.innerHTML = this._buildEmptyState(visibleColumns.length || 1);
            this._log('Нет данных для отображения');
            return;
        }

        const labels = this.settings.labels || this.schema.default_settings?.labels || {};

        let html = `
            <div class="table-wrapper" style="overflow-x: auto;">
                <table class="universal-table">
                    <thead>
                        <tr>
                            ${visibleColumns.map(col => `
                                <th style="width: ${col._width || col.width || 150}px; min-width: ${col.min_width || 50}px; max-width: ${col.max_width || 500}px;"
                                    data-key="${col.key}"
                                    class="${col.sortable ? 'sortable' : ''}">
                                    <div class="th-content">
                                        <span class="th-label">${labels[col.key] || col.label}</span>
                                        ${col.sortable ? `<span class="sort-indicator">${this.sort.key === col.key ? (this.sort.direction === 'asc' ? '↑' : '↓') : '⇅'}</span>` : ''}
                                        ${col.filterable ? `<button class="filter-btn" data-key="${col.key}">🔽</button>` : ''}
                                    </div>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((item, index) => `
                            <tr data-id="${item.id || index}">
                                ${visibleColumns.map(col => `
                                    <td>${this._renderCell(item, col, index)}</td>
                                `).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
        this._log('Таблица отрендерена');
    }

    _getVisibleColumns() {
        if (!this.schema || !this.schema.columns) {
            return [];
        }

        const visibleKeys = this.settings.visible || this.schema.default_settings?.visible || [];
        const order = this.settings.order || this.schema.default_settings?.order || [];
        const widths = this.settings.widths || this.schema.default_settings?.widths || {};
        const columns = this.schema.columns || [];

        let filtered = columns.filter(col => visibleKeys.includes(col.key) || col.fixed);

        filtered.sort((a, b) => {
            const ia = order.indexOf(a.key);
            const ib = order.indexOf(b.key);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        filtered.forEach(col => {
            col._width = widths[col.key] || col.width || 150;
        });

        return filtered;
    }

    _renderCell(item, column, index) {
        const value = item[column.key];

        if (column.type === 'row_number') return index + 1;

        if (column.type === 'status' && column.values) {
            const val = column.values.find(v => v.key === value);
            if (val) {
                return `<span class="status-badge" style="background:${val.color}20; color:${val.color};">${val.icon ? `<i class="bi ${val.icon}"></i>` : ''} ${val.label}</span>`;
            }
            return value || '';
        }

        if (column.type === 'boolean') {
            return value
                ? '<span class="badge bg-success"><i class="bi bi-check-lg"></i></span>'
                : '<span class="badge bg-secondary"><i class="bi bi-x-lg"></i></span>';
        }

        if ((column.type === 'datetime' || column.type === 'date') && value) {
            try {
                const d = new Date(value);
                return column.type === 'date'
                    ? d.toLocaleDateString('ru-RU')
                    : d.toLocaleString('ru-RU');
            } catch { return value; }
        }

        if (column.type === 'currency' && value !== null && value !== undefined) {
            return new Intl.NumberFormat('ru-RU', {
                style: 'currency',
                currency: 'RUB',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(value);
        }

        if (column.type === 'percent' && value !== null && value !== undefined) {
            return value.toFixed(2) + '%';
        }

        if ((column.type === 'int' || column.type === 'numeric') && value !== null && value !== undefined) {
            return new Intl.NumberFormat('ru-RU').format(value);
        }

        if (column.type === 'url' && value) {
            return `<a href="${value}" target="_blank">${value}</a>`;
        }

        if (column.type === 'email' && value) {
            return `<a href="mailto:${value}">${value}</a>`;
        }

        return value || '';
    }

    _buildEmptyState(colspan) {
        return `
            <div class="table-wrapper">
                <table class="universal-table">
                    <tbody>
                        <tr>
                            <td colspan="${colspan || 1}" class="text-center text-muted py-4">
                                <i class="bi bi-inbox me-2"></i>Нет данных
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    _renderToolbar() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const existing = container.querySelector('.table-toolbar');
        if (existing) existing.remove();

        const toolbar = document.createElement('div');
        toolbar.className = 'table-toolbar';
        toolbar.innerHTML = `
            <div class="toolbar-left">
                <div class="input-group input-group-sm" style="width: 250px;">
                    <input type="text" class="form-control table-search-input" placeholder="Поиск..." value="${this.search || ''}">
                    <button class="btn btn-outline-secondary" type="button">
                        <i class="bi bi-search"></i>
                    </button>
                </div>
                <span class="badge bg-secondary" id="tableRecordCount">${this.total || 0} записей</span>
            </div>
            <div class="toolbar-right">
                <button class="btn btn-sm btn-outline-secondary btn-column-settings" data-table-key="${this.tableKey}">
                    <i class="bi bi-layout-three-columns"></i> Столбцы
                </button>
                <button class="btn btn-sm btn-primary btn-add-row" data-table-key="${this.tableKey}">
                    <i class="bi bi-plus-circle"></i> Добавить
                </button>
            </div>
        `;

        container.prepend(toolbar);

        toolbar.querySelector('.btn-column-settings')?.addEventListener('click', () => {
            this._openSettings();
        });

        toolbar.querySelector('.btn-add-row')?.addEventListener('click', () => {
            alert('Добавление записи будет реализовано позже');
        });
    }

    _openSettings() {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'columnSettingsModal';
        modal.tabIndex = -1;
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">⚙️ Настройка столбцов</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="column-settings-list">
                            ${this._getVisibleColumns().map(col => `
                                <div class="column-settings-item" data-key="${col.key}">
                                    <span class="drag-handle">⠿</span>
                                    <input type="checkbox" class="col-visibility" ${this.settings.visible?.includes(col.key) || col.fixed ? 'checked' : ''} ${col.fixed ? 'disabled' : ''}>
                                    <input type="text" class="col-label" value="${this.settings.labels?.[col.key] || col.label}" placeholder="Название">
                                    <input type="number" class="col-width" value="${this.settings.widths?.[col.key] || col.width || 150}" min="30" max="800" ${col.fixed ? 'disabled' : ''}>
                                    <span class="col-width-unit">px</span>
                                    ${col.fixed ? '<span class="badge bg-secondary">Фикс</span>' : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline-secondary btn-reset-settings">🔄 Сбросить</button>
                        <button class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        <button class="btn btn-primary btn-save-settings">💾 Сохранить</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        let dragItem = null;
        const list = modal.querySelector('.column-settings-list');
        list.addEventListener('mousedown', (e) => {
            const handle = e.target.closest('.drag-handle');
            if (!handle) return;
            dragItem = handle.closest('.column-settings-item');
            if (!dragItem) return;
            e.preventDefault();

            const onMove = (ev) => {
                const target = document.elementFromPoint(ev.clientX, ev.clientY);
                if (!target) return;
                const targetItem = target.closest('.column-settings-item');
                if (targetItem && targetItem !== dragItem) {
                    const rect = targetItem.getBoundingClientRect();
                    if (ev.clientY > rect.top + rect.height / 2) {
                        list.insertBefore(dragItem, targetItem.nextSibling);
                    } else {
                        list.insertBefore(dragItem, targetItem);
                    }
                    dragItem.classList.add('dragging');
                }
            };
            const onUp = () => {
                if (dragItem) dragItem.classList.remove('dragging');
                dragItem = null;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        modal.querySelector('.btn-save-settings')?.addEventListener('click', () => {
            const items = modal.querySelectorAll('.column-settings-item');
            const visible = [];
            const widths = {};
            const labels = {};
            const order = [];

            items.forEach(item => {
                const key = item.dataset.key;
                const checkbox = item.querySelector('.col-visibility');
                const labelInput = item.querySelector('.col-label');
                const widthInput = item.querySelector('.col-width');
                if (checkbox && !checkbox.disabled && checkbox.checked) visible.push(key);
                if (labelInput) labels[key] = labelInput.value || key;
                if (widthInput) widths[key] = parseInt(widthInput.value) || 150;
                order.push(key);
            });

            const settings = {
                visible,
                widths,
                labels,
                order,
                filters: this.settings.filters || {},
                sort: this.settings.sort || {}
            };

            fetch(`/api/v1/tables/${this.tableKey}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(settings)
            })
            .then(r => r.json())
            .then(() => {
                this.settings = settings;
                const bsModal = bootstrap.Modal.getInstance(modal);
                if (bsModal) bsModal.hide();
                this.render();
            })
            .catch(err => {
                console.error('Ошибка:', err);
                alert('Ошибка сохранения настроек');
            });
        });

        modal.querySelector('.btn-reset-settings')?.addEventListener('click', () => {
            if (confirm('Сбросить настройки к значениям по умолчанию?')) {
                const defaults = this.schema.default_settings || {};
                this.settings = {
                    visible: defaults.visible || [],
                    widths: defaults.widths || {},
                    labels: defaults.labels || {},
                    order: defaults.order || []
                };
                const bsModal = bootstrap.Modal.getInstance(modal);
                if (bsModal) bsModal.hide();
                this.render();
            }
        });

        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
    }

    _renderPagination() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const existing = container.querySelector('.table-pagination');
        if (existing) existing.remove();

        if (!this.total || this.total <= this.pageSize) return;

        const pages = Math.ceil(this.total / this.pageSize);
        const current = this.currentPage;

        let html = `
            <nav class="table-pagination mt-2">
                <ul class="pagination pagination-sm justify-content-center mb-0">
                    <li class="page-item ${current <= 1 ? 'disabled' : ''}">
                        <a class="page-link page-btn" data-page="${current - 1}">&laquo;</a>
                    </li>
        `;

        for (let i = 1; i <= pages; i++) {
            if (i === current) {
                html += `<li class="page-item active"><span class="page-link">${i}</span></li>`;
            } else if (i <= 3 || i > pages - 3 || Math.abs(i - current) <= 1) {
                html += `<li class="page-item"><a class="page-link page-btn" data-page="${i}">${i}</a></li>`;
            } else if (i === 4 && current > 5) {
                html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
            } else if (i === pages - 3 && current < pages - 4) {
                html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
            }
        }

        html += `
                    <li class="page-item ${current >= pages ? 'disabled' : ''}">
                        <a class="page-link page-btn" data-page="${current + 1}">&raquo;</a>
                    </li>
                </ul>
            </nav>
        `;

        const wrapper = container.querySelector('.table-wrapper');
        if (wrapper) {
            wrapper.insertAdjacentHTML('afterend', html);
        }
    }

    _updateFilterButtons() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            const key = btn.dataset.key;
            const active = this.filters[key] && this.filters[key].length > 0;
            btn.classList.toggle('active', active);
        });
    }

    _toggleSort(key) {
        if (this.sort.key === key) {
            if (this.sort.direction === 'asc') {
                this.sort.direction = 'desc';
            } else {
                this.sort.key = 'id';
                this.sort.direction = 'asc';
            }
        } else {
            this.sort.key = key;
            this.sort.direction = 'asc';
        }
        this.currentPage = 1;
        this.loadData();
    }

    goToPage(page) {
        const pages = Math.ceil(this.total / this.pageSize);
        if (page < 1 || page > pages) return;
        this.currentPage = page;
        this.loadData();
    }

    _showLoading() {
        const container = document.getElementById(this.containerId);
        if (container) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Загрузка...</span>
                    </div>
                    <p class="mt-2 text-muted">Загрузка данных...</p>
                </div>
            `;
        }
    }

    _showError(message) {
        const container = document.getElementById(this.containerId);
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger m-3">
                    <i class="bi bi-exclamation-triangle me-2"></i>${message}
                </div>
            `;
        }
    }

    refresh() {
        this.loadData();
    }
}

// Экспорт для ES Module
export default Table;