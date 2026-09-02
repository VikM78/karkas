/**
 * TableFilters — управление фильтрами в столбцах
 */

class TableFilters {
    constructor() {
        this.activeFilters = {};
        this.filterData = {};
        this._bindEvents();
    }

    _bindEvents() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-btn');
            if (btn) {
                e.stopPropagation();
                this._toggleFilter(btn);
            }
        });

        // Закрытие фильтров при клике вне
        document.addEventListener('click', () => {
            document.querySelectorAll('.filter-dropdown.show').forEach(el => {
                el.classList.remove('show');
            });
        });
    }

    _toggleFilter(btn) {
        const key = btn.dataset.key;
        const dropdown = document.querySelector(`.filter-dropdown[data-key="${key}"]`);
        const isOpen = dropdown?.classList.contains('show');

        // Закрыть все
        document.querySelectorAll('.filter-dropdown.show').forEach(el => {
            el.classList.remove('show');
        });

        if (isOpen) {
            return;
        }

        // Открыть нужный
        if (dropdown) {
            dropdown.classList.add('show');
        } else {
            this._createFilter(btn, key);
        }
    }

    _createFilter(btn, key) {
        const th = btn.closest('th');
        const filterData = this.filterData[key];

        if (!filterData || !filterData.values) {
            return;
        }

        const dropdown = document.createElement('div');
        dropdown.className = 'filter-dropdown show';
        dropdown.dataset.key = key;

        // Поиск
        dropdown.innerHTML = `
            <div class="filter-search">
                <input type="text" placeholder="Поиск..." class="filter-search-input">
            </div>
            <div class="filter-list">
                <div class="filter-item filter-all">
                    <input type="checkbox" checked>
                    <label>(Выбрать все)</label>
                </div>
                ${filterData.values.map(val => `
                    <div class="filter-item" data-value="${val.key || val}">
                        <input type="checkbox" ${this.activeFilters[key]?.includes(val.key || val) ? 'checked' : ''}>
                        <label>${val.label || val}</label>
                    </div>
                `).join('')}
            </div>
            <div class="filter-actions">
                <button class="btn btn-sm btn-primary filter-apply">OK</button>
                <button class="btn btn-sm btn-outline-secondary filter-cancel">Отмена</button>
                <button class="btn btn-sm btn-outline-danger filter-clear">Очистить</button>
            </div>
        `;

        // Позиционирование
        const rect = th.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = rect.bottom + 'px';
        dropdown.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
        dropdown.style.zIndex = '1000';

        document.body.appendChild(dropdown);

        // Обработчики
        this._bindDropdownEvents(dropdown, key);

        // Закрытие при клике на кнопку
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
        }, { once: true });
    }

    _bindDropdownEvents(dropdown, key) {
        const items = dropdown.querySelectorAll('.filter-item:not(.filter-all) input[type="checkbox"]');
        const allCheckbox = dropdown.querySelector('.filter-all input[type="checkbox"]');
        const applyBtn = dropdown.querySelector('.filter-apply');
        const cancelBtn = dropdown.querySelector('.filter-cancel');
        const clearBtn = dropdown.querySelector('.filter-clear');
        const searchInput = dropdown.querySelector('.filter-search-input');

        // Синхронизация "Выбрать все"
        allCheckbox?.addEventListener('change', function() {
            items.forEach(cb => cb.checked = this.checked);
        });

        items.forEach(cb => {
            cb.addEventListener('change', function() {
                const allChecked = Array.from(items).every(c => c.checked);
                if (allCheckbox) allCheckbox.checked = allChecked;
            });
        });

        // Поиск
        searchInput?.addEventListener('input', function() {
            const search = this.value.toLowerCase();
            const items = dropdown.querySelectorAll('.filter-item:not(.filter-all)');
            items.forEach(item => {
                const label = item.querySelector('label')?.textContent.toLowerCase() || '';
                item.style.display = label.includes(search) ? 'flex' : 'none';
            });
        });

        // OK
        applyBtn?.addEventListener('click', () => {
            const selected = [];
            items.forEach(cb => {
                if (cb.checked) {
                    const val = cb.closest('.filter-item')?.dataset.value;
                    if (val) selected.push(val);
                }
            });
            this.activeFilters[key] = selected;
            this._close(dropdown);
            this._emitChange();
        });

        // Отмена
        cancelBtn?.addEventListener('click', () => {
            this._close(dropdown);
        });

        // Очистить
        clearBtn?.addEventListener('click', () => {
            delete this.activeFilters[key];
            this._close(dropdown);
            this._emitChange();
        });

        // Закрытие при клике вне
        const closeDropdown = (e) => {
            if (!dropdown.contains(e.target)) {
                this._close(dropdown);
                document.removeEventListener('click', closeDropdown);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeDropdown);
        }, 10);
    }

    _close(dropdown) {
        dropdown.classList.remove('show');
        setTimeout(() => dropdown.remove(), 300);
    }

    _emitChange() {
        const event = new CustomEvent('filtersChanged', {
            detail: { filters: this.activeFilters }
        });
        document.dispatchEvent(event);
    }

    /**
     * Установить данные для фильтров
     */
    setFilterData(key, values) {
        this.filterData[key] = { values };
    }

    /**
     * Получить активные фильтры
     */
    getActiveFilters() {
        return this.activeFilters;
    }

    /**
     * Очистить все фильтры
     */
    clearAll() {
        this.activeFilters = {};
        this._emitChange();
    }
}