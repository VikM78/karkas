/**
 * TableRenderer — рендеринг таблицы на основе схемы
 * Исправления: ширина столбцов из переменных
 */

class TableRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Контейнер ${containerId} не найден`);
        }
        this._resizeData = null;
        this._rowResizeData = null;
        this._state = null;
    }

    async init(tableKey) {
        this.tableKey = tableKey;
        await this._loadSchema();
        await this._loadData();
        this.render();
    }

    async _loadSchema() {
        try {
            const response = await fetch(`/api/v1/tables/${this.tableKey}/schema`, {
                credentials: 'include'
            });
            if (!response.ok) {
                throw new Error(`Ошибка загрузки схемы: ${response.status}`);
            }
            this.schema = await response.json();
            this.settings = this.schema.settings || this.schema.default_settings || {};
        } catch (error) {
            console.error('Ошибка загрузки схемы:', error);
            this._showError('Не удалось загрузить структуру таблицы');
        }
    }

    async _loadData() {
        if (!this.schema) {
            await this._loadSchema();
        }
        try {
            let url = `/api/v1/tables/${this.tableKey}/data?page=1&per_page=50`;
            const response = await fetch(url, { credentials: 'include' });
            if (!response.ok) {
                throw new Error(`Ошибка загрузки данных: ${response.status}`);
            }
            const result = await response.json();
            this.data = result.data || [];
            this.total = result.meta?.total || 0;
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            this.data = [];
        }
    }

    render() {
        if (!this.schema || !this.data) {
            console.warn('Нет данных для отображения');
            return;
        }
        const visibleColumns = this._getVisibleColumns();
        const html = this._buildTable(visibleColumns, this.data);
        this.container.innerHTML = html;
        this._checkTruncatedCells();
        this._setupColumnResize();
        this._setupRowResize();
        this._setupAutoWidth();
        this._restoreRowHeights();
    }

    _getVisibleColumns() {
        if (!this.schema || !this.schema.columns) return [];
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

    _buildTable(columns, data) {
        if (!data || data.length === 0) {
            return this._buildEmptyState(columns.length);
        }
        const labels = this.settings.labels || this.schema.default_settings?.labels || {};
        const order = this.settings.order || this.schema.default_settings?.order || [];
        const sortedColumns = [...columns].sort((a, b) => {
            const ia = order.indexOf(a.key);
            const ib = order.indexOf(b.key);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        const rowIndex = sortedColumns.findIndex(c => c.key === 'row' || c.type === 'row_number');

        let html = `
            <div class="table-wrapper" style="overflow-x: auto; overflow-y: auto; position: relative;">
                <table class="table table-hover table-sm table-custom" style="table-layout: fixed; width: 100%; border-collapse: collapse;">
                    <colgroup>
                        ${sortedColumns.map((col, idx) => {
                            const key = col.key;
                            if (key === 'row' || col.type === 'row_number') {
                                return `<col data-col="${key}" class="col-row" style="width: var(--col-width-row, auto); min-width: var(--col-row-min-width, 25px);">`;
                            } else if (key === 'name') {
                                return `<col data-col="${key}" class="col-name" style="width: var(--col-width-name, auto);">`;
                            } else if (key === 'comment') {
                                return `<col data-col="${key}" class="col-comment" style="width: var(--col-width-comment, 150px); min-width: var(--col-width-comment, 150px);">`;
                            } else if (key === 'status' || col.type === 'status') {
                                return `<col data-col="${key}" class="col-status" style="width: var(--col-width-status, 40px); min-width: var(--col-width-status, 40px); max-width: var(--col-width-status, 40px);">`;
                            } else if (key === 'created_at') {
                                return `<col data-col="${key}" class="col-created-at" style="width: var(--col-width-created-at, 150px); min-width: var(--col-width-created-at, 150px);">`;
                            } else if (key === 'updated_at') {
                                return `<col data-col="${key}" class="col-updated-at" style="width: var(--col-width-updated-at, 150px); min-width: var(--col-width-updated-at, 150px);">`;
                            } else if (key === 'updated_by') {
                                return `<col data-col="${key}" class="col-updated-by" style="width: var(--col-width-updated-by, 120px); min-width: var(--col-width-updated-by, 120px);">`;
                            } else {
                                return `<col data-col="${key}" style="width: ${col._width || 150}px; min-width: ${col.min_width || 30}px; max-width: ${col.max_width || 600}px;">`;
                            }
                        }).join('')}
                    </colgroup>
                    <thead>
                        <tr>
                            ${sortedColumns.map((col, idx) => {
                                const isFixed = col.key === 'row' || col.key === 'actions' || col.fixed;
                                const isRow = col.key === 'row' || col.type === 'row_number';
                                let style = '';
                                let colClass = '';
                                if (isRow) {
                                    style = 'width: var(--col-width-row, auto); min-width: var(--col-row-min-width, 25px); text-align: var(--col-row-align, center);';
                                    colClass = 'col-row';
                                } else if (col.key === 'name') {
                                    style = 'width: var(--col-width-name, auto);';
                                    colClass = 'col-name';
                                } else if (col.key === 'comment') {
                                    style = 'width: var(--col-width-comment, 150px); min-width: var(--col-width-comment, 150px);';
                                    colClass = 'col-comment';
                                } else if (col.key === 'status' || col.type === 'status') {
                                    style = 'width: var(--col-width-status, 40px); min-width: var(--col-width-status, 40px); max-width: var(--col-width-status, 40px); text-align: center;';
                                    colClass = 'col-status';
                                } else if (col.key === 'created_at') {
                                    style = 'width: var(--col-width-created-at, 150px); min-width: var(--col-width-created-at, 150px);';
                                    colClass = 'col-created-at';
                                } else if (col.key === 'updated_at') {
                                    style = 'width: var(--col-width-updated-at, 150px); min-width: var(--col-width-updated-at, 150px);';
                                    colClass = 'col-updated-at';
                                } else if (col.key === 'updated_by') {
                                    style = 'width: var(--col-width-updated-by, 120px); min-width: var(--col-width-updated-by, 120px);';
                                    colClass = 'col-updated-by';
                                } else {
                                    style = `width: ${col._width || 150}px; min-width: ${col.min_width || 30}px; max-width: ${col.max_width || 600}px;`;
                                }
                                const stickyClass = isRow ? 'col-row-sticky' : '';
                                const fixedClass = isFixed ? 'col-fixed' : '';
                                return `
                                    <th data-col="${col.key}" data-index="${idx}"
                                        style="${style} position: relative; ${isFixed ? 'cursor: default;' : ''}"
                                        class="${col.sortable ? 'sortable' : ''} ${fixedClass} ${stickyClass} ${colClass}">
                                        <div class="th-content" style="display: flex; align-items: center; gap: 4px;">
                                            <span class="col-label" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${labels[col.key] || col.label || ''}</span>
                                            ${col.sortable ? `<span class="sort-indicator" style="font-size: 12px; color: var(--color-primary, #4a6cf7); flex-shrink: 0; display: none;">↑</span>` : ''}
                                            ${col.filterable ? `<button class="col-btn filter-btn" data-key="${col.key}" style="background: none; border: none; padding: 0 3px; color: #adb5bd; cursor: pointer; font-size: 12px; flex-shrink: 0;">▼</button>` : ''}
                                        </div>
                                        ${!isFixed && idx < sortedColumns.length - 1 ? `<div class="resize-handle" data-index="${idx}" style="position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; background: transparent; z-index: 5;"></div>` : ''}
                                        ${idx === sortedColumns.length - 1 ? `<div class="resize-handle resize-last" data-index="${idx}" style="position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; background: transparent; z-index: 5;"></div>` : ''}
                                    </th>
                                `;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((item, index) => {
                            const statusClass = item.status ? `status-${item.status}` : '';
                            const deletedClass = item.is_deleted ? 'table-deleted' : '';
                            return `
                                <tr data-id="${item.id || index}" class="${statusClass} ${deletedClass}" style="height: ${this.settings.rowHeights?.[item.id] || 'var(--row-height, 40px)'}px;">
                                    ${sortedColumns.map((col, idx) => {
                                        const isRow = col.key === 'row' || col.type === 'row_number';
                                        const isIcon = col.type === 'status' || col.type === 'boolean' || col.type === 'icon';
                                        let cellClass = '';
                                        if (isRow) {
                                            cellClass = 'col-row';
                                        } else if (isIcon) {
                                            cellClass = 'col-icon';
                                        } else {
                                            cellClass = 'col-ellipsis';
                                        }
                                        if (isRow) {
                                            cellClass += ' col-row-sticky';
                                        }
                                        // Добавляем класс для ширины
                                        if (col.key === 'name') cellClass += ' col-name';
                                        if (col.key === 'comment') cellClass += ' col-comment';
                                        if (col.key === 'status' || col.type === 'status') cellClass += ' col-status';
                                        if (col.key === 'created_at') cellClass += ' col-created-at';
                                        if (col.key === 'updated_at') cellClass += ' col-updated-at';
                                        if (col.key === 'updated_by') cellClass += ' col-updated-by';
                                        return `
                                            <td class="${cellClass}" style="height: ${this.settings.rowHeights?.[item.id] || 'var(--row-height, 40px)'}px; max-height: ${this.settings.rowHeights?.[item.id] || 'var(--row-height, 40px)'}px; overflow: hidden; position: relative; vertical-align: middle; text-align: ${isRow ? 'center' : isIcon ? 'center' : 'left'};">
                                                ${this._renderCell(item, col, index)}
                                            </td>
                                        `;
                                    }).join('')}
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        return html;
    }

    _renderCell(item, column, index) {
        const value = item[column.key];
        const type = column.type || 'string';
        const displayValue = value !== undefined && value !== null ? String(value) : '';

        if (value === null || value === undefined || value === '') {
            return '';
        }

        if (type === 'row_number' || column.key === 'row') {
            return `<span class="col-row" style="display: inline-block; text-align: center; font-variant-numeric: tabular-nums;">${index + 1}</span>`;
        }

        if (type === 'status' && column.values) {
            const val = column.values.find(v => v.key === value);
            if (val) {
                const iconMap = {
                    'active': '✅',
                    'hidden': '👁️‍🗨️',
                    'deleted': '🗑️',
                    'archived': '📦'
                };
                const icon = iconMap[val.key] || '❓';
                return `
                    <span class="status-icon" data-tooltip="${val.label}" style="display: inline-flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1; cursor: default; transition: transform 0.15s ease;">
                        ${icon}
                    </span>
                `;
            }
            return `<span class="status-icon">${displayValue}</span>`;
        }

        if (type === 'boolean') {
            const icon = value ? '✓' : '✗';
            const label = value ? 'Да' : 'Нет';
            const color = value ? 'var(--color-success)' : 'var(--text-muted)';
            return `
                <span class="status-icon" data-tooltip="${label}" style="display: inline-flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1; color: ${color}; cursor: default;">
                    ${icon}
                </span>
            `;
        }

        if (type === 'url' && value) {
            return `
                <span class="col-truncated" data-tooltip="${displayValue}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: relative; cursor: help;">
                    <a href="${value}" target="_blank" style="color: #4a6cf7; text-decoration: none;">${displayValue}</a>
                </span>
            `;
        }

        if (type === 'email' && value) {
            return `
                <span class="col-truncated" data-tooltip="${displayValue}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: relative; cursor: help;">
                    <a href="mailto:${value}" style="color: #4a6cf7; text-decoration: none;">${displayValue}</a>
                </span>
            `;
        }

        if ((type === 'int' || type === 'numeric') && value !== null && value !== undefined) {
            const formatted = new Intl.NumberFormat('ru-RU').format(value);
            return `
                <span class="col-truncated" data-tooltip="${formatted}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; position: relative; cursor: help;">
                    ${formatted}
                </span>
            `;
        }

        if (type === 'currency' && value !== null && value !== undefined) {
            const formatted = new Intl.NumberFormat('ru-RU', {
                style: 'currency',
                currency: 'RUB',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(value);
            return `
                <span class="col-truncated" data-tooltip="${formatted}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; position: relative; cursor: help;">
                    ${formatted}
                </span>
            `;
        }

        if (type === 'percent' && value !== null && value !== undefined) {
            const formatted = Number(value).toFixed(2) + '%';
            return `
                <span class="col-truncated" data-tooltip="${formatted}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; position: relative; cursor: help;">
                    ${formatted}
                </span>
            `;
        }

        // ДАТА — ТОЛЬКО ДАТА, БЕЗ COMMENT
        if (type === 'datetime' && value) {
            try {
                const d = new Date(value);
                const formatted = d.toLocaleString('ru-RU');
                return `
                    <span class="col-truncated" data-tooltip="${formatted}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: relative; cursor: help;">
                        ${formatted}
                    </span>
                `;
            } catch {
                return `<span style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayValue}</span>`;
            }
        }

        if (type === 'date' && value) {
            try {
                const d = new Date(value);
                const formatted = d.toLocaleDateString('ru-RU');
                return `
                    <span class="col-truncated" data-tooltip="${formatted}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: relative; cursor: help;">
                        ${formatted}
                    </span>
                `;
            } catch {
                return `<span style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayValue}</span>`;
            }
        }

        if (type === 'text' || type === 'textarea') {
            return `
                <span class="col-truncated col-expandable" 
                      data-tooltip="${displayValue}"
                      data-expanded="false"
                      style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: relative; cursor: help;"
                      ondblclick="this.classList.toggle('col-wrap'); this.classList.toggle('col-ellipsis'); this.dataset.expanded = this.classList.contains('col-wrap') ? 'true' : 'false'; this.style.whiteSpace = this.classList.contains('col-wrap') ? 'normal' : 'nowrap'; this.style.overflow = this.classList.contains('col-wrap') ? 'visible' : 'hidden';">
                    ${displayValue}
                </span>
            `;
        }

        return `
            <span class="col-truncated" data-tooltip="${displayValue}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: relative; cursor: help;">
                ${displayValue}
            </span>
        `;
    }

    _checkTruncatedCells() {
        this.container.querySelectorAll('.col-truncated[data-tooltip]').forEach(el => {
            const isTruncated = el.scrollWidth > el.clientWidth;
            if (!isTruncated) {
                el.removeAttribute('data-tooltip');
                el.classList.remove('col-truncated');
                el.style.cursor = 'default';
            }
        });
    }

    _setupColumnResize() {
        // Будет исправлено на следующем этапе
    }

    _setupRowResize() {
        // Будет исправлено на следующем этапе
    }

    _setupAutoWidth() {
        // Будет исправлено на следующем этапе
    }

    _restoreRowHeights() {
        // Будет исправлено на следующем этапе
    }

    _getTextWidth(text) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const fontSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--font-size-base')) || 14;
        const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-family') || 'Arial';
        ctx.font = `${fontSize}px ${fontFamily}`;
        return ctx.measureText(text).width;
    }

    _buildEmptyState(colspan) {
        return `
            <div class="table-wrapper" style="overflow-x: auto; overflow-y: auto;">
                <table class="table table-hover table-sm table-custom">
                    <tbody>
                        <tr>
                            <td colspan="${colspan || 1}" class="text-center text-muted py-4" style="text-align: center; padding: 30px 0; color: #adb5bd;">
                                <i class="bi bi-inbox me-2"></i>Нет данных
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    _showError(message) {
        this.container.innerHTML = `
            <div class="alert alert-danger m-3">
                <i class="bi bi-exclamation-triangle me-2"></i>${message}
            </div>
        `;
    }
}

if (typeof window !== 'undefined') {
    window.TableRenderer = TableRenderer;
}