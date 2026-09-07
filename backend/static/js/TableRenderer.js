/**
 * TableRenderer — рендеринг таблицы на основе схемы
 * Адаптирован под базовый шрифт и переменные
 * 
 * Логика ширины:
 * - default_width = 'auto' → занимает остаток (первый в списке)
 * - default_width = null → авто по содержимому
 * - default_width = число → фиксированная ширина
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
        this._autoColumnKey = null;
        this._autoColumnProcessed = false;
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
            col._width = widths[col.key] || col.width || null;
        });
        return filtered;
    }

    _determineAutoColumn(columns) {
        if (this._autoColumnProcessed) return;
        for (const col of columns) {
            if (col.default_width === 'auto') {
                this._autoColumnKey = col.key;
                this._autoColumnProcessed = true;
                console.log(`[TableRenderer] Auto-column: ${col.key}`);
                return;
            }
        }
        this._autoColumnProcessed = true;
        console.log('[TableRenderer] No auto-column found');
    }

    _buildTable(columns, data) {
        if (!data || data.length === 0) {
            return this._buildEmptyState(columns.length);
        }

        this._determineAutoColumn(columns);

        const labels = this.settings.labels || this.schema.default_settings?.labels || {};
        const order = this.settings.order || this.schema.default_settings?.order || [];
        const sortedColumns = [...columns].sort((a, b) => {
            const ia = order.indexOf(a.key);
            const ib = order.indexOf(b.key);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        // Определяем, какой столбец будет закреплён (первый не-фикс)
        const firstCol = sortedColumns[0];
        const isFirstColSticky = firstCol && !firstCol.fixed && firstCol.key !== 'actions';

        let html = `
            <div class="table-wrap">
                <table class="table table-hover table-sm table-custom" style="width: 100%; border-collapse: separate; border-spacing: 0;">
                    <colgroup>
                        ${sortedColumns.map((col, idx) => {
                            const key = col.key;
                            const isRow = key === 'row' || col.type === 'row_number';
                            const isAuto = key === this._autoColumnKey;
                            const defaultWidth = col._width || col.width;
                            const isFirst = idx === 0;
                            
                            let widthStyle = '';
                            let colClass = '';
                            
                            if (isRow) {
                                widthStyle = 'width: 1%; max-width: var(--col-row-max, 5.5rem);';
                                colClass = 'col-row';
                            } else if (isAuto) {
                                widthStyle = 'width: 99%; min-width: var(--col-min-width-name, 12rem);';
                                colClass = 'col-name';
                            } else if (key === 'status' || col.type === 'status') {
                                widthStyle = 'width: 1%; max-width: var(--col-status-max, 3.5rem); min-width: var(--col-status-min, 2.5rem);';
                                colClass = 'col-status';
                            } else if (key === 'created_at' || key === 'updated_at' || col.type === 'datetime' || col.type === 'date') {
                                widthStyle = 'width: 1%; max-width: var(--col-date-max, 16ch); min-width: var(--col-date-min, 12ch);';
                                colClass = 'col-created-at';
                            } else if (key === 'comment' || col.type === 'text') {
                                widthStyle = 'width: 99%; min-width: var(--col-min-width-comment, 8rem);';
                                colClass = 'col-comment';
                            } else if (defaultWidth && typeof defaultWidth === 'number') {
                                const w = defaultWidth;
                                widthStyle = `width: ${w}px; min-width: ${w}px;`;
                                colClass = 'col-fixed-width';
                            } else {
                                widthStyle = 'width: auto; min-width: 30px;';
                                colClass = 'col-content';
                            }
                            
                            return `<col data-col="${key}" class="${colClass}" style="${widthStyle}">`;
                        }).join('')}
                    </colgroup>
                    <thead>
                        <tr>
                            ${sortedColumns.map((col, idx) => {
                                const key = col.key;
                                const isRow = key === 'row' || col.type === 'row_number';
                                const isFirst = idx === 0;
                                const isFixed = col.fixed || false;
                                
                                let style = '';
                                let colClass = '';
                                let stickyClass = '';
                                let zIndex = '';
                                
                                if (isRow) {
                                    style = 'width: 1%; max-width: var(--col-row-max, 5.5rem); text-align: var(--col-row-align, center);';
                                    colClass = 'col-row';
                                    if (isFirst) {
                                        stickyClass = 'col-row-sticky';
                                        zIndex = 'z-index: 11;';
                                    }
                                } else if (key === 'status' || col.type === 'status') {
                                    style = 'width: 1%; max-width: var(--col-status-max, 3.5rem); min-width: var(--col-status-min, 2.5rem); text-align: center;';
                                    colClass = 'col-status';
                                } else if (key === 'created_at' || key === 'updated_at' || col.type === 'datetime' || col.type === 'date') {
                                    style = 'width: 1%; max-width: var(--col-date-max, 16ch); min-width: var(--col-date-min, 12ch);';
                                    colClass = 'col-created-at';
                                } else if (key === 'comment' || col.type === 'text') {
                                    style = 'width: 99%; min-width: var(--col-min-width-comment, 8rem);';
                                    colClass = 'col-comment';
                                } else if (col._width && typeof col._width === 'number') {
                                    const w = col._width;
                                    style = `width: ${w}px; min-width: ${w}px;`;
                                    colClass = 'col-fixed-width';
                                } else {
                                    style = 'width: auto; min-width: 30px;';
                                    colClass = 'col-content';
                                }
                                
                                return `
                                    <th data-col="${key}" data-index="${idx}"
                                        style="${style} position: relative; ${isFixed ? 'cursor: default;' : ''} ${zIndex}"
                                        class="${col.sortable ? 'sortable' : ''} ${colClass} ${stickyClass}">
                                        <div class="th-content" style="display: flex; align-items: center; gap: 0.25rem;">
                                            <span class="col-label" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${labels[key] || col.label || ''}</span>
                                            ${col.sortable ? `<span class="sort-indicator" style="font-size: 0.75rem; color: var(--color-primary, #4a6cf7); flex-shrink: 0; display: none;">↑</span>` : ''}
                                            ${col.filterable ? `<button class="col-btn filter-btn" data-key="${key}" style="background: none; border: none; padding: 0 2px; color: #adb5bd; cursor: pointer; font-size: 0.75rem; flex-shrink: 0;">▼</button>` : ''}
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
                                <tr data-id="${item.id || index}" class="${statusClass} ${deletedClass}" style="height: ${this.settings.rowHeights?.[item.id] || 'var(--row-height, 2.5rem)'}px;">
                                    ${sortedColumns.map((col, idx) => {
                                        const isRow = col.key === 'row' || col.type === 'row_number';
                                        const isFirst = idx === 0;
                                        let cellClass = '';
                                        if (isRow) {
                                            cellClass = 'col-row';
                                            if (isFirst) {
                                                cellClass += ' col-row-sticky';
                                            }
                                        } else if (col.type === 'status' || col.type === 'boolean') {
                                            cellClass = 'col-status';
                                        } else if (col.key === 'created_at' || col.key === 'updated_at') {
                                            cellClass = 'col-created-at';
                                        } else if (col.key === 'comment' || col.type === 'text') {
                                            cellClass = 'col-comment';
                                        } else {
                                            cellClass = 'col-ellipsis';
                                        }
                                        return `
                                            <td class="${cellClass}" style="height: ${this.settings.rowHeights?.[item.id] || 'var(--row-height, 2.5rem)'}px; overflow: hidden; position: relative; vertical-align: middle; text-align: ${isRow ? 'center' : 'left'};">
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
            return `<span style="display: inline-block; text-align: center; font-variant-numeric: tabular-nums;">${index + 1}</span>`;
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
                    <span class="status-icon" data-tooltip="${val.label}" style="display: inline-flex; align-items: center; justify-content: center; font-size: 1.125em; line-height: 1; cursor: default; transition: transform 0.15s ease; width: 1.75em; height: 1.75em;">
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
                <span class="status-icon" data-tooltip="${label}" style="display: inline-flex; align-items: center; justify-content: center; font-size: 1.125em; line-height: 1; color: ${color}; cursor: default; width: 1.75em; height: 1.75em;">
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
        // Будет реализовано на следующем этапе
    }

    _setupRowResize() {
        // Будет реализовано на следующем этапе
    }

    _setupAutoWidth() {
        // Будет реализовано на следующем этапе
    }

    _restoreRowHeights() {
        // Будет реализовано на следующем этапе
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
            <div class="table-wrap">
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