// admin/static/table-filters.js - логика фильтров в столбцах (как в Excel)

// ============================================================
//  СОЗДАНИЕ ФИЛЬТРА В СТОЛБЦЕ (как в Excel)
// ============================================================

function createColumnFilter(state, th, colKey, colLabel) {
    const oldFilter = th.querySelector('.col-filter-dropdown');
    if (oldFilter) oldFilter.remove();

    let content = th.querySelector('.th-content');
    if (!content) {
        content = document.createElement('div');
        content.className = 'th-content';
        th.appendChild(content);
    }

    content.innerHTML = '';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'col-label';
    labelSpan.textContent = colLabel;
    content.appendChild(labelSpan);

    const filterBtn = document.createElement('button');
    filterBtn.className = 'col-btn filter-btn';
    filterBtn.innerHTML = '▼';
    filterBtn.title = 'Фильтр';
    filterBtn.dataset.col = colKey;
    filterBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleFilterDropdown(th, colKey, state);
    });
    content.appendChild(filterBtn);

    if (state.columnFilters && state.columnFilters[colKey] && state.columnFilters[colKey].length > 0) {
        filterBtn.classList.add('active');
    }

    const dropdown = document.createElement('div');
    dropdown.className = 'col-filter-dropdown';
    dropdown.id = `filter-${colKey}`;
    dropdown.dataset.col = colKey;

    const sortGroup = document.createElement('div');
    sortGroup.className = 'sort-group';
    sortGroup.innerHTML = `
        <div class="sort-item" data-sort="asc">
            <span class="sort-icon">↑</span>
            <span>Сортировка от А до Я</span>
        </div>
        <div class="sort-item" data-sort="desc">
            <span class="sort-icon">↓</span>
            <span>Сортировка от Я до А</span>
        </div>
        <div class="sort-item sort-clear" data-sort="clear">
            <span class="sort-icon">↺</span>
            <span>Сброс сортировки</span>
        </div>
    `;
    dropdown.appendChild(sortGroup);

    const divider1 = document.createElement('div');
    divider1.className = 'filter-divider';
    dropdown.appendChild(divider1);

    const clearFilter = document.createElement('div');
    clearFilter.className = 'clear-filter-item';
    clearFilter.innerHTML = `
        <span class="clear-icon">✕</span>
        <span>Очистить фильтр</span>
    `;
    clearFilter.addEventListener('click', function() {
        if (state.columnFilters) {
            delete state.columnFilters[colKey];
        }
        filterBtn.classList.remove('active');
        dropdown.classList.remove('show');
        const th = this.closest('th');
        if (th && state._filterDropdowns && state._filterDropdowns[colKey]) {
            const oldDropdown = th.querySelector('.col-filter-dropdown');
            if (oldDropdown) oldDropdown.remove();
            if (typeof createColumnFilter === 'function') {
                const label = state.settings.labels[colKey] || colKey;
                createColumnFilter(state, th, colKey, label);
            }
        }
        if (state.applyFilters) state.applyFilters();
        else loadData(state, 1);
    });
    dropdown.appendChild(clearFilter);

    const divider2 = document.createElement('div');
    divider2.className = 'filter-divider';
    dropdown.appendChild(divider2);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'filter-search';
    searchInput.placeholder = 'Поиск';
    dropdown.appendChild(searchInput);

    const filterList = document.createElement('div');
    filterList.className = 'filter-list';
    dropdown.appendChild(filterList);

    const actions = document.createElement('div');
    actions.className = 'filter-actions';
    actions.innerHTML = `
        <button class="btn btn-sm btn-primary apply-filter">OK</button>
        <button class="btn btn-sm btn-outline-secondary cancel-filter">Отмена</button>
    `;
    dropdown.appendChild(actions);

    th.appendChild(dropdown);

    const col = getColumnByKey(state.tableKey, colKey);
    const predefinedValues = col && col.filterValues ? col.filterValues : null;

    function populateFilterList(data) {
        const currentData = data || state._lastData || [];
        filterList.innerHTML = '';

        let values;
        if (predefinedValues) {
            values = predefinedValues;
        } else {
            const uniqueValues = new Set();
            currentData.forEach(item => {
                let val = item[colKey];
                if (val === undefined || val === null || val === '') {
                    val = '(Пустые)';
                }
                if (val !== '') {
                    uniqueValues.add(String(val));
                }
            });
            const hasEmpty = currentData.some(item => item[colKey] === undefined || item[colKey] === null || item[colKey] === '');
            values = Array.from(uniqueValues).sort();
            if (hasEmpty && !values.includes('(Пустые)')) {
                values.push('(Пустые)');
            }
        }

        const currentSelected = (state.columnFilters && state.columnFilters[colKey]) || [];
        const hasActiveFilter = currentSelected.length > 0 && currentSelected.length < values.length;
        const allSelected = !hasActiveFilter || values.every(v => currentSelected.includes(v));

        const allDiv = document.createElement('div');
        allDiv.className = 'filter-item filter-all';
        allDiv.innerHTML = `
            <input type="checkbox" class="filter-checkbox" ${allSelected ? 'checked' : ''}>
            <label>(Выбрать все)</label>
        `;
        allDiv.querySelector('input[type="checkbox"]').addEventListener('change', function() {
            const checked = this.checked;
            filterList.querySelectorAll('.filter-item:not(.filter-all) input[type="checkbox"]').forEach(cb => {
                cb.checked = checked;
            });
        });
        filterList.appendChild(allDiv);

        values.forEach(val => {
            const isChecked = currentSelected.includes(val) || allSelected;
            const div = document.createElement('div');
            div.className = 'filter-item';
            
            let label = val;
            if (colKey === 'status') {
                const statusMap = {
                    'active': { label: 'Активен', color: '#059669' },
                    'hidden': { label: 'Скрыт', color: '#6b7280' },
                    'deleted': { label: 'Удалён', color: '#dc2626' },
                    'archived': { label: 'Архив', color: '#d97706' },
                    '(Пустые)': { label: '(Пустые)', color: '#adb5bd' },
                };
                const info = statusMap[val];
                if (info) {
                    label = `<span class="status-dot" style="background:${info.color};"></span>${info.label}`;
                }
            }
            
            div.innerHTML = `
                <input type="checkbox" class="filter-checkbox" value="${val}" ${isChecked ? 'checked' : ''}>
                <label>${label}</label>
            `;
            filterList.appendChild(div);
        });

        const allCheckbox = filterList.querySelector('.filter-all input[type="checkbox"]');
        const itemCheckboxes = filterList.querySelectorAll('.filter-item:not(.filter-all) input[type="checkbox"]');
        
        itemCheckboxes.forEach(cb => {
            cb.addEventListener('change', function() {
                const allChecked = Array.from(itemCheckboxes).every(c => c.checked);
                allCheckbox.checked = allChecked;
            });
        });
    }

    searchInput.addEventListener('input', function() {
        const search = this.value.toLowerCase();
        filterList.querySelectorAll('.filter-item:not(.filter-all)').forEach(item => {
            const label = item.querySelector('label').textContent.toLowerCase();
            item.style.display = label.includes(search) ? 'flex' : 'none';
        });
        const allItem = filterList.querySelector('.filter-all');
        if (allItem) allItem.style.display = 'flex';
    });

    sortGroup.querySelectorAll('.sort-item').forEach(item => {
        item.addEventListener('click', function() {
            const action = this.dataset.sort;
            if (action === 'clear') {
                state.columnSort = { key: null, direction: null };
            } else {
                if (!state.columnSort) state.columnSort = { key: null, direction: null };
                state.columnSort.key = colKey;
                state.columnSort.direction = action;
            }
            updateSortIndicators(state);
            dropdown.classList.remove('show');
            if (state.applyFilters) state.applyFilters();
            else loadData(state, 1);
        });
    });

    actions.querySelector('.apply-filter').addEventListener('click', function() {
        const selected = [];
        filterList.querySelectorAll('.filter-item:not(.filter-all) input[type="checkbox"]:checked').forEach(cb => {
            if (cb.value) selected.push(cb.value);
        });
        
        if (!state.columnFilters) state.columnFilters = {};
        
        const totalItems = filterList.querySelectorAll('.filter-item:not(.filter-all)').length;
        if (selected.length > 0 && selected.length < totalItems) {
            state.columnFilters[colKey] = selected;
            filterBtn.classList.add('active');
        } else {
            delete state.columnFilters[colKey];
            filterBtn.classList.remove('active');
        }
        
        dropdown.classList.remove('show');
        if (state.applyFilters) state.applyFilters();
        else loadData(state, 1);
    });

    actions.querySelector('.cancel-filter').addEventListener('click', function() {
        dropdown.classList.remove('show');
    });

    state._filterPopulate = populateFilterList;
    state._filterDropdowns = state._filterDropdowns || {};
    state._filterDropdowns[colKey] = dropdown;

    populateFilterList(state._lastData || []);
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

window.createColumnFilter = createColumnFilter;
window.toggleFilterDropdown = toggleFilterDropdown;
window.updateSortIndicators = updateSortIndicators;