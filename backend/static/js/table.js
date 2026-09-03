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
        const width = state.settings.widths[col.key] || col.width || 150;
        const minWidth = col.minWidth || 30;
        const maxWidth = col.maxWidth || 600;

        const colEl = document.createElement('col');
        colEl.style.width = width + 'px';
        colEl.style.minWidth = minWidth + 'px';
        colEl.style.maxWidth = maxWidth + 'px';
        colEl.dataset.col = col.key;
        colgroup.appendChild(colEl);

        const th = document.createElement('th');
        th.dataset.col = col.key;
        th.dataset.index = index;
        th.style.width = width + 'px';
        th.style.minWidth = minWidth + 'px';
        th.style.maxWidth = maxWidth + 'px';
        th.style.position = 'relative';

        const label = state.settings.labels[col.key] || col.label;
        
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
            
            if (col.sortable !== false) {
                const sortBtn = document.createElement('button');
                sortBtn.className = 'col-btn sort-btn';
                sortBtn.innerHTML = '⇅';
                sortBtn.title = 'Сортировка';
                sortBtn.style.background = 'none';
                sortBtn.style.border = 'none';
                sortBtn.style.padding = '0 3px';
                sortBtn.style.color = '#adb5bd';
                sortBtn.style.cursor = 'pointer';
                sortBtn.style.fontSize = '12px';
                sortBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    toggleSort(state, col.key);
                });
                content.appendChild(sortBtn);
            }
            
            th.appendChild(content);
        } else {
            th.textContent = label;
        }

        if (index < visibleCols.length - 1) {
            const handle = document.createElement('div');
            handle.className = 'resize-handle';
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

        html += `<tr class="${rowClass}" data-id="${rowId}" style="height: ${rowHeight}px; position: relative;">`;
        visibleCols.forEach(col => {
            let cellContent = '';
            if (col.key === 'row') {
                cellContent = rowNum;
            } else if (renderers[col.key]) {
                cellContent = renderers[col.key](item, index);
            } else {
                cellContent = item[col.key] !== undefined && item[col.key] !== null ? item[col.key] : '';
            }
            html += `<td style="height: ${rowHeight}px; max-height: ${rowHeight}px; overflow: hidden; position: relative; vertical-align: middle; ${col.key === 'actions' ? 'text-align: center;' : ''} ${col.key === 'status' ? 'text-align: center;' : ''} ${col.key === 'row' ? 'text-align: right;' : ''}">${cellContent}</td>`;
        });
        html += `</tr>`;
    });
    tbody.innerHTML = html;
    
    // Проверяем обрезку для tooltip
    if (typeof TableRenderer !== 'undefined') {
        const tempRenderer = new TableRenderer('temp');
        tbody.querySelectorAll('.col-truncated[data-tooltip]').forEach(el => {
            const isTruncated = el.scrollWidth > el.clientWidth;
            if (!isTruncated) {
                el.removeAttribute('data-tooltip');
                el.classList.remove('col-truncated');
                el.style.cursor = 'default';
            }
        });
    }
}

// ============================================================
//  RESIZE СТОЛБЦОВ
// ============================================================

function setupResize(state) {}

function startResize(e, index, state) {
    const th = e.target.closest('th');
    if (!th) return;

    const visibleCols = getVisibleColumns(state.tableKey, state.settings);
    const colElements = state.colgroup.querySelectorAll('col');
    const thElements = state.thead.querySelectorAll('th');

    const colStates = [];
    let totalWidth = 0;

    visibleCols.forEach((col, i) => {
        let width = parseInt(colElements[i]?.style.width) || state.settings.widths[col.key] || col.width || 150;
        if (isNaN(width) || width < 10) width = col.width || 150;
        colStates.push({
            key: col.key,
            width: width,
            minWidth: col.minWidth || 30,
            maxWidth: col.maxWidth || 600,
            element: colElements[i],
            thElement: thElements[i]
        });
        totalWidth += width;
    });

    state.resizeData = {
        index: index,
        startX: e.clientX,
        colStates: colStates,
        totalWidth: totalWidth
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

    const delta = e.clientX - state.resizeData.startX;
    const leftCol = state.resizeData.colStates[state.resizeData.index];
    const rightCol = state.resizeData.colStates[state.resizeData.index + 1];

    if (!leftCol || !rightCol) return;

    let newLeftWidth = leftCol.width + delta;
    newLeftWidth = Math.max(leftCol.minWidth, Math.min(leftCol.maxWidth, newLeftWidth));

    const otherWidth = state.resizeData.colStates.reduce((sum, s, i) => {
        if (i === state.resizeData.index || i === state.resizeData.index + 1) return sum;
        return sum + s.width;
    }, 0);

    let newRightWidth = state.resizeData.totalWidth - otherWidth - newLeftWidth;
    newRightWidth = Math.max(rightCol.minWidth, Math.min(rightCol.maxWidth, newRightWidth));

    if (newRightWidth >= rightCol.maxWidth || newRightWidth <= rightCol.minWidth) {
        const maxLeft = state.resizeData.totalWidth - otherWidth - rightCol.minWidth;
        const minLeft = state.resizeData.totalWidth - otherWidth - rightCol.maxWidth;
        newLeftWidth = Math.max(leftCol.minWidth, Math.min(leftCol.maxWidth, newLeftWidth));
        newLeftWidth = Math.max(minLeft, Math.min(maxLeft, newLeftWidth));
        newRightWidth = state.resizeData.totalWidth - otherWidth - newLeftWidth;
        newRightWidth = Math.max(rightCol.minWidth, Math.min(rightCol.maxWidth, newRightWidth));
    }

    if (leftCol.element) {
        leftCol.element.style.width = newLeftWidth + 'px';
        leftCol.element.style.minWidth = newLeftWidth + 'px';
    }
    if (leftCol.thElement) {
        leftCol.thElement.style.width = newLeftWidth + 'px';
        leftCol.thElement.style.minWidth = newLeftWidth + 'px';
    }

    if (rightCol.element) {
        rightCol.element.style.width = newRightWidth + 'px';
        rightCol.element.style.minWidth = newRightWidth + 'px';
    }
    if (rightCol.thElement) {
        rightCol.thElement.style.width = newRightWidth + 'px';
        rightCol.thElement.style.minWidth = newRightWidth + 'px';
    }

    state.settings.widths[leftCol.key] = Math.round(newLeftWidth);
    state.settings.widths[rightCol.key] = Math.round(newRightWidth);
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
    });
    if (state.columnSort && state.columnSort.key) {
        const targetTh = document.querySelector(`#tableHeader th[data-col="${state.columnSort.key}"]`);
        if (targetTh) {
            targetTh.classList.add(state.columnSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
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
                return `
                    <div class="col-item" data-key="${col.key}" data-index="${index}">
                        <span class="col-order">${index + 1}</span>
                        <input type="checkbox" class="col-visibility" ${isVisible ? 'checked' : ''} ${disabled}>
                        <span class="col-label">${col.label}</span>
                        <input type="text" class="col-label-input" value="${labels[col.key] || col.label}" placeholder="Название">
                        <input type="number" class="col-width-input" value="${widths[col.key] || col.width || 150}" min="30" max="800">
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
            if (labelInput) {
                labels[key] = labelInput.value || key;
            }
            if (widthInput) {
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

console.log('✅ table.js загружен!');