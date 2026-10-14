/**
 * Excel-подобные фильтры столбцов.
 *
 * Использование:
 *   TableFilters.init({
 *       container: '#table-container',
 *       tableKey: 'manufacturers',
 *       onApply: (columnKey, values) => table.setFilter(columnKey, values),
 *       getFilters: () => table.params.filters,
 *   });
 */

const TableFilters = {
    // Контекст
    _ctx: null,

    // Текущая открытая выпадашка
    _activeDropdown: null,
    _activeColumn: null,

    // Закрытие по клику вне
    _outsideHandler: null,

    /**
     * Инициализация.
     *
     * @param {Object} ctx
     * @param {string} ctx.tableKey — ключ таблицы
     * @param {Function} ctx.onApply — (columnKey, values) => void
     * @param {Function} ctx.getFilters — () => filters dict
     */
    init(ctx) {
        this._ctx = ctx;
        this._bindHandlers();
    },

    /**
     * Привязать обработчики к кнопкам фильтра.
     * Вызывается после каждого рендера таблицы.
     */
    rebind() {
        const buttons = document.querySelectorAll('.my-filter-btn');
        buttons.forEach(btn => {
            if (btn._filterBound) return;
            btn._filterBound = true;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const columnKey = btn.dataset.column;
                if (columnKey) {
                    this.toggle(columnKey, btn);
                }
            });
        });
    },

    /**
     * Переключить выпадашку.
     */
    async toggle(columnKey, btnEl) {
        if (this._activeColumn === columnKey) {
            this.close();
            return;
        }

        this.close();
        this._activeColumn = columnKey;

        // Показать контейнер
        const dropdown = document.createElement('div');
        dropdown.className = 'my-filter-dropdown';
        dropdown.innerHTML = '<div class="my-filter-loading"><div class="my-spinner my-spinner-sm"></div></div>';

        // Позиционировать
        this._positionDropdown(dropdown, btnEl);

        document.body.appendChild(dropdown);
        this._activeDropdown = dropdown;

        // Обработчик клика вне
        this._outsideHandler = (e) => {
            if (!dropdown.contains(e.target) && !btnEl.contains(e.target)) {
                this.close();
            }
        };
        setTimeout(() => {
            document.addEventListener('click', this._outsideHandler);
        }, 0);

        // Загрузить данные
        try {
            await this._loadAndRender(columnKey, dropdown);
        } catch (e) {
            console.error('[TableFilters] Ошибка загрузки:', e);
            dropdown.innerHTML = '<div class="my-filter-error">Ошибка загрузки</div>';
        }
    },

    /**
     * Позиционировать выпадашку под кнопкой.
     */
    _positionDropdown(dropdown, btnEl) {
        const rect = btnEl.getBoundingClientRect();
        dropdown.style.position = 'absolute';
        dropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
        dropdown.style.left = (rect.left + window.scrollX) + 'px';
        dropdown.style.zIndex = '1060';
    },

    /**
     * Закрыть активную выпадашку.
     */
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

    /**
     * Загрузить данные и отрисовать выпадашку.
     */
    async _loadAndRender(columnKey, dropdown) {
        const filters = this._ctx.getFilters ? this._ctx.getFilters() : {};

        // Формируем запрос: все фильтры, кроме текущего столбца
        const queryFilters = { ...filters };
        delete queryFilters[columnKey];

        const data = await TablesApi.getDistinct(
            this._ctx.tableKey,
            columnKey,
            queryFilters,
            false
        );

        // Текущий выбор
        const current = filters[columnKey] || [];
        // Если фильтра нет — все выбранные
        const allValues = [];
        if (data.has_empty) allValues.push('__null__');
        (data.values || []).forEach(v => allValues.push(v));

        const selected = current.length > 0 ? current : allValues;

        // Рендер
        dropdown.innerHTML = this._renderContent(columnKey, data, selected);

        // Обработчики
        this._bindDropdownHandlers(dropdown, columnKey, data, allValues);

        // Ресайз
        this._makeResizable(dropdown);
    },

    /**
     * HTML содержимого выпадашки.
     */
    _renderContent(columnKey, data, selected) {
        const { values = [], has_empty = false, null_label, labels = {} } = data;

        // Список значений
        const items = [];

        if (has_empty) {
            const label = null_label || '(Пустые)';
            const checked = selected.includes('__null__') ? 'checked' : '';
            items.push(`
                <label class="my-filter-item">
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
                <label class="my-filter-item" data-search="${this._escape(String(label).toLowerCase())}">
                    <input type="checkbox" class="my-filter-check" value="${this._escapeAttr(v)}" ${checked}>
                    ${icon}
                    <span class="my-filter-item-label">${this._escape(label)}</span>
                </label>
            `);
        });

        const allChecked = selected.length === (values.length + (has_empty ? 1 : 0));
        const allIndeterminate = selected.length > 0 && !allChecked;

        return `
            <div class="my-filter-body">
                <div class="my-filter-search">
                    <input type="text" class="my-filter-search-input" placeholder="Поиск...">
                </div>
                <div class="my-filter-list">
                    <label class="my-filter-item my-filter-item-all">
                        <input type="checkbox" class="my-filter-check-all"
                            ${allChecked ? 'checked' : ''}
                            ${allIndeterminate ? 'data-indeterminate="1"' : ''}>
                        <span class="my-filter-item-label"><b>(Выбрать все)</b></span>
                    </label>
                    ${items.join('')}
                </div>
            </div>
            <div class="my-filter-footer">
                <button type="button" class="my-btn my-btn-sm my-btn-primary" data-action="ok">OK</button>
                <button type="button" class="my-btn my-btn-sm my-btn-secondary" data-action="cancel">Отмена</button>
                <button type="button" class="my-btn my-btn-sm my-btn-link" data-action="clear">Очистить</button>
            </div>
        `;
    },

    /**
     * Обработчики внутри выпадашки.
     */
    _bindDropdownHandlers(dropdown, columnKey, data, allValues) {
        // «Выбрать все»
        const checkAll = dropdown.querySelector('.my-filter-check-all');
        if (checkAll) {
            if (checkAll.dataset.indeterminate === '1') {
                checkAll.indeterminate = true;
            }
            checkAll.addEventListener('change', () => {
                const checked = checkAll.checked;
                dropdown.querySelectorAll('.my-filter-check').forEach(cb => {
                    cb.checked = checked;
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
        const search = dropdown.querySelector('.my-filter-search-input');
        if (search) {
            search.addEventListener('input', () => {
                const q = search.value.toLowerCase().trim();
                dropdown.querySelectorAll('.my-filter-item[data-search]').forEach(item => {
                    const s = item.dataset.search || '';
                    item.style.display = !q || s.includes(q) ? '' : 'none';
                });
            });
        }

        // Кнопки
        dropdown.querySelector('[data-action="ok"]').addEventListener('click', () => {
            const selected = this._getSelected(dropdown);
            this._apply(columnKey, selected, allValues.length);
            this.close();
        });

        dropdown.querySelector('[data-action="cancel"]').addEventListener('click', () => {
            this.close();
        });

        dropdown.querySelector('[data-action="clear"]').addEventListener('click', () => {
            this._apply(columnKey, [], allValues.length);
            this.close();
        });
    },

    /**
     * Обновить состояние «Выбрать все» (checked/indeterminate).
     */
    _updateCheckAll(dropdown) {
        const checkAll = dropdown.querySelector('.my-filter-check-all');
        if (!checkAll) return;

        const all = dropdown.querySelectorAll('.my-filter-check');
        const checked = Array.from(all).filter(cb => cb.checked);
        checkAll.checked = checked.length === all.length;
        checkAll.indeterminate = checked.length > 0 && checked.length < all.length;
    },

    /**
     * Получить список выбранных значений.
     */
    _getSelected(dropdown) {
        const result = [];
        dropdown.querySelectorAll('.my-filter-check:checked').forEach(cb => {
            result.push(cb.value);
        });
        return result;
    },

    /**
     * Применить фильтр.
     */
    _apply(columnKey, selected, totalCount) {
        let values = selected;

        // Если выбраны все — убираем фильтр
        if (values.length >= totalCount) {
            values = [];
        }

        if (this._ctx.onApply) {
            this._ctx.onApply(columnKey, values);
        }
    },

    /**
     * Ресайз выпадашки.
     */
    _makeResizable(dropdown) {
        // CSS: resize: both; overflow: auto;
        dropdown.style.resize = 'both';
        dropdown.style.overflow = 'auto';

        // Ограничения — минимум 5 строк = 5 * ~32px + search + footer
        dropdown.style.minWidth = '200px';
        dropdown.style.minHeight = '200px';
        dropdown.style.maxWidth = 'calc(100vw - 20px)';
        dropdown.style.maxHeight = 'calc(100vh - 20px)';
    },

    // ============================================================
    // ВСПОМОГАТЕЛЬНОЕ
    // ============================================================

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

    /**
     * Привязать глобальные обработчики (только один раз).
     */
    _bindHandlers() {
        // Escape — закрыть
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._activeDropdown) {
                this.close();
            }
        });

        // Скролл — пересчитать позицию
        window.addEventListener('scroll', () => {
            if (this._activeDropdown) {
                // Можно пересчитать позицию, но проще закрыть
                // this.close();
            }
        }, { passive: true });
    },
};

window.TableFilters = TableFilters;