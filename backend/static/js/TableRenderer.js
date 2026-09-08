/**
 * TableRenderer — рендеринг таблицы на основе схемы
 * 
 * Ширина столбцов читается из метаданных:
 * - width: '1%', '99%', 'auto'
 * - min_width: '4.5rem', '12ch', '30px'
 * - max_width: '5.5rem', '16ch', '600px'
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
        this.offset = 0;  // количество уже загруженных строк
        this.pageSize = 50;
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
            // При полной загрузке offset = 0
            this.offset = 0;
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
        const columns = this.schema.columns || [];
        let filtered = columns.filter(col => visibleKeys.includes(col.key) || col.fixed);
        filtered.sort((a, b) => {
            const ia = order.indexOf(a.key);
            const ib = order.indexOf(b.key);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
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

        // ============================================================
        // УНИВЕРСАЛЬНЫЙ ПОРЯДОК СТОЛБЦОВ
        // ============================================================
        // 1. # (номер строки) — СОЗДАЁМ ИСКУССТВЕННО (не в БД)
        // 2. status — по типу (если есть)
        // 3. Остальные — из метаданных

        // Находим столбец с типом 'status' (по типу, а не по имени!)
        const statusCol = sortedColumns.find(c => c.type === 'status');

        // Все остальные столбцы (кроме status)
        const restColumns = sortedColumns.filter(c => c.type !== 'status');

        // СОЗДАЁМ ROW ИСКУССТВЕННО (НЕ ИЩЕМ В МЕТАДАННЫХ!)
        const rowCol = {
            key: 'row',
            type: 'row_number',
            label: '#',
            width: '1%',
            min_width: '4.5rem',
            max_width: '5.5rem',
            fixed: true,
            sortable: false,
            filterable: false
        };

        const finalColumns = [rowCol];
        if (statusCol) finalColumns.push(statusCol);
        finalColumns.push(...restColumns);

        let html = `
            <div class="table-wrap">
                <table class="table table-hover table-sm table-custom" style="width: 100%; border-collapse: separate; border-spacing: 0;">
                    <colgroup>
                        ${finalColumns.map((col, idx) => {
                            const key = col.key;
                            const isRow = key === 'row' || col.type === 'row_number';
                            const isStatus = key === 'status' || col.type === 'status';
                            const isFirst = idx === 0;
                            
                            const width = col.width || 'auto';
                            const minWidth = col.min_width || null;
                            const maxWidth = col.max_width || null;
                            
                            let style = `width: ${width};`;
                            if (minWidth) style += ` min-width: ${minWidth};`;
                            if (maxWidth) style += ` max-width: ${maxWidth};`;
                            
                            let colClass = '';
                            if (isRow) colClass = 'col-row';
                            else if (isStatus) colClass = 'col-status';
                            else if (key === 'created_at' || key === 'updated_at') colClass = 'col-created-at';
                            else if (key === 'comment' || col.type === 'text') colClass = 'col-comment';
                            
                            return `<col data-col="${key}" class="${colClass}" style="${style}">`;
                        }).join('')}
                    </colgroup>
                    <thead>
                        <tr>
                            ${finalColumns.map((col, idx) => {
                                const key = col.key;
                                const isRow = key === 'row' || col.type === 'row_number';
                                const isStatus = key === 'status' || col.type === 'status';
                                const isFirst = idx === 0;
                                const isFixed = col.fixed || false;
                                
                                const width = col.width || 'auto';
                                const minWidth = col.min_width || null;
                                const maxWidth = col.max_width || null;
                                
                                let style = `width: ${width};`;
                                if (minWidth) style += ` min-width: ${minWidth};`;
                                if (maxWidth) style += ` max-width: ${maxWidth};`;
                                
                                const statusThClass = isStatus ? 'col-status-th' : '';
                                
                                let colClass = '';
                                let stickyClass = '';
                                let zIndex = '';
                                
                                if (isRow) {
                                    colClass = 'col-row';
                                    if (isFirst) {
                                        stickyClass = 'col-row-sticky';
                                        zIndex = 'z-index: 11;';
                                    }
                                } else if (isStatus) {
                                    colClass = 'col-status';
                                } else if (key === 'created_at' || key === 'updated_at') {
                                    colClass = 'col-created-at';
                                } else if (key === 'comment' || col.type === 'text') {
                                    colClass = 'col-comment';
                                }
                                
                                return `
                                    <th data-col="${key}" data-index="${idx}"
                                        style="${style} position: relative; ${isFixed ? 'cursor: default;' : ''} ${zIndex}"
                                        class="${col.sortable ? 'sortable' : ''} ${colClass} ${stickyClass} ${statusThClass}">
                                        <div class="th-content" style="display: flex; align-items: center; gap: 0.25rem;">
                                            <span class="col-label" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${labels[key] || col.label || ''}</span>
                                            ${col.sortable ? `<span class="sort-indicator" style="font-size: 0.75rem; color: var(--color-primary, #4a6cf7); flex-shrink: 0; display: none;">↑</span>` : ''}
                                            ${col.filterable ? `<button class="col-btn filter-btn" data-key="${key}" style="background: none; border: none; padding: 0 2px; color: #adb5bd; cursor: pointer; font-size: 0.75rem; flex-shrink: 0;">▼</button>` : ''}
                                        </div>
                                        ${!isFixed && idx < finalColumns.length - 1 ? `<div class="resize-handle" data-index="${idx}" style="position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; background: transparent; z-index: 5;"></div>` : ''}
                                        ${idx === finalColumns.length - 1 ? `<div class="resize-handle resize-last" data-index="${idx}" style="position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; background: transparent; z-index: 5;"></div>` : ''}
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
                                    ${finalColumns.map((col, idx) => {
                                        const key = col.key;
                                        const isRow = key === 'row' || col.type === 'row_number';
                                        const isStatus = key === 'status' || col.type === 'status';
                                        const isFirst = idx === 0;
                                        const isDate = key === 'created_at' || key === 'updated_at' || col.type === 'datetime' || col.type === 'date';
                                        const isComment = key === 'comment' || col.type === 'text';
                                        const isAuto = col.is_auto === true;
                                        const isMultiline = col.is_multiline === true;
                                        
                                        let cellClass = '';
                                        let statusTdClass = '';
                                        
                                        if (isRow) {
                                            cellClass = 'col-row';
                                            if (isFirst) {
                                                cellClass += ' col-row-sticky';
                                            }
                                        } else if (isStatus) {
                                            cellClass = 'col-status';
                                            statusTdClass = 'col-status-td';
                                        } else if (isDate) {
                                            cellClass = 'col-created-at';
                                        } else if (isComment) {
                                            cellClass = 'col-comment';
                                            if (isMultiline) cellClass += ' col-multiline';
                                        } else if (isAuto) {
                                            cellClass = 'col-name';
                                            if (isMultiline) cellClass += ' col-multiline';
                                        } else if (isMultiline) {
                                            cellClass = 'col-multiline';
                                        } else {
                                            cellClass = 'col-ellipsis';
                                        }
                                        
                                        return `
                                            <td class="${cellClass} ${statusTdClass}" style="height: ${this.settings.rowHeights?.[item.id] || 'var(--row-height, 2.5rem)'}px; overflow: hidden; position: relative; vertical-align: middle; text-align: ${isRow ? 'center' : isStatus ? 'center' : 'left'};">
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

        // ============================================================
        // # (НОМЕР СТРОКИ) — ВЫЧИСЛЯЕТСЯ НА КЛИЕНТЕ
        // ============================================================
        if (type === 'row_number' || column.key === 'row') {
            const rowNumber = this.offset + index + 1;
            return `<span style="display: inline-block; text-align: center; font-variant-numeric: tabular-nums;">${rowNumber}</span>`;
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