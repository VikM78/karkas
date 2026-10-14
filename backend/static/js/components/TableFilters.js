/**
 * Excel-подобные фильтры столбцов.
 *
 * Использование:
 *   TableFilters.init({
 *       tableKey: 'manufacturers',
 *       onApplyFilter: (columnKey, values) => table.setFilter(columnKey, values),
 *       onApplySort: (columnKey, direction) => table.setSort(columnKey, direction),
 *       onResetSort: (columnKey) => table.resetSort(columnKey),
 *       getFilters: () => table.params.filters,
 *       getSort: () => table.params.sort,
 *   });
 *
 * Применение:
 *   TableFilters.rebind();  // после каждого рендера таблицы
 */

const TableFilters = {
    _ctx: null,
    _activeDropdown: null,
    _activeColumn: null,
    _outsideHandler: null,

    init(ctx) {
        this._ctx = ctx;
        this._bindGlobalHandlers();
    },

    rebind() {
        const buttons = document.querySelectorAll('.my-filter-btn');
        buttons.forEach(btn => {
            if (btn._filterBound) return;
            btn._filterBound = true;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const columnKey = btn.dataset.column;
                if (columnKey) this.toggle(columnKey, btn);
            });
        });
    },

    async toggle(columnKey, btnEl) {
        if (this._activeColumn === columnKey) {
            this.close();
            return;
        }

        this.close();
        this._activeColumn = columnKey;

        const dropdown = document.createElement('div');
        dropdown.className = 'my-filter-dropdown';
        dropdown.innerHTML = '<div class="my-filter-loading"><div class="my-spinner my-spinner-sm"></div></div>';

        this._positionDropdown(dropdown, btnEl);
        document.body.appendChild(dropdown);
        this._activeDropdown = dropdown;

        this._outsideHandler = (e) => {
            if (!dropdown.contains(e.target) && !btnEl.contains(e.target)) {
                this.close();
            }
        };
        setTimeout(() => {
            document.addEventListener('click', this._outsideHandler);
        }, 0);

        try {
            await this._loadAndRender(columnKey, dropdown);
        } catch (e) {
            console.error('[TableFilters] Ошибка загрузки:', e);
            dropdown.innerHTML = '<div class="my-filter-error">Ошибка загрузки</div>';
        }
    },

    _positionDropdown(dropdown, btnEl) {
        const rect = btnEl.getBoundingClientRect();
        dropdown.style.position = 'absolute';
        dropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
        dropdown.style.left = (rect.left + window.scrollX) + 'px';
    },

    close() {
        if (this._activeDropdown) {
            this._activeDropdown.remove();
            this._activeDropdown = null;
        }
        this._activeColumn = null;

        if (this._outsideHandler) {
            document.removeEventListener('click', this._outsideHandler);
            this._outsideHandler = null;
        }
    },

    async _loadAndRender(columnKey, dropdown) {
        const filters = this._ctx.getFilters ? this._ctx.getFilters() : {};

        const queryFilters = { ...filters };
        delete queryFilters[columnKey];

        const data = await TablesApi.getDistinct(
            this._ctx.tableKey,
            columnKey,
            queryFilters,
            false
        );

        const current = filters[columnKey] || [];
        const allValues = [];
        if (data.has_empty) allValues.push('__null__');
        (data.values || []).forEach(v => allValues.push(v));

        const selected = current.length > 0 ? current : allValues;

        dropdown.innerHTML = this._renderContent(columnKey, data, selected);
        this._bindDropdownHandlers(dropdown, columnKey, data, allValues);
    },

    _renderContent(columnKey, data, selected) {
        const { values = [], has_empty = false, null_label, labels = {} } = data;

        // Текущая сортировка по этому столбцу
        const sort = this._ctx.getSort ? this._ctx.getSort() : [];
        const activeSort = sort.find(s => s.key === columnKey || s.column === columnKey);
        const sortIcon = (dir) => activeSort && activeSort.direction === dir
            ? '<i class="bi bi-caret-right-fill my-filter-sort-active"></i>'
            : '';

        // Список значений
        const items = [];

        if (has_empty) {
            const label = null_label || '(Пустые)';
            const checked = selected.includes('__null__') ? 'checked' : '';
            items.push(`
                <label class="my-filter-item" data-search="${this._escape(String(label).toLowerCase())}">
                    <input type="checkbox" class="my-filter-check" value="__null__" ${checked}>
                    <span class="my-filter-item-label my-filter-item-empty">${this._escape(label)}</span>
                </label>
            `);
        }

        values.forEach(v => {
            const checked = selected.includes(v) ? 'checked' : '';
            const meta = labels[v] || {};
            const label = meta.label || v;
            const icon = meta.icon
                ? `<i class="bi ${meta.icon}" style="color: ${meta.color || 'inherit'}; margin-right: 6px;"></i>`
                : '';

            items.push(`
                <label class="my-filter-item" data-search="${this._escape(String(label).toLowerCase())}" data-value="${this._escapeAttr(v)}">
                    <input type="checkbox" class="my-filter-check" value="${this._escapeAttr(v)}" ${checked}>
                    ${icon}
                    <span class="my-filter-item-label">${this._escape(label)}</span>
                </label>
            `);
        });

        return `
            <div class="my-filter-sort">
                <button type="button" class="my-filter-sort-btn" data-sort="asc">
                    <i class="bi bi-sort-alpha-down"></i> А-Я ${sortIcon('asc')}
                </button>
                <button type="button" class="my-filter-sort-btn" data-sort="desc">
                    <i class="bi bi-sort-alpha-up"></i> Я-А ${sortIcon('desc')}
                </button>
                <button type="button" class="my-filter-sort-btn" data-sort="custom" disabled>
                    <i class="bi bi-list-columns"></i> Настраиваемая (позже)
                </button>
                <button type="button" class="my-filter-sort-btn my-filter-sort-reset" data-sort="reset">
                    <i class="bi bi-x-circle"></i> Сбросить сортировку
                </button>
            </div>

            <div class="my-filter-divider"></div>

            <div class="my-filter-body">
                <button type="button" class="my-filter-clear-filter">
                    <i class="bi bi-eraser"></i> Сбросить фильтр
                </button>
                <div class="my-filter-search">
                    <input type="text" class="my-filter-search-input" placeholder="Поиск...">
                </div>
                <div class="my-filter-list">
                    <label class="my-filter-item my-filter-item-all my-filter-check-all-wrapper">
                        <input type="checkbox" class="my-filter-check-all" checked>
                        <span class="my-filter-item-label"><b>(Выбрать все)</b></span>
                    </label>
                    <label class="my-filter-item my-filter-item-search-all" style="display: none;">
                        <input type="checkbox" class="my-filter-check-search-all" checked>
                        <span class="my-filter-item-label"><b>(Выделить все результаты поиска)</b></span>
                    </label>
                    ${items.join('')}
                </div>
            </div>

            <div class="my-filter-footer">
                <button type="button" class="my-btn my-btn-sm my-btn-primary" data-action="ok">OK</button>
                <button type="button" class="my-btn my-btn-sm my-btn-secondary" data-action="apply">Применить</button>
                <button type="button" class="my-btn my-btn-sm my-btn-link" data-action="cancel">Отмена</button>
            </div>
        `;
    },

    _bindDropdownHandlers(dropdown, columnKey, data, allValues) {
        const checkAll = dropdown.querySelector('.my-filter-check-all');
        const checkAllWrapper = dropdown.querySelector('.my-filter-check-all-wrapper');
        const checkSearchAll = dropdown.querySelector('.my-filter-check-search-all');
        const checkSearchAllWrapper = dropdown.querySelector('.my-filter-item-search-all');
        const searchInput = dropdown.querySelector('.my-filter-search-input');

        // (Выбрать все) — отметить/снять все
        if (checkAll) {
            checkAll.addEventListener('change', () => {
                dropdown.querySelectorAll('.my-filter-check').forEach(cb => {
                    cb.checked = checkAll.checked;
                });
                this._updateCheckAll(dropdown);
            });
        }

        // (Выделить все результаты поиска) — отметить/снять видимые
        if (checkSearchAll) {
            checkSearchAll.addEventListener('change', () => {
                const q = (searchInput?.value || '').trim().toLowerCase();
                dropdown.querySelectorAll('.my-filter-item[data-search]').forEach(item => {
                    if (item.style.display === 'none') return;
                    const s = item.dataset.search || '';
                    if (!q || s.includes(q)) {
                        const cb = item.querySelector('.my-filter-check');
                        if (cb) cb.checked = checkSearchAll.checked;
                    }
                });
                this._updateCheckAll(dropdown);
            });
        }

        // Отдельные чекбоксы
        dropdown.querySelectorAll('.my-filter-check').forEach(cb => {
            cb.addEventListener('change', () => {
                this._updateCheckAll(dropdown);
            });
        });

        // Поиск
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const q = searchInput.value.toLowerCase().trim();

                dropdown.querySelectorAll('.my-filter-item[data-search]').forEach(item => {
                    const s = item.dataset.search || '';
                    const visible = !q || s.includes(q);
                    item.style.display = visible ? '' : 'none';
                });

                if (q) {
                    // Режим поиска — «Выбрать все» скрыт, «Выделить результаты» показан
                    if (checkAllWrapper) checkAllWrapper.style.display = 'none';
                    if (checkSearchAllWrapper) checkSearchAllWrapper.style.display = '';

                    // Сбросить все галки
                    dropdown.querySelectorAll('.my-filter-check').forEach(cb => {
                        cb.checked = false;
                    });

                    // Отметить только видимые
                    dropdown.querySelectorAll('.my-filter-item[data-search]').forEach(item => {
                        if (item.style.display !== 'none') {
                            const cb = item.querySelector('.my-filter-check');
                            if (cb) cb.checked = true;
                        }
                    });

                    if (checkSearchAll) checkSearchAll.checked = true;
                } else {
                    // Поиск очищен — вернуть «Выбрать все»
                    if (checkAllWrapper) checkAllWrapper.style.display = '';
                    if (checkSearchAllWrapper) checkSearchAllWrapper.style.display = 'none';

                    // Отметить все
                    dropdown.querySelectorAll('.my-filter-check').forEach(cb => {
                        cb.checked = true;
                    });

                    if (checkAll) checkAll.checked = true;
                }

                this._updateCheckAll(dropdown);
            });
        }

        // Сортировка
        dropdown.querySelectorAll('.my-filter-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.sort;
                if (action === 'custom') return; // disabled

                if (action === 'reset') {
                    if (this._ctx.onResetSort) {
                        this._ctx.onResetSort(columnKey);
                    }
                } else if (action === 'asc' || action === 'desc') {
                    if (this._ctx.onApplySort) {
                        this._ctx.onApplySort(columnKey, action);
                    }
                }
                this.close();
            });
        });

        // Сбросить фильтр
        const clearBtn = dropdown.querySelector('.my-filter-clear-filter');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (this._ctx.onApplyFilter) {
                    this._ctx.onApplyFilter(columnKey, []);
                }
                this.close();
            });
        }

        // OK / Применить / Отмена
        dropdown.querySelector('[data-action="ok"]').addEventListener('click', () => {
            const selected = this._getSelected(dropdown);
            this._apply(columnKey, selected, allValues.length);
            this.close();
        });

        dropdown.querySelector('[data-action="apply"]').addEventListener('click', () => {
            const selected = this._getSelected(dropdown);
            this._apply(columnKey, selected, allValues.length);
            // Не закрываем
        });

        dropdown.querySelector('[data-action="cancel"]').addEventListener('click', () => {
            this.close();
        });
    },

    /**
     * Отметить/снять все найденные результаты.
     */
    _toggleSearchResults(dropdown, checked, query) {
        dropdown.querySelectorAll('.my-filter-item[data-search]').forEach(item => {
            const s = item.dataset.search || '';
            if (s.includes(query)) {
                const cb = item.querySelector('.my-filter-check');
                if (cb) cb.checked = checked;
            }
        });
    },

        _updateCheckAll(dropdown) {
        const checkAll = dropdown.querySelector('.my-filter-check-all');
        const checkSearchAll = dropdown.querySelector('.my-filter-check-search-all');
        const searchInput = dropdown.querySelector('.my-filter-search-input');
        const q = (searchInput?.value || '').trim().toLowerCase();

        if (q) {
            // Режим поиска — обновляем «Выделить все результаты»
            if (checkSearchAll) {
                const visible = Array.from(dropdown.querySelectorAll('.my-filter-item[data-search]'))
                    .filter(item => item.style.display !== 'none');
                const total = visible.length;
                const checked = visible.filter(item => item.querySelector('.my-filter-check')?.checked).length;

                checkSearchAll.checked = total > 0 && checked === total;
                checkSearchAll.indeterminate = checked > 0 && checked < total;
            }
        } else {
            // Обычный режим — «Выбрать все»
            if (checkAll) {
                const all = dropdown.querySelectorAll('.my-filter-check');
                const checked = Array.from(all).filter(cb => cb.checked);
                checkAll.checked = checked.length === all.length && all.length > 0;
                checkAll.indeterminate = checked.length > 0 && checked.length < all.length;
            }
        }
    },

    _getSelected(dropdown) {
        const result = [];
        dropdown.querySelectorAll('.my-filter-check:checked').forEach(cb => {
            result.push(cb.value);
        });
        return result;
    },

    _apply(columnKey, selected, totalCount) {
        console.log('[Filter] apply', { columnKey, selected, totalCount });
        let values = selected;
        if (values.length >= totalCount) {
            values = [];
        }
        console.log('[Filter] values after check', values);
        if (this._ctx && this._ctx.onApplyFilter) {
            this._ctx.onApplyFilter(columnKey, values);
        } else {
            console.warn('[Filter] onApplyFilter не задан', this._ctx);
        }
    },

    _escape(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    _escapeAttr(str) {
        return this._escape(str);
    },

    _bindGlobalHandlers() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._activeDropdown) {
                this.close();
            }
        });
    },
};

window.TableFilters = TableFilters;