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

        // Жёсткий порядок: row всегда первый, status второй (из метаданных)
        const fixedOrder = ['row', 'status'];
        const restColumns = sortedColumns.filter(c => !fixedOrder.includes(c.key));
        const rowCol = sortedColumns.find(c => c.key === 'row' || c.type === 'row_number');
        const statusCol = sortedColumns.find(c => c.key === 'status' || c.type === 'status');
        const finalColumns = [];
        if (rowCol) finalColumns.push(rowCol);
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
                                const statusTdClass = isStatus ? 'col-status-td' : '';
                                
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
    const table = this.container.querySelector('table');
    if (!table) return;

    let resizeData = null;

    // 1. mousedown на resize-handle
    table.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('.resize-handle');
        if (!handle) return;
        const th = handle.closest('th');
        if (!th) return;
        if (th.classList.contains('col-fixed')) return;

        const index = parseInt(handle.dataset.index);
        const col = th.closest('table').querySelector(`colgroup col:nth-child(${index + 1})`);
        const nextCol = th.closest('table').querySelector(`colgroup col:nth-child(${index + 2})`);
        const nextTh = th.nextElementSibling;

        // Сохраняем данные в resizeData
        resizeData = {
            index,
            startX: e.clientX,
            col,
            nextCol,
            th,
            nextTh,
            leftWidth: parseInt(col?.style.width) || 150,
            rightWidth: parseInt(nextCol?.style.width) || 150,
            // ... остальные данные
        };

        handle.classList.add('active');
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    // 2. mousemove
    document.addEventListener('mousemove', (e) => {
        if (!resizeData) return;
        const delta = e.clientX - resizeData.startX;
        let newLeft = Math.max(30, resizeData.leftWidth + delta);
        let newRight = Math.max(30, resizeData.rightWidth - delta);
        // Применяем ширину
        resizeData.col.style.width = newLeft + 'px';
        resizeData.th.style.width = newLeft + 'px';
        resizeData.nextCol.style.width = newRight + 'px';
        resizeData.nextTh.style.width = newRight + 'px';
        // Сохраняем в settings
        const leftKey = resizeData.th.dataset.col;
        const rightKey = resizeData.nextTh.dataset.col;
        if (leftKey && rightKey && this.settings.widths) {
            this.settings.widths[leftKey] = Math.round(newLeft);
            this.settings.widths[rightKey] = Math.round(newRight);
        }
    });

    // 3. mouseup
    document.addEventListener('mouseup', () => {
        if (resizeData) {
            const handle = resizeData.th?.querySelector('.resize-handle');
            if (handle) handle.classList.remove('active');
            document.body.style.userSelect = '';
            // Сохраняем в localStorage
            if (this.settings.widths) {
                const storageKey = `table_settings_${this.tableKey}`;
                localStorage.setItem(storageKey, JSON.stringify(this.settings));
            }
            resizeData = null;
        }
    });
}

_setupRowResize() {
    const table = this.container.querySelector('table');
    if (!table) return;

    let resizeData = null;

    // Добавляем handle для каждой строки (в зоне #)
    table.querySelectorAll('tbody tr').forEach(row => {
        const oldHandle = row.querySelector('.row-resize-handle');
        if (oldHandle) oldHandle.remove();

        const handle = document.createElement('div');
        handle.className = 'row-resize-handle';
        handle.style.cssText = `
            position: absolute;
            bottom: -3px;
            left: 0;
            width: 60px;
            height: 6px;
            cursor: row-resize;
            z-index: 10;
            background: transparent;
        `;
        row.style.position = 'relative';
        row.appendChild(handle);
    });

    // mousedown на handle
    document.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('.row-resize-handle');
        if (!handle) return;
        const row = handle.closest('tr');
        if (!row) return;
        const startY = e.clientY;
        const startHeight = row.offsetHeight;
        resizeData = { row, startY, startHeight };
        handle.classList.add('active');
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    // mousemove
    document.addEventListener('mousemove', (e) => {
        if (!resizeData) return;
        const delta = e.clientY - resizeData.startY;
        const newHeight = Math.max(32, Math.min(300, resizeData.startHeight + delta));
        resizeData.row.style.height = newHeight + 'px';
        resizeData.row.querySelectorAll('td').forEach(td => {
            td.style.height = newHeight + 'px';
        });
        const rowId = resizeData.row.dataset.id;
        if (rowId && this.settings.rowHeights) {
            this.settings.rowHeights[rowId] = newHeight;
        }
    });

    // mouseup
    document.addEventListener('mouseup', () => {
        if (resizeData) {
            const handle = resizeData.row?.querySelector('.row-resize-handle');
            if (handle) handle.classList.remove('active');
            document.body.style.userSelect = '';
            if (this.settings.rowHeights) {
                const storageKey = `row_heights_${this.tableKey}`;
                localStorage.setItem(storageKey, JSON.stringify(this.settings.rowHeights));
            }
            resizeData = null;
        }
    });
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