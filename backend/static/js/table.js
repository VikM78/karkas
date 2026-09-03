// admin/static/table.js - общая логика для таблиц

// ============================================================
//  СОЗДАНИЕ ТАБЛИЦЫ
// ============================================================

function createTable(tableKey, containerId, dataLoader, crudFunctions) {
    console.log('🔧 createTable вызван:', tableKey, containerId);
    
    const container = document.getElementById(containerId);
    if (!container) {
        console.error('Контейнер не найден:', containerId);
        return null;
    }

    const settings = loadTableSettings(tableKey);
    const config = getTableConfig(tableKey);
    
    console.log('📋 Настройки:', settings);
    console.log('📋 Конфиг:', config);

    const state = {
        tableKey: tableKey,
        settings: settings || {},
        config: config,
        currentPage: 1,
        currentFilter: 'all',
        currentSearch: '',
        columnFilters: {},
        columnSort: { key: null, direction: null },
        dataLoader: dataLoader,
        crud: crudFunctions || {},
        resizeData: null,
        container: container,
        initialized: false,
        editMode: false,
        _lastData: [],
        _filterDropdowns: {},
        _filterBtn: {},
        _renderers: config?.cellRenderers || {},
        rowHeights: settings?.rowHeights || {},
        selectedRows: new Set(),
    };

    state.table = container.querySelector('table');
    state.colgroup = container.querySelector('colgroup');
    state.thead = container.querySelector('thead');
    state.tbody = container.querySelector('tbody');

    if (!state.table || !state.colgroup || !state.thead || !state.tbody) {
        console.error('Не найдены элементы таблицы');
        return null;
    }

    state.applyFilters = function() {
        if (state.dataLoader) {
            const search = state.currentSearch || '';
            state.dataLoader(
                state.currentPage || 1,
                search,
                state.currentFilter || 'all',
                function(data) {
                    let filtered = data || [];
                    const columnFilters = state.columnFilters || {};
                    const hasFilters = Object.keys(columnFilters).some(k => columnFilters[k] && columnFilters[k].length > 0);
                    
                    if (hasFilters) {
                        filtered = filtered.filter(item => {
                            let match = true;
                            for (const [colKey, values] of Object.entries(columnFilters)) {
                                if (!values || values.length === 0) continue;
                                const itemValue = item[colKey];
                                const isEmpty = itemValue === null || itemValue === undefined || itemValue === '';
                                const strValue = String(itemValue || '');
                                if (values.includes('(Пустые)') && isEmpty) {
                                    continue;
                                }
                                if (!values.includes(strValue)) {
                                    match = false;
                                    break;
                                }
                            }
                            return match;
                        });
                    }
                    
                    const sort = state.columnSort;
                    if (sort && sort.key) {
                        filtered.sort((a, b) => {
                            const aVal = (a[sort.key] !== undefined && a[sort.key] !== null) ? String(a[sort.key]).toLowerCase() : '';
                            const bVal = (b[sort.key] !== undefined && b[sort.key] !== null) ? String(b[sort.key]).toLowerCase() : '';
                            if (sort.direction === 'asc') {
                                if (aVal < bVal) return -1;
                                if (aVal > bVal) return 1;
                                return 0;
                            } else {
                                if (aVal > bVal) return -1;
                                if (aVal < bVal) return 1;
                                return 0;
                            }
                        });
                    }
                    
                    renderTableBody(state, filtered);
                    if (typeof updateRecordCount === 'function') {
                        updateRecordCount(filtered.length);
                    }
                },
                state.columnFilters
            );
        }
    };

    renderTableHeader(state);
    loadData(state, 1);
    setupResize(state);

    state.initialized = true;
    window._tableState = state;
    console.log('✅ Таблица создана');

    return state;
}

// ============================================================
//  ОТРИСОВКА ЗАГОЛОВКА
// ============================================================

function renderTableHeader(state) {
    console.log('🔧 renderTableHeader');
    const visibleCols = getVisibleColumns(state.tableKey, state.settings);
    const thead = state.thead;
    const colgroup = state.colgroup;

    thead.innerHTML = '';
    colgroup.innerHTML = '';

    visibleCols.forEach((col, index) => {
        const isFixed = col.key === 'row' || col.key === 'actions' || col.fixed;
        const isRow = col.key === 'row' || col.type === 'row_number';
        const isIcon = col.type === 'status' || col.type === 'boolean' || col.type === 'icon';
        const width = state.settings.widths[col.key] || col.width || 150;
        const minWidth = col.minWidth || 30;
        const maxWidth = col.maxWidth || 600;

        const colEl = document.createElement('col');
        if (isRow) {
            colEl.style.width = 'auto';
            colEl.style.minWidth = 'var(--col-row-min-width, 25px)';
        } else if (isIcon) {
            colEl.style.width = 'auto';
            colEl.style.minWidth = '30px';
        } else {
            colEl.style.width = width + 'px';
            colEl.style.minWidth = minWidth + 'px';
            colEl.style.maxWidth = maxWidth + 'px';
        }
        colEl.dataset.col = col.key;
        colgroup.appendChild(colEl);

        const th = document.createElement('th');
        th.dataset.col = col.key;
        th.dataset.index = index;
        if (isRow) {
            th.style.width = 'auto';
            th.style.minWidth = 'var(--col-row-min-width, 25px)';
            th.style.textAlign = 'var(--col-row-align, center)';
            th.classList.add('col-row-sticky');
        } else if (isIcon) {
            th.style.width = 'auto';
            th.style.minWidth = '30px';
            th.style.textAlign = 'center';
        } else {
            th.style.width = width + 'px';
            th.style.minWidth = minWidth + 'px';
            th.style.maxWidth = maxWidth + 'px';
        }
        th.style.position = 'relative';

        const label = state.settings.labels[col.key] || col.label;
        
        if (isFixed) {
            th.classList.add('col-fixed');
        }

        // Определяем, активна ли сортировка для этого столбца
        const isSortActive = state.columnSort && state.columnSort.key === col.key;
        if (isSortActive) {
            th.classList.add('sort-active');
        }

        if (col.filterable !== false && col.key !== 'row' && col.key !== 'actions') {
            const content = document.createElement('div');
            content.className = 'th-content';
            content.style.display = 'flex';
            content.style.alignItems = 'center';
            content.style.gap = '4px';
            
            const labelSpan = document.createElement('span');
            labelSpan.className = 'col-label';
            labelSpan.textContent = label;
            labelSpan.style.flex = '1';
            labelSpan.style.overflow = 'hidden';
            labelSpan.style.textOverflow = 'ellipsis';
            labelSpan.style.whiteSpace = 'nowrap';
            content.appendChild(labelSpan);
            
            // Индикатор сортировки (показываем только если активна)
            if (col.sortable !== false) {
                const sortIndicator = document.createElement('span');
                sortIndicator.className = 'sort-indicator';
                sortIndicator.textContent = state.columnSort?.direction === 'asc' ? '↑' : '↓';
                sortIndicator.style.display = isSortActive ? 'inline' : 'none';
                sortIndicator.style.fontSize = '12px';
                sortIndicator.style.color = 'var(--color-primary, #4a6cf7)';
                sortIndicator.style.flexShrink = '0';
                content.appendChild(sortIndicator);
            }
            
            // Фильтр (всегда)
            const filterBtn = document.createElement('button');
            filterBtn.className = 'col-btn filter-btn';
            filterBtn.innerHTML = '▼';
            filterBtn.title = 'Фильтр';
            filterBtn.style.background = 'none';
            filterBtn.style.border = 'none';
            filterBtn.style.padding = '0 3px';
            filterBtn.style.color = '#adb5bd';
            filterBtn.style.cursor = 'pointer';
            filterBtn.style.fontSize = '12px';
            filterBtn.style.flexShrink = '0';
            filterBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!th.querySelector('.col-filter-dropdown')) {
                    if (typeof createColumnFilter === 'function') {
                        createColumnFilter(state, th, col.key, label);
                    }
                }
                toggleFilterDropdown(th, col.key, state);
            });
            content.appendChild(filterBtn);
            
            th.appendChild(content);
        } else {
            th.textContent = label;
        }

        // Resize handle — для всех столбцов, включая последний
        if (!isFixed) {
            const handle = document.createElement('div');
            handle.className = 'resize-handle';
            if (index === visibleCols.length - 1) {
                handle.classList.add('resize-last');
            }
            handle.dataset.index = index;
            handle.style.position = 'absolute';
            handle.style.top = '0';
            handle.style.right = '-3px';
            handle.style.width = '6px';
            handle.style.height = '100%';
            handle.style.cursor = 'col-resize';
            handle.style.background = 'transparent';
            handle.style.zIndex = '5';
            handle.addEventListener('mousedown', function(e) {
                startResize(e, index, state);
            });
            th.appendChild(handle);
        }

        thead.appendChild(th);
    });

    setTimeout(() => {
        const ths = thead.querySelectorAll('th');
        ths.forEach((th, index) => {
            const col = visibleCols[index];
            if (col && col.filterable !== false && col.key !== 'row' && col.key !== 'actions') {
                if (!th.querySelector('.col-filter-dropdown') && typeof createColumnFilter === 'function') {
                    const label = state.settings.labels[col.key] || col.label;
                    createColumnFilter(state, th, col.key, label);
                }
            }
        });
    }, 100);
}

// ============================================================
//  РЕСАЙЗ СТОЛБЦОВ (КАК В EXCEL)
// ============================================================

function setupResize(state) {}

function startResize(e, index, state) {
    const th = e.target.closest('th');
    if (!th) return;

    const visibleCols = getVisibleColumns(state.tableKey, state.settings);
    
    const col = visibleCols[index];
    if (col.key === 'row' || col.key === 'actions' || col.fixed) return;
    
    if (index >= visibleCols.length - 1) {
        // Последний столбец — ресайз всей таблицы
        const colElements = state.colgroup.querySelectorAll('col');
        const thElements = state.thead.querySelectorAll('th');
        const leftElement = colElements[index];
        const leftTh = thElements[index];
        if (!leftElement || !leftTh) return;
        const leftWidth = parseInt(leftElement.style.width) || col.width || 150;
        state.resizeData = {
            mode: 'last',
            index: index,
            startX: e.clientX,
            leftCol: col,
            leftElement: leftElement,
            leftTh: leftTh,
            leftWidth: leftWidth,
            table: state.table,
            container: state.container
        };
        th.querySelector('.resize-handle')?.classList.add('active');
        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', stopResize);
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    const colElements = state.colgroup.querySelectorAll('col');
    const thElements = state.thead.querySelectorAll('th');

    const leftElement = colElements[index];
    const rightElement = colElements[index + 1];
    const leftTh = thElements[index];
    const rightTh = thElements[index + 1];

    if (!leftElement || !rightElement || !leftTh || !rightTh) return;

    const leftWidth = parseInt(leftElement.style.width) || col.width || 150;
    const rightWidth = parseInt(rightElement.style.width) || visibleCols[index + 1].width || 150;
    const totalWidth = leftWidth + rightWidth;

    state.resizeData = {
        mode: 'normal',
        index: index,
        startX: e.clientX,
        leftCol: col,
        rightCol: visibleCols[index + 1],
        leftElement: leftElement,
        rightElement: rightElement,
        leftTh: leftTh,
        rightTh: rightTh,
        leftWidth: leftWidth,
        rightWidth: rightWidth,
        totalWidth: totalWidth,
        leftMin: col.minWidth || 30,
        leftMax: col.maxWidth || 600,
        rightMin: visibleCols[index + 1].minWidth || 30,
        rightMax: visibleCols[index + 1].maxWidth || 600,
        isRightFixed: visibleCols[index + 1].key === 'row' || visibleCols[index + 1].key === 'actions' || visibleCols[index + 1].fixed
    };

    th.querySelector('.resize-handle')?.classList.add('active');

    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
    e.preventDefault();
    e.stopPropagation();
}

function onResize(e) {
    const state = window._tableState;
    if (!state || !state.resizeData) return;

    const data = state.resizeData;

    if (data.mode === 'last') {
        const delta = e.clientX - data.startX;
        let newWidth = Math.max(30, data.leftWidth + delta);
        data.leftElement.style.width = newWidth + 'px';
        data.leftElement.style.minWidth = newWidth + 'px';
        data.leftTh.style.width = newWidth + 'px';
        data.leftTh.style.minWidth = newWidth + 'px';
        data.leftCol._width = newWidth;
        state.settings.widths[data.leftCol.key] = Math.round(newWidth);
        return;
    }

    const delta = e.clientX - data.startX;

    // Если правый столбец фиксированный — он не меняется
    if (data.isRightFixed) {
        let newLeftWidth = data.leftWidth + delta;
        newLeftWidth = Math.max(data.leftMin, Math.min(data.leftMax, newLeftWidth));
        data.leftElement.style.width = newLeftWidth + 'px';
        data.leftElement.style.minWidth = newLeftWidth + 'px';
        data.leftTh.style.width = newLeftWidth + 'px';
        data.leftTh.style.minWidth = newLeftWidth + 'px';
        data.leftCol._width = newLeftWidth;
        state.settings.widths[data.leftCol.key] = Math.round(newLeftWidth);
        return;
    }

    let newLeftWidth = data.leftWidth + delta;
    let newRightWidth = data.totalWidth - newLeftWidth;

    if (newLeftWidth < data.leftMin) {
        newLeftWidth = data.leftMin;
        newRightWidth = data.totalWidth - newLeftWidth;
    }
    if (newLeftWidth > data.leftMax) {
        newLeftWidth = data.leftMax;
        newRightWidth = data.totalWidth - newLeftWidth;
    }
    if (newRightWidth < data.rightMin) {
        newRightWidth = data.rightMin;
        newLeftWidth = data.totalWidth - newRightWidth;
    }
    if (newRightWidth > data.rightMax) {
        newRightWidth = data.rightMax;
        newLeftWidth = data.totalWidth - newRightWidth;
    }

    data.leftElement.style.width = newLeftWidth + 'px';
    data.leftElement.style.minWidth = newLeftWidth + 'px';
    data.leftTh.style.width = newLeftWidth + 'px';
    data.leftTh.style.minWidth = newLeftWidth + 'px';

    data.rightElement.style.width = newRightWidth + 'px';
    data.rightElement.style.minWidth = newRightWidth + 'px';
    data.rightTh.style.width = newRightWidth + 'px';
    data.rightTh.style.minWidth = newRightWidth + 'px';

    data.leftCol._width = newLeftWidth;
    data.rightCol._width = newRightWidth;
    state.settings.widths[data.leftCol.key] = Math.round(newLeftWidth);
    state.settings.widths[data.rightCol.key] = Math.round(newRightWidth);
}

function stopResize(e) {
    const state = window._tableState;
    if (state && state.resizeData) {
        document.querySelectorAll('.resize-handle.active').forEach(el => el.classList.remove('active'));
        saveTableSettings(state.tableKey, state.settings);
        state.resizeData = null;
    }
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
}

// ============================================================
//  ЗАГРУЗКА ДАННЫХ
// ============================================================

function loadData(state, page = 1) {
    console.log('🔧 loadData:', page);
    state.currentPage = page;
    if (state.applyFilters) {
        state.applyFilters();
    } else if (state.dataLoader) {
        const search = state.currentSearch || '';
        state.dataLoader(
            page,
            search,
            state.currentFilter || 'all',
            function(data) {
                renderTableBody(state, data || []);
            },
            state.columnFilters || {}
        );
    }
}

// ============================================================
//  ОТРИСОВКА ТЕЛА ТАБЛИЦЫ
// ============================================================

function renderTableBody(state, data) {
    console.log('🔧 renderTableBody, data.length:', data?.length || 0);
    const tbody = state.tbody;
    const visibleCols = getVisibleColumns(state.tableKey, state.settings);
    const renderers = state._renderers || {};

    state._lastData = data || [];

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr class="table-empty"><td colspan="${visibleCols.length}" style="text-align: center; padding: 30px 0; color: #adb5bd;">Нет данных</td></tr>`;
        return;
    }

    let html = '';
    data.forEach((item, index) => {
        const isDeleted = item.is_deleted || false;
        const rowClass = isDeleted ? 'table-deleted' : '';
        const rowNum = (state.currentPage - 1) * 50 + index + 1;
        const rowId = item.id || index;
        const rowHeight = state.rowHeights?.[rowId] || 40;
        const isSelected = state.selectedRows?.has(rowId) || false;
        const selectedClass = isSelected ? 'row-selected' : '';

        html += `<tr class="${rowClass} ${selectedClass}" data-id="${rowId}" style="height: ${rowHeight}px; position: relative;">`;
        visibleCols.forEach(col => {
            let cellContent = '';
            if (col.key === 'row') {
                cellContent = rowNum;
            } else if (renderers[col.key]) {
                cellContent = renderers[col.key](item, index);
            } else {
                cellContent = item[col.key] !== undefined && item[col.key] !== null ? item[col.key] : '';
            }
            const isRow = col.key === 'row' || col.type === 'row_number';
            const isIcon = col.type === 'status' || col.type === 'boolean' || col.type === 'icon';
            let cellClass = '';
            if (isRow) {
                cellClass = 'col-row';
                if (isRow) cellClass += ' col-row-sticky';
            } else if (isIcon) {
                cellClass = 'col-icon';
            } else {
                cellClass = 'col-ellipsis';
            }
            html += `<td class="${cellClass}" style="height: ${rowHeight}px; max-height: ${rowHeight}px; overflow: hidden; position: relative; vertical-align: middle; text-align: ${isRow ? 'center' : isIcon ? 'center' : 'left'};">${cellContent}</td>`;
        });
        html += `</tr>`;
    });
    tbody.innerHTML = html;
    
    // Иконки редактирования только если editMode включён
    if (state.editMode) {
        renderEditIcons(state);
    }
    
    setTimeout(() => {
        tbody.querySelectorAll('.col-truncated[data-tooltip]').forEach(el => {
            const isTruncated = el.scrollWidth > el.clientWidth;
            if (!isTruncated) {
                el.removeAttribute('data-tooltip');
                el.classList.remove('col-truncated');
                el.style.cursor = 'default';
            }
        });
    }, 50);
}

// ============================================================
//  ИКОНКИ РЕДАКТИРОВАНИЯ (справа от таблицы)
// ============================================================

function renderEditIcons(state) {
    const tableWrap = state.container.closest('.table-wrap') || state.container;
    if (!tableWrap) return;

    const oldOverlay = tableWrap.querySelector('.edit-icon-overlay');
    if (oldOverlay) oldOverlay.remove();

    const overlay = document.createElement('div');
    overlay.className = 'edit-icon-overlay';
    overlay.style.cssText = `
        position: absolute;
        right: var(--edit-icon-offset, 8px);
        top: 0;
        bottom: 0;
        pointer-events: none;
        z-index: var(--edit-icon-z-index, 20);
    `;

    const rows = state.tbody.querySelectorAll('tr[data-id]');
    const rowHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 40;
    const editIconSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--edit-icon-size')) || 20;

    rows.forEach(row => {
        const rowId = parseInt(row.dataset.id);
        const isSelected = state.selectedRows?.has(rowId) || false;
        const rect = row.getBoundingClientRect();
        const wrapRect = tableWrap.getBoundingClientRect();
        const offsetTop = rect.top - wrapRect.top + (rowHeight - editIconSize) / 2;

        const icon = document.createElement('span');
        icon.className = `edit-icon ${isSelected ? 'visible' : ''}`;
        icon.textContent = '✏️';
        icon.style.cssText = `
            position: absolute;
            right: 0;
            top: ${offsetTop}px;
            width: ${editIconSize}px;
            height: ${editIconSize}px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${editIconSize}px;
            color: var(--edit-icon-color, #4a6cf7);
            cursor: pointer;
            pointer-events: all;
            opacity: ${isSelected ? '1' : '0'};
            transition: opacity 0.2s ease, transform 0.15s ease;
        `;
        icon.dataset.rowId = rowId;
        icon.title = 'Редактировать';
        icon.addEventListener('click', function(e) {
            e.stopPropagation();
            const id = parseInt(this.dataset.rowId);
            if (state.selectedRows.size > 1) {
                if (typeof openMultiEditModal === 'function') {
                    openMultiEditModal(state);
                }
            } else {
                if (typeof editItem === 'function') {
                    editItem(id);
                }
            }
        });

        overlay.appendChild(icon);
    });

    tableWrap.appendChild(overlay);
}

// ============================================================
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function updateRecordCount(count) {
    const el = document.getElementById('recordCount');
    if (el) {
        const endings = ['запись', 'записи', 'записей'];
        const n = count % 100;
        const idx = (n % 10 === 1 && n !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n < 10 || n >= 20)) ? 1 : 2;
        el.textContent = `${count} ${endings[idx]}`;
    }
}

function toggleSort(state, colKey) {
    if (!state.columnSort) state.columnSort = { key: null, direction: null };
    
    if (state.columnSort.key === colKey) {
        if (state.columnSort.direction === 'asc') {
            state.columnSort.direction = 'desc';
        } else if (state.columnSort.direction === 'desc') {
            state.columnSort.key = null;
            state.columnSort.direction = null;
        } else {
            state.columnSort.key = colKey;
            state.columnSort.direction = 'asc';
        }
    } else {
        state.columnSort.key = colKey;
        state.columnSort.direction = 'asc';
    }
    
    updateSortIndicators(state);
    if (state.applyFilters) state.applyFilters();
    else loadData(state, 1);
}

function updateSortIndicators(state) {
    document.querySelectorAll('#tableHeader th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        th.classList.remove('sort-active');
    });
    if (state.columnSort && state.columnSort.key) {
        const targetTh = document.querySelector(`#tableHeader th[data-col="${state.columnSort.key}"]`);
        if (targetTh) {
            targetTh.classList.add('sort-active');
            targetTh.classList.add(state.columnSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
            // Обновляем индикатор
            const indicator = targetTh.querySelector('.sort-indicator');
            if (indicator) {
                indicator.textContent = state.columnSort.direction === 'asc' ? '↑' : '↓';
                indicator.style.display = 'inline';
            }
        }
    }
}

function toggleFilterDropdown(th, colKey, state) {
    const dropdown = th.querySelector('.col-filter-dropdown');
    if (!dropdown) return;

    document.querySelectorAll('.col-filter-dropdown.show').forEach(el => {
        if (el !== dropdown) el.classList.remove('show');
    });

    if (state._filterPopulate) {
        state._filterPopulate(state._lastData || []);
    }

    dropdown.classList.toggle('show');
    if (dropdown.classList.contains('show')) {
        const rect = th.getBoundingClientRect();
        const dropdownRect = dropdown.getBoundingClientRect();
        if (rect.right + dropdownRect.width > window.innerWidth) {
            dropdown.style.left = 'auto';
            dropdown.style.right = '0';
        } else {
            dropdown.style.left = '0';
            dropdown.style.right = 'auto';
        }
    }
}

// ============================================================
//  УНИВЕРСАЛЬНОЕ МОДАЛЬНОЕ ОКНО
// ============================================================

function openEditModal(tableState, data) {
    console.log('🔧 openEditModal:', data);
    const isEdit = !!data;
    document.getElementById('editModalTitle').textContent = isEdit ? 'Редактировать запись' : 'Добавить запись';
    
    const deleteBtn = document.getElementById('editDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    const editOverlay = document.getElementById('editOverlay');
    if (editOverlay) editOverlay.classList.add('active');

    const allColumns = tableState.config.columns || [];
    const editableCols = allColumns.filter(c => 
        c.key !== 'row' && 
        c.key !== 'id' && 
        c.editable !== false
    );

    const body = document.getElementById('editModalBody');
    let html = '';

    editableCols.forEach(col => {
        if (col.type === 'status' && col.values) {
            const currentValue = data ? (data[col.key] || col.values[0]?.key || '') : col.values[0]?.key || '';
            html += `
                <div class="field-row">
                    <div class="field-label">${col.label}</div>
                    <div class="field-value">
                        <select class="form-select" id="field-${col.key}">
                            ${col.values.map(v => `
                                <option value="${v.key}" ${v.key === currentValue ? 'selected' : ''}>${v.label}</option>
                            `).join('')}
                        </select>
                    </div>
                </div>
            `;
            return;
        }

        if (col.type === 'datetime' || col.type === 'date') {
            const value = data ? (data[col.key] ? formatDateTime(data[col.key]) : '') : '';
            html += `
                <div class="field-row">
                    <div class="field-label">${col.label}</div>
                    <div class="field-value">
                        <input type="text" class="form-control" value="${value}" disabled>
                    </div>
                </div>
            `;
            return;
        }

        const value = data ? (data[col.key] || '') : '';
        const isEditable = col.editable !== false;
        const type = (col.type === 'text' || col.type === 'textarea') ? 'textarea' : 'text';
        const disabled = isEditable ? '' : 'disabled';
        const rows = type === 'textarea' ? 'rows="2"' : '';
        const placeholder = col.label || '';
        
        html += `
            <div class="field-row">
                <div class="field-label">${col.label}</div>
                <div class="field-value">
                    ${type === 'textarea' 
                        ? `<textarea class="form-control" id="field-${col.key}" ${disabled} ${rows} placeholder="${placeholder}">${value}</textarea>`
                        : `<input type="text" class="form-control" id="field-${col.key}" value="${value}" ${disabled} placeholder="${placeholder}">`}
                </div>
            </div>
        `;
    });

    body.innerHTML = html;
    body.dataset.editId = data ? data.id : '';
    const editModal = document.getElementById('editModal');
    const bsModal = new bootstrap.Modal(editModal);
    bsModal.show();
    setTimeout(() => { if (editOverlay) editOverlay.style.zIndex = '1030'; }, 100);
    
    makeDraggable(editModal);
}

function saveEditForm(tableState) {
    console.log('🔧 saveEditForm');
    const body = document.getElementById('editModalBody');
    const editId = body.dataset.editId;
    const allColumns = tableState.config.columns || [];
    const editableCols = allColumns.filter(c => 
        c.key !== 'row' && 
        c.key !== 'id' && 
        c.editable !== false
    );
    
    const data = {};
    editableCols.forEach(col => {
        if (col.type === 'datetime' || col.type === 'date') return;
        const input = document.getElementById(`field-${col.key}`);
        if (input && !input.disabled) {
            data[col.key] = input.value.trim();
        }
    });
    
    const required = editableCols.filter(c => c.required);
    for (const col of required) {
        if (!data[col.key]) {
            alert(`Поле "${col.label}" обязательно для заполнения`);
            return;
        }
    }

    const url = editId ? `/api/v1/tables/manufacturers/${editId}` : '/api/v1/tables/manufacturers/row';
    const method = editId ? 'PUT' : 'POST';

    console.log('📤 Отправка:', { url, method, data });

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    })
    .then(response => {
        if (response.ok) {
            const editModal = document.getElementById('editModal');
            const bsModal = bootstrap.Modal.getInstance(editModal);
            if (bsModal) bsModal.hide();
            const editOverlay = document.getElementById('editOverlay');
            if (editOverlay) { editOverlay.classList.remove('active'); editOverlay.style.zIndex = '1040'; }
            loadData(tableState, 1);
        } else {
            return response.json().then(data => { alert(data.error || 'Ошибка при сохранении'); });
        }
    })
    .catch(error => { alert('Ошибка при сохранении: ' + error.message); });
}

function formatDateTime(value) {
    if (!value) return '';
    try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        const date = d.toLocaleDateString('ru-RU');
        const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return `${date} ${time}`;
    } catch {
        return value;
    }
}

function makeDraggable(modalElement) {
    const header = modalElement.querySelector('.modal-header');
    const dialog = modalElement.querySelector('.modal-dialog');
    if (!header || !dialog) return;
    
    let isDragging = false;
    let offsetX, offsetY;
    let startX, startY;
    
    header.style.cursor = 'move';
    
    header.addEventListener('mousedown', function(e) {
        if (e.target.closest('.btn-close')) return;
        
        isDragging = true;
        const rect = dialog.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        startX = rect.left;
        startY = rect.top;
        
        dialog.style.position = 'fixed';
        dialog.style.left = startX + 'px';
        dialog.style.top = startY + 'px';
        dialog.style.margin = '0';
        dialog.style.transform = 'none';
        dialog.style.width = rect.width + 'px';
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
    });
    
    function onMouseMove(e) {
        if (!isDragging) return;
        const dialog = modalElement.querySelector('.modal-dialog');
        const container = modalElement.querySelector('.modal-content');
        const containerRect = container.getBoundingClientRect();
        const maxX = window.innerWidth - containerRect.width;
        const maxY = window.innerHeight - containerRect.height;
        
        let left = e.clientX - offsetX;
        let top = e.clientY - offsetY;
        
        left = Math.max(0, Math.min(left, maxX));
        top = Math.max(0, Math.min(top, maxY));
        
        dialog.style.left = left + 'px';
        dialog.style.top = top + 'px';
    }
    
    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

// ============================================================
//  НАСТРОЙКА СТОЛБЦОВ
// ============================================================

function openColumnSettings() {
    console.log('🔧 openColumnSettings');
    const modal = document.getElementById('columnSettingsModal');
    if (!modal) {
        alert('Модальное окно настроек столбцов не найдено');
        return;
    }
    
    const body = document.getElementById('columnSettingsBody');
    if (!body) return;
    
    const tableKey = window._tableState?.tableKey || 'manufacturers';
    const settings = window._tableState?.settings || {};
    const config = getTableConfig(tableKey);
    if (!config) {
        alert('Схема не загружена');
        return;
    }
    
    const allColumns = config.columns || [];
    const visible = settings.visible || [];
    const widths = settings.widths || {};
    const labels = settings.labels || {};
    const order = settings.order || [];
    
    const sorted = [...allColumns].sort((a, b) => {
        const ia = order.indexOf(a.key);
        const ib = order.indexOf(b.key);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });
    
    let html = `
        <div class="column-settings-header">
            <span>#</span>
            <span>☑</span>
            <span>Название</span>
            <span>Пользовательское название</span>
            <span>Ширина</span>
            <span>px</span>
            <span>⠿</span>
        </div>
        <div class="column-settings-grid">
            ${sorted.map((col, index) => {
                const isVisible = visible.includes(col.key) || col.fixed;
                const disabled = col.fixed ? 'disabled' : '';
                const isRow = col.key === 'row' || col.type === 'row_number';
                return `
                    <div class="col-item" data-key="${col.key}" data-index="${index}">
                        <span class="col-order">${index + 1}</span>
                        <input type="checkbox" class="col-visibility" ${isVisible ? 'checked' : ''} ${disabled}>
                        <span class="col-label">${col.label}</span>
                        <input type="text" class="col-label-input" value="${labels[col.key] || col.label}" placeholder="Название" ${isRow ? 'disabled' : ''}>
                        <input type="number" class="col-width-input" value="${widths[col.key] || col.width || 150}" min="30" max="800" ${isRow ? 'disabled' : ''}>
                        <span class="px">px</span>
                        ${col.fixed ? '<span class="badge bg-secondary">Фикс</span>' : ''}
                        <span class="col-drag">⠿</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    body.innerHTML = html;
    
    let dragItem = null;
    const list = body.querySelector('.column-settings-grid');
    list.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('.col-drag');
        if (!handle) return;
        dragItem = handle.closest('.col-item');
        if (!dragItem) return;
        e.preventDefault();
        
        const onMove = (ev) => {
            const target = document.elementFromPoint(ev.clientX, ev.clientY);
            if (!target) return;
            const targetItem = target.closest('.col-item');
            if (targetItem && targetItem !== dragItem) {
                const items = Array.from(list.querySelectorAll('.col-item'));
                const dragIndex = items.indexOf(dragItem);
                const targetIndex = items.indexOf(targetItem);
                if (dragIndex < targetIndex) {
                    list.insertBefore(dragItem, targetItem.nextSibling);
                } else {
                    list.insertBefore(dragItem, targetItem);
                }
                dragItem.classList.add('dragging');
                updateOrderNumbers(list);
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
    
    function updateOrderNumbers(list) {
        const items = list.querySelectorAll('.col-item');
        items.forEach((item, index) => {
            const orderSpan = item.querySelector('.col-order');
            if (orderSpan) orderSpan.textContent = index + 1;
        });
    }
    
    const footer = modal.querySelector('.modal-footer');
    
    const oldApplyBtn = footer.querySelector('.btn-apply-settings');
    if (oldApplyBtn) oldApplyBtn.remove();
    
    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn-primary btn-apply-settings';
    applyBtn.textContent = '💾 Применить';
    footer.insertBefore(applyBtn, footer.querySelector('.btn-secondary'));
    
    applyBtn.onclick = function() {
        const items = modal.querySelectorAll('.col-item');
        const visible = [];
        const widths = {};
        const labels = {};
        const order = [];
        
        items.forEach(item => {
            const key = item.dataset.key;
            const checkbox = item.querySelector('.col-visibility');
            const labelInput = item.querySelector('.col-label-input');
            const widthInput = item.querySelector('.col-width-input');
            
            if (checkbox && !checkbox.disabled && checkbox.checked) {
                visible.push(key);
            }
            if (labelInput && !labelInput.disabled) {
                labels[key] = labelInput.value || key;
            }
            if (widthInput && !widthInput.disabled) {
                widths[key] = parseInt(widthInput.value) || 150;
            }
            order.push(key);
        });
        
        const newSettings = {
            visible: visible,
            widths: widths,
            labels: labels,
            order: order,
            filters: settings.filters || {},
            sort: settings.sort || {}
        };
        
        saveTableSettings(tableKey, newSettings);
        
        if (window._tableState) {
            window._tableState.settings = newSettings;
            renderTableHeader(window._tableState);
            loadData(window._tableState, 1);
        }
        
        console.log('✅ Настройки столбцов сохранены');
    };
    
    const resetBtn = footer.querySelector('.btn-outline-secondary');
    if (resetBtn) {
        resetBtn.onclick = function() {
            if (confirm('Сбросить настройки к значениям по умолчанию?')) {
                const defaults = config.default_settings || {};
                const newSettings = {
                    visible: defaults.visible || [],
                    widths: defaults.widths || {},
                    labels: defaults.labels || {},
                    order: defaults.order || [],
                    filters: {},
                    sort: { key: 'id', direction: 'asc' }
                };
                saveTableSettings(tableKey, newSettings);
                if (window._tableState) {
                    window._tableState.settings = newSettings;
                    renderTableHeader(window._tableState);
                    loadData(window._tableState, 1);
                }
            }
        };
    }
    
    const closeBtn = footer.querySelector('.btn-secondary');
    if (closeBtn) {
        closeBtn.onclick = function() {
            const bsModal = bootstrap.Modal.getInstance(modal);
            if (bsModal) bsModal.hide();
        };
    }
    
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    makeDraggable(modal);
}

function resetColumnSettings() {
    const tableKey = window._tableState?.tableKey || 'manufacturers';
    const config = getTableConfig(tableKey);
    if (!config) return;
    const defaults = config.default_settings || {};
    const newSettings = {
        visible: defaults.visible || [],
        widths: defaults.widths || {},
        labels: defaults.labels || {},
        order: defaults.order || [],
        filters: {},
        sort: { key: 'id', direction: 'asc' }
    };
    saveTableSettings(tableKey, newSettings);
    if (window._tableState) {
        window._tableState.settings = newSettings;
        renderTableHeader(window._tableState);
        loadData(window._tableState, 1);
    }
}

// ============================================================
//  ТОГГЛ РЕЖИМА РЕДАКТИРОВАНИЯ
// ============================================================

function toggleEditMode() {
    const state = window._tableState;
    if (!state) return;
    
    state.editMode = !state.editMode;
    const btn = document.getElementById('editModeToggle');
    const btnColumns = document.getElementById('btnColumns');
    
    if (state.editMode) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="bi bi-check2 me-1"></i>Готово';
        btnColumns.style.display = 'inline-block';
        renderEditIcons(state);
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="bi bi-pencil me-1"></i>Редактировать';
        btnColumns.style.display = 'none';
        const overlay = state.container.closest('.table-wrap')?.querySelector('.edit-icon-overlay');
        if (overlay) overlay.remove();
        state.selectedRows.clear();
    }
    
    loadData(state, state.currentPage);
}

// ============================================================
//  ВЫДЕЛЕНИЕ СТРОК (для мультиредактирования)
// ============================================================

function selectRow(state, rowId, ctrlKey, shiftKey) {
    if (!state) return;
    
    if (ctrlKey) {
        if (state.selectedRows.has(rowId)) {
            state.selectedRows.delete(rowId);
        } else {
            state.selectedRows.add(rowId);
        }
    } else if (shiftKey) {
        // TODO: реализовать диапазон
    } else {
        state.selectedRows.clear();
        state.selectedRows.add(rowId);
    }
    
    // Обновляем отображение (перерисовываем строки)
    renderTableBody(state, state._lastData);
}

// ============================================================
//  ЭКСПОРТ
// ============================================================

window.createTable = createTable;
window.loadData = loadData;
window.renderTableHeader = renderTableHeader;
window.renderTableBody = renderTableBody;
window.startResize = startResize;
window.onResize = onResize;
window.stopResize = stopResize;
window.updateRecordCount = updateRecordCount;
window.toggleSort = toggleSort;
window.openEditModal = openEditModal;
window.saveEditForm = saveEditForm;
window.openColumnSettings = openColumnSettings;
window.resetColumnSettings = resetColumnSettings;
window.formatDateTime = formatDateTime;
window.toggleEditMode = toggleEditMode;
window.selectRow = selectRow;

console.log('✅ table.js загружен!');