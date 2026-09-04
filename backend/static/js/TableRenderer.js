/**
 * TableRenderer — рендеринг таблицы на основе схемы
 * Архитектурное исправление: ширина столбцов из метаданных
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
        this._autoColumnKey = null;  // ключ столбца, который занимает остаток
        this._autoColumnProcessed = false;  // флаг, что авто-столбец уже определён
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
            // Ширина из настроек пользователя или из метаданных
            col._width = widths[col.key] || col.default_width || null;
        });
        return filtered;
    }

    /**
     * Определяет, какой столбец будет занимать остаток ('auto')
     * Правило: первый столбец с default_width = 'auto' в порядке отображения
     * При смене порядка — не пересчитываем (если уже определён)
     */
    _determineAutoColumn(columns) {
        // Если уже определён — не пересчитываем
        if (this._autoColumnProcessed) {
            return;
        }

        // Ищем первый столбец с default_width = 'auto'
        for (const col of columns) {
            if (col.default_width === 'auto') {
                this._autoColumnKey = col.key;
                this._autoColumnProcessed = true;
                console.log(`[TableRenderer] Auto-column: ${col.key}`);
                return;
            }
        }

        // Если нет 'auto' — ничего не делаем
        this._autoColumnProcessed = true;
        console.log('[TableRenderer] No auto-column found');
    }

    _buildTable(columns, data) {
        if (!data || data.length === 0) {
            return this._buildEmptyState(columns.length);
        }

        // Определяем авто-столбец
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

        const rowIndex = sortedColumns.findIndex(c => c.key === 'row' || c.type === 'row_number');

        let html = `
            <div class="table-wrapper" style="overflow-x: auto; overflow-y: auto; position: relative;">
                <table class="table table-hover table-sm table-custom" style="table-layout: fixed; width: 100%; border-collapse: collapse;">
                    <colgroup>
                        ${sortedColumns.map((col, idx) => {
                            const key = col.key;
                            const isRow = key === 'row' || col.type === 'row_number';
                            const isAuto = key === this._autoColumnKey;
                            const defaultWidth = col.default_width;
                            
                            let widthStyle = '';
                            let colClass = '';
                            
                            if (isRow) {
                                // Номер строки — авто по содержимому
                                widthStyle = 'width: auto; min-width: var(--col-row-min-width, 25px);';
                                colClass = 'col-content';
                            } else if (isAuto) {
                                // Авто-столбец — занимает остаток
                                widthStyle = 'width: var(--col-width-auto, auto); min-width: 100px;';
                                colClass = 'col-auto';
                            } else if (defaultWidth === null || defaultWidth === undefined) {
                                // null — авто по содержимому
                                widthStyle = 'width: auto; min-width: 30px;';
                                colClass = 'col-content';
                            } else if (typeof defaultWidth === 'number' || !isNaN(parseFloat(defaultWidth))) {
                                // число — фиксированная ширина
                                const w = parseFloat(defaultWidth);
                                widthStyle = `width: ${w}px; min-width: ${w}px;`;
                                colClass = 'col-fixed-width';
                            } else {
                                // fallback
                                widthStyle = 'width: auto; min-width: 30px;';
                                colClass = 'col-content';
                            }
                            
                            return `<col data-col="${key}" class="${colClass}" style="${widthStyle}">`;
                        }).join('')}
                    </colgroup>
                    <thead>
                        <tr>
                            ${sortedColumns.map((col, idx) => {
                                const isRow = col.key === 'row' || col.type === 'row_number';
                                const isFixed = col.key === 'row' || col.key === 'actions' || col.fixed;
                                const isAuto = col.key === this._autoColumnKey;
                                
                                let style = '';
                                let colClass = '';
                                
                                if (isRow) {
                                    style = 'width: auto; min-width: var(--col-row-min-width, 25px); text-align: var(--col-row-align, center);';
                                    colClass = 'col-row';
                                } else if (isAuto) {
                                    style = 'width: var(--col-width-auto, auto); min-width: 100px;';
                                    colClass = 'col-auto';
                                } else if (col.default_width === null || col.default_width === undefined) {
                                    style = 'width: auto; min-width: 30px;';
                                    colClass = 'col-content';
                                } else if (typeof col.default_width === 'number' || !isNaN(parseFloat(col.default_width))) {
                                    const w = parseFloat(col.default_width);
                                    style = `width: ${w}px; min-width: ${w}px;`;
                                    colClass = 'col-fixed-width';
                                } else {
                                    style = 'width: auto; min-width: 30px;';
                                    colClass = 'col-content';
                                }
                                
                                // Дополнительное выравнивание для статуса
                                if (col.type === 'status' || col.type === 'boolean') {
                                    style += ' text-align: center;';
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