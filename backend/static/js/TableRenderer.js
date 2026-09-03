/**
 * TableRenderer — рендеринг таблицы на основе схемы
 * С поддержкой обрезки, tooltip, автоподбора ширины и ресайза строк
 * Обновлён: иконки для статусов и boolean, столбец № с автошириной
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

    /**
     * Инициализация и рендеринг таблицы
     */
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

        let html = `
            <div class="table-wrapper" style="overflow-x: auto; overflow-y: auto; position: relative;">
                <table class="table table-hover table-sm table-custom" style="table-layout: fixed; width: 100%; border-collapse: collapse;">
                    <colgroup>
                        ${sortedColumns.map(col => {
                            if (col.key === 'row' || col.type === 'row_number') {
                                return `<col data-col="${col.key}" style="width: auto; min-width: var(--col-row-min-width, 25px);">`;
                            } else if (col.type === 'status' || col.type === 'boolean' || col.type === 'icon') {
                                return `<col data-col="${col.key}" style="width: auto; min-width: 30px;">`;
                            } else {
                                return `<col data-col="${col.key}" style="width: ${col._width || 150}px; min-width: ${col.min_width || 30}px; max-width: ${col.max_width || 600}px;">`;
                            }
                        }).join('')}
                    </colgroup>
                    <thead>
                        <tr>
                            ${sortedColumns.map((col, index) => {
                                const isFixed = col.key === 'row' || col.key === 'actions' || col.fixed;
                                let style = '';
                                if (col.key === 'row' || col.type === 'row_number') {
                                    style = 'width: auto; min-width: var(--col-row-min-width, 25px); text-align: center;';
                                } else if (col.type === 'status' || col.type === 'boolean' || col.type === 'icon') {
                                    style = 'width: auto; min-width: 30px; text-align: center;';
                                } else {
                                    style = `width: ${col._width || 150}px; min-width: ${col.min_width || 30}px; max-width: ${col.max_width || 600}px;`;
                                }
                                return `
                                    <th data-col="${col.key}" data-index="${index}"
                                        style="${style} position: relative; ${isFixed ? 'cursor: default;' : ''}"
                                        class="${col.sortable ? 'sortable' : ''} ${col.key === 'actions' ? 'col-actions' : ''} ${isFixed ? 'col-fixed' : ''}">
                                        <div class="th-content" style="display: flex; align-items: center; gap: 4px;">
                                            <span class="col-label" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${labels[col.key] || col.label || ''}</span>
                                            ${col.sortable ? `<span class="sort-indicator" style="font-size: 12px; color: #adb5bd;">⇅</span>` : ''}
                                            ${col.filterable ? `<button class="col-btn filter-btn" data-key="${col.key}" style="background: none; border: none; padding: 0 3px; color: #adb5bd; cursor: pointer; font-size: 12px;">▼</button>` : ''}
                                        </div>
                                        ${!isFixed && index < sortedColumns.length - 1 ? `<div class="resize-handle" data-index="${index}" style="position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; background: transparent; z-index: 5;"></div>` : ''}
                                    </th>
                                `;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((item, index) => `
                            <tr data-id="${item.id || index}" style="height: ${this.settings.rowHeights?.[item.id] || 'var(--row-height, 40px)'}px;">
                                ${sortedColumns.map(col => {
                                    let cellClass = '';
                                    if (col.key === 'row' || col.type === 'row_number') {
                                        cellClass = 'col-row';
                                    } else if (col.type === 'status' || col.type === 'boolean' || col.type === 'icon') {
                                        cellClass = 'col-icon';
                                    } else {
                                        cellClass = 'col-ellipsis';
                                    }
                                    return `
                                        <td class="${cellClass}" style="height: ${this.settings.rowHeights?.[item.id] || 'var(--row-height, 40px)'}px; max-height: ${this.settings.rowHeights?.[item.id] || 'var(--row-height, 40px)'}px; overflow: hidden; position: relative; vertical-align: middle; text-align: ${col.key === 'row' || col.type === 'row_number' ? 'center' : col.type === 'status' || col.type === 'boolean' || col.type === 'icon' ? 'center' : 'left'};">
                                            ${this._renderCell(item, col, index)}
                                        </td>
                                    `;
                                }).join('')}
                            </tr>
                        `).join('')}
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

        // --- Номер строки (автоширина) ---
        if (type === 'row_number' || column.key === 'row') {
            return `<span class="col-row" style="display: inline-block; text-align: center; font-variant-numeric: tabular-nums;">${index + 1}</span>`;
        }

        // --- Статус (только иконка) ---
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
                    <span class="icon" data-tooltip="${val.label}" style="display: inline-flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1; cursor: default; transition: transform 0.15s ease;">
                        ${icon}
                    </span>
                `;
            }
            return `<span class="icon">${displayValue}</span>`;
        }

        // --- Boolean (только иконка) ---
        if (type === 'boolean') {
            const icon = value ? '✓' : '✗';
            const label = value ? 'Да' : 'Нет';
            const color = value ? 'var(--color-success)' : 'var(--text-muted)';
            return `
                <span class="icon" data-tooltip="${label}" style="display: inline-flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1; color: ${color}; cursor: default;">
                    ${icon}
                </span>
            `;
        }

        // --- URL ---
        if (type === 'url' && value) {
            return `
                <span class="col-truncated" data-tooltip="${displayValue}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: relative; cursor: help;">
                    <a href="${value}" target="_blank" style="color: #4a6cf7; text-decoration: none;">${displayValue}</a>
                </span>
            `;
        }

        // --- Email ---
        if (type === 'email' && value) {
            return `
                <span class="col-truncated" data-tooltip="${displayValue}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: relative; cursor: help;">
                    <a href="mailto:${value}" style="color: #4a6cf7; text-decoration: none;">${displayValue}</a>
                </span>
            `;
        }

        // --- Числа ---
        if ((type === 'int' || type === 'numeric') && value !== null && value !== undefined) {
            const formatted = new Intl.NumberFormat('ru-RU').format(value);
            return `
                <span class="col-truncated" data-tooltip="${formatted}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; position: relative; cursor: help;">
                    ${formatted}
                </span>
            `;
        }

        // --- Деньги ---
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

        // --- Проценты ---
        if (type === 'percent' && value !== null && value !== undefined) {
            const formatted = Number(value).toFixed(2) + '%';
            return `
                <span class="col-truncated" data-tooltip="${formatted}" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; position: relative; cursor: help;">
                    ${formatted}
                </span>
            `;
        }

        // --- Даты ---
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

        // --- Текстовые поля (с возможностью разворачивания) ---
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

        // --- По умолчанию ---
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

        table.addEventListener('mousedown', (e) => {
            const handle = e.target.closest('.resize-handle');
            if (!handle) return;

            const th = handle.closest('th');
            if (!th) return;
            
            // Проверяем, что столбец не фиксированный
            if (th.classList.contains('col-fixed')) return;
            
            const colIndex = parseInt(handle.dataset.index);
            const col = th.closest('table').querySelector(`colgroup col:nth-child(${colIndex + 1})`);
            const nextCol = th.closest('table').querySelector(`colgroup col:nth-child(${colIndex + 2})`);
            const nextTh = th.nextElementSibling;

            if (!col || !nextCol || !nextTh) return;

            // Проверяем, что правый столбец не фиксированный
            if (nextTh.classList.contains('col-fixed')) {
                // Ресайз только левого столбца, правый не двигается
                const startX = e.clientX;
                const startWidth = parseInt(col.style.width) || parseInt(th.style.width) || 150;
                const rightWidth = parseInt(nextCol.style.width) || parseInt(nextTh.style.width) || 150;
                
                resizeData = { 
                    col, th, startX, startWidth, 
                    mode: 'left_only',
                    rightWidth: rightWidth,
                    totalWidth: startWidth + rightWidth,
                    minWidth: 30,
                    maxWidth: 600
                };
            } else {
                const startX = e.clientX;
                const startWidth = parseInt(col.style.width) || parseInt(th.style.width) || 150;
                const nextStartWidth = parseInt(nextCol.style.width) || parseInt(nextTh.style.width) || 150;

                resizeData = { 
                    col, nextCol, th, nextTh, startX, startWidth, nextStartWidth,
                    mode: 'both'
                };
            }

            handle.classList.add('active');
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!resizeData) return;

            if (resizeData.mode === 'left_only') {
                const delta = e.clientX - resizeData.startX;
                let newWidth = Math.max(30, resizeData.startWidth + delta);
                newWidth = Math.min(resizeData.maxWidth, newWidth);
                
                resizeData.col.style.width = newWidth + 'px';
                resizeData.col.style.minWidth = newWidth + 'px';
                resizeData.th.style.width = newWidth + 'px';
                resizeData.th.style.minWidth = newWidth + 'px';
                
                const colKey = resizeData.th.dataset.col;
                if (colKey && this.settings.widths) {
                    this.settings.widths[colKey] = Math.round(newWidth);
                }
            } else {
                const delta = e.clientX - resizeData.startX;
                let newWidth = Math.max(30, resizeData.startWidth + delta);
                let nextNewWidth = Math.max(30, resizeData.nextStartWidth - delta);

                const minWidth = 30;
                if (newWidth < minWidth) {
                    newWidth = minWidth;
                    nextNewWidth = resizeData.nextStartWidth + resizeData.startWidth - minWidth;
                }
                if (nextNewWidth < minWidth) {
                    nextNewWidth = minWidth;
                    newWidth = resizeData.startWidth + resizeData.nextStartWidth - minWidth;
                }

                resizeData.col.style.width = newWidth + 'px';
                resizeData.col.style.minWidth = newWidth + 'px';
                resizeData.th.style.width = newWidth + 'px';
                resizeData.th.style.minWidth = newWidth + 'px';

                resizeData.nextCol.style.width = nextNewWidth + 'px';
                resizeData.nextCol.style.minWidth = nextNewWidth + 'px';
                resizeData.nextTh.style.width = nextNewWidth + 'px';
                resizeData.nextTh.style.minWidth = nextNewWidth + 'px';

                const colKey = resizeData.th.dataset.col;
                const nextColKey = resizeData.nextTh.dataset.col;
                if (colKey && nextColKey && this.settings.widths) {
                    this.settings.widths[colKey] = Math.round(newWidth);
                    this.settings.widths[nextColKey] = Math.round(nextNewWidth);
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (resizeData) {
                const handle = resizeData.th?.querySelector('.resize-handle');
                if (handle) handle.classList.remove('active');
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
                
                if (this.settings.widths) {
                    try {
                        const storageKey = `table_settings_${this.tableKey}`;
                        localStorage.setItem(storageKey, JSON.stringify(this.settings));
                    } catch (e) {}
                }
                resizeData = null;
            }
        });
    }

    _setupRowResize() {
        const table = this.container.querySelector('table');
        if (!table) return;

        let resizeData = null;

        table.querySelectorAll('tbody tr').forEach(row => {
            const oldHandle = row.querySelector('.row-resize-handle');
            if (oldHandle) oldHandle.remove();

            const handle = document.createElement('div');
            handle.className = 'row-resize-handle';
            handle.style.cssText = `
                position: absolute;
                bottom: -4px;
                left: 0;
                right: 0;
                height: 8px;
                cursor: row-resize;
                z-index: 10;
                background: transparent;
                transition: background 0.15s ease;
            `;
            handle.title = 'Перетащите для изменения высоты строки (двойной клик — автоподбор)';
            row.style.position = 'relative';
            row.appendChild(handle);

            handle.addEventListener('mouseenter', () => {
                if (!resizeData) {
                    handle.style.background = 'var(--color-primary, #4a6cf7)';
                    handle.style.opacity = '0.3';
                }
            });
            handle.addEventListener('mouseleave', () => {
                if (!resizeData) {
                    handle.style.background = 'transparent';
                    handle.style.opacity = '1';
                }
            });
        });

        document.addEventListener('mousedown', (e) => {
            const handle = e.target.closest('.row-resize-handle');
            if (!handle) return;

            const row = handle.closest('tr');
            if (!row) return;

            const startY = e.clientY;
            const startHeight = row.offsetHeight;

            resizeData = { row, startY, startHeight, handle };

            handle.style.background = 'var(--color-primary, #4a6cf7)';
            handle.style.opacity = '0.5';
            handle.style.height = '12px';

            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'row-resize';

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!resizeData) return;

            const delta = e.clientY - resizeData.startY;
            const minHeight = 32;
            const maxHeight = 300;
            let newHeight = Math.max(minHeight, Math.min(maxHeight, resizeData.startHeight + delta));

            resizeData.row.style.height = newHeight + 'px';
            resizeData.row.querySelectorAll('td').forEach(td => {
                td.style.height = newHeight + 'px';
                td.style.maxHeight = newHeight + 'px';
            });

            const rowId = resizeData.row.dataset.id;
            if (rowId) {
                if (!this.settings.rowHeights) this.settings.rowHeights = {};
                this.settings.rowHeights[rowId] = newHeight;
            }
        });

        document.addEventListener('mouseup', () => {
            if (resizeData) {
                resizeData.handle.style.background = 'transparent';
                resizeData.handle.style.opacity = '1';
                resizeData.handle.style.height = '8px';
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
                
                if (this.settings.rowHeights) {
                    try {
                        const storageKey = `row_heights_${this.tableKey}`;
                        localStorage.setItem(storageKey, JSON.stringify(this.settings.rowHeights));
                    } catch (e) {}
                }
                resizeData = null;
            }
        });

        table.addEventListener('dblclick', (e) => {
            const handle = e.target.closest('.row-resize-handle');
            if (!handle) return;

            const row = handle.closest('tr');
            if (!row) return;

            this._autoHeight(row);
        });
    }

    _autoHeight(row) {
        let maxContentHeight = 0;
        const cells = row.querySelectorAll('td');

        cells.forEach(td => {
            const originalHeight = td.style.height;
            const originalMaxHeight = td.style.maxHeight;
            const originalOverflow = td.style.overflow;

            td.style.height = 'auto';
            td.style.maxHeight = 'none';
            td.style.overflow = 'visible';

            const contentHeight = td.scrollHeight;
            maxContentHeight = Math.max(maxContentHeight, contentHeight);

            td.style.height = originalHeight || '';
            td.style.maxHeight = originalMaxHeight || '';
            td.style.overflow = originalOverflow || '';
        });

        const padding = 16;
        const minHeight = 32;
        const maxHeight = 300;
        const newHeight = Math.max(minHeight, Math.min(maxHeight, maxContentHeight + padding));

        row.style.height = newHeight + 'px';
        row.querySelectorAll('td').forEach(td => {
            td.style.height = newHeight + 'px';
            td.style.maxHeight = newHeight + 'px';
        });

        if (maxContentHeight > newHeight) {
            row.querySelectorAll('td .col-ellipsis').forEach(el => {
                el.classList.add('col-wrap');
                el.classList.remove('col-ellipsis');
                el.style.whiteSpace = 'normal';
                el.style.overflow = 'visible';
            });
        }

        const rowId = row.dataset.id;
        if (rowId) {
            if (!this.settings.rowHeights) this.settings.rowHeights = {};
            this.settings.rowHeights[rowId] = newHeight;
            try {
                const storageKey = `row_heights_${this.tableKey}`;
                localStorage.setItem(storageKey, JSON.stringify(this.settings.rowHeights));
            } catch (e) {}
        }
    }

    _restoreRowHeights() {
        const table = this.container.querySelector('table');
        if (!table) return;

        const rowHeights = this.settings.rowHeights || {};
        table.querySelectorAll('tbody tr[data-id]').forEach(row => {
            const rowId = row.dataset.id;
            const height = rowHeights[rowId];
            if (height) {
                row.style.height = height + 'px';
                row.querySelectorAll('td').forEach(td => {
                    td.style.height = height + 'px';
                    td.style.maxHeight = height + 'px';
                });
            }
        });
    }

    _setupAutoWidth() {
        const table = this.container.querySelector('table');
        if (!table) return;

        table.addEventListener('dblclick', (e) => {
            const handle = e.target.closest('.resize-handle');
            if (!handle) return;

            const th = handle.closest('th');
            if (!th) return;
            
            // Проверяем, что столбец не фиксированный
            if (th.classList.contains('col-fixed')) return;
            
            const colKey = th.dataset.col;
            if (!colKey) return;

            const colIndex = Array.from(th.parentElement.children).indexOf(th);
            const col = table.querySelector(`colgroup col:nth-child(${colIndex + 1})`);

            // Находим ширину содержимого
            let maxWidth = 0;
            const padding = 16;
            const maxAllowed = 600;
            const minAllowed = 30;

            const headerText = th.textContent || '';
            const headerWidth = this._getTextWidth(headerText) + padding;
            maxWidth = Math.max(maxWidth, headerWidth);

            table.querySelectorAll('tbody tr').forEach(row => {
                const cell = row.children[colIndex];
                if (cell) {
                    const tooltipEl = cell.querySelector('[data-tooltip]');
                    const fullText = tooltipEl ? tooltipEl.dataset.tooltip : (cell.textContent || '');
                    const cellWidth = this._getTextWidth(fullText) + padding;
                    maxWidth = Math.max(maxWidth, cellWidth);
                }
            });

            const currentWidth = parseInt(th.style.width) || 150;
            let newWidth;
            if (maxWidth < currentWidth - 20) {
                newWidth = Math.max(minAllowed, maxWidth + 10);
            } else {
                newWidth = Math.max(minAllowed, Math.min(maxAllowed, maxWidth + 20));
            }

            if (col) {
                col.style.width = newWidth + 'px';
                col.style.minWidth = newWidth + 'px';
            }
            th.style.width = newWidth + 'px';
            th.style.minWidth = newWidth + 'px';

            if (this.settings.widths) {
                this.settings.widths[colKey] = newWidth;
                try {
                    const storageKey = `table_settings_${this.tableKey}`;
                    localStorage.setItem(storageKey, JSON.stringify(this.settings));
                } catch (e) {}
            }

            th.style.transition = 'background 0.3s ease';
            th.style.background = 'var(--color-primary, #4a6cf7)';
            th.style.opacity = '0.15';
            setTimeout(() => {
                th.style.background = '';
                th.style.opacity = '';
            }, 400);
        });
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