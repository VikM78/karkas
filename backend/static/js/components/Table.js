class Table {
    constructor(options) {
        this.tableKey = options.tableKey;
        this.container = this._el(options.container);
        this.toolbar = options.toolbar ? this._el(options.toolbar) : null;
        this.paginationEl = options.pagination ? this._el(options.pagination) : null;

        this.schema = null;
        this.data = [];
        this.meta = { page: 1, per_page: 50, total: 0, pages: 1 };
        this.settings = null;

        this.params = {
            page: 1,
            per_page: options.perPage || 500,
            sort: [],
            filters: {},
            include_deleted: false,
        };

        this._initialized = false;
    }

    async init() {
        if (!this.container) {
            console.error('[Table] container не найден');
            return;
        }

        this._showLoader();

        try {
            this.schema = await TablesApi.getSchema(this.tableKey);

            const userSettings = this.schema.settings;
            const defaults = this.schema.default_settings;

            this.settings = {
                visible: userSettings.visible && userSettings.visible.length > 0
                    ? userSettings.visible
                    : defaults.visible,
                order: userSettings.order && userSettings.order.length > 0
                    ? userSettings.order
                    : defaults.order,
                widths: Object.assign({}, defaults.widths, userSettings.widths || {}),
                row_heights: userSettings.row_heights || {},
                labels: Object.assign({}, defaults.labels, userSettings.labels || {}),
                sort: userSettings.sort || defaults.sort || [],
                filters: userSettings.filters || {},
                include_deleted: userSettings.include_deleted || false,
            };

            if (this.settings.sort && this.settings.sort.length > 0) {
                this.params.sort = this.settings.sort.map(function(s) {
                    return {
                        key: s.column || s.key,
                        direction: s.direction || 'asc',
                    };
                });
            }

            await this.loadData();
            this.render();

            this._initialized = true;
            console.log('[Table] ' + this.tableKey + ' готова');

        } catch (error) {
            console.error('[Table] Ошибка инициализации:', error);
            this._showError(error.message);
        }
    }

    async loadData() {
        const params = {
            page: 1,
            per_page: this.params.per_page,
            sort: this.params.sort,
            filters: this.params.filters,
            include_deleted: this.params.include_deleted,
        };

        let result = await TablesApi.getData(this.tableKey, params);

        // Если записей немного — загружаем все сразу
        if (result.meta.total > this.params.per_page && result.meta.total <= 5000) {
            result = await TablesApi.getData(this.tableKey, {
                ...params,
                per_page: result.meta.total,
            });
        }

        this.data = result.data;
        this.meta = result.meta;
    }

    render() {
        this.settings.sort = this.params.sort;
        this.settings.filters = this.params.filters;

        TableRenderer.render(
            this.container,
            this.schema,
            this.data,
            this.settings,
            this.meta
        );

        this._bindSortHandlers();
        this._bindFilterHandlers();
        this._bindResizeHandlers();
		this._bindRowResizeHandlers();

        if (this.paginationEl) {
            this._renderPagination();
        }

        this._updatePageTitle();
    }

    /**
     * Привязать обработчики фильтров.
     */
    _bindFilterHandlers() {
        if (typeof TableFilters === 'undefined') return;

        // Пересоздаём контекст — tableKey может быть разным
        TableFilters.init({
            tableKey: this.tableKey,
            onApplyFilter: (columnKey, values) => this.setFilter(columnKey, values),
            onApplySort: (columnKey, direction) => this.setSort(columnKey, direction),
            onResetSort: (columnKey) => this.resetSort(columnKey),
            getFilters: () => this.params.filters,
            getSort: () => this.params.sort,
        });

        TableFilters.rebind();
    }
	
    /**
     * Привязать обработчики ресайза столбцов.
     */
    _bindResizeHandlers() {
        const handles = this.container.querySelectorAll('.my-col-resize-handle');
        if (!handles.length) return;

        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._startResize(e, handle);
            });

            // Блокируем click на handle (чтобы не сработал на th)
            handle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
    }

    /**
     * Начать ресайз столбца.
     */
    _startResize(e, handle) {
        const colIndex = parseInt(handle.dataset.index, 10);
        const colKey = handle.dataset.column;
        if (isNaN(colIndex) || !colKey) return;

        const colgroup = this.container.querySelector('colgroup');
        if (!colgroup) return;

        const cols = colgroup.querySelectorAll('col');
        const colEl = cols[colIndex];
        if (!colEl) return;

        const startX = e.clientX;
        const startWidth = colEl.getBoundingClientRect().width;

        // Минимум/максимум из метаданных
        const colMeta = this._getColumnMeta(colKey);
        const minPx = this._measureToPx(colMeta?.min_width, 40);
        const maxPx = this._measureToPx(colMeta?.max_width, 2000);

        // Показать, что идёт drag
        document.body.classList.add('col-resizing');
        handle.classList.add('dragging');

        const onMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            let newWidth = startWidth + dx;

            if (newWidth < minPx) newWidth = minPx;
            if (newWidth > maxPx) newWidth = maxPx;

            colEl.style.width = newWidth + 'px';
        };

        const onUp = (upEvent) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.classList.remove('col-resizing');
            handle.classList.remove('dragging');

            // Блокируем возможный click-на-th
            upEvent.stopPropagation();
            upEvent.preventDefault();

            const finalWidth = colEl.getBoundingClientRect().width;
            this._onColumnResize(colKey, finalWidth);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    /**
     * Получить метаданные столбца.
     */
    _getColumnMeta(colKey) {
        if (!this.schema || !this.schema.columns) return null;
        return this.schema.columns.find(c => c.key === colKey);
    }

    /**
     * Перевести measure → px.
     */
    _measureToPx(measure, fallback) {
        if (!measure || !measure.value) return fallback;

        const value = measure.value;
        const unit = measure.unit || 'px';

        if (unit === 'px') return value;
        if (unit === 'rem') return value * this._getBaseFontPx();
        if (unit === 'ch') return value * this._getBaseFontPx() * 0.55;
        if (unit === 'em') return value * this._getBaseFontPx();

        return fallback;
    }

    /**
     * Получить базовый размер шрифта.
     */
    _getBaseFontPx() {
        const val = getComputedStyle(document.documentElement)
            .getPropertyValue('--my-base-font-size-px');
        const num = parseFloat(val);
        return num && num > 0 ? num : 16;
    }

    /**
     * После ресайза — сохранить новую ширину.
     */
    async _onColumnResize(colKey, widthPx) {
        // Флаг — чтобы следующий click не сработал как сортировка
        this._justResized = true;
        setTimeout(() => { this._justResized = false; }, 50);

        // Конвертируем px → rem
        const baseFontPx = this._getBaseFontPx();
        const widthRem = widthPx / baseFontPx;

        // Округляем до 3 знаков
        const rounded = Math.round(widthRem * 1000) / 1000;
        const measureStr = rounded + 'rem';

        // Обновляем локальные настройки
        if (!this.settings.widths) this.settings.widths = {};
        this.settings.widths[colKey] = measureStr;

        // Сохраняем на сервер
        await this._saveSettings();
    }

    /**
     * Сохранить настройки на сервер.
     */
    async _saveSettings() {
        try {
            const settings = {
                visible: this.settings.visible || [],
                order: this.settings.order || [],
                widths: this.settings.widths || {},
                row_heights: this.settings.row_heights || {},
                labels: this.settings.labels || {},
                sort: this.params.sort,
                filters: this.params.filters,
                include_deleted: this.params.include_deleted || false,
            };

            await TablesApi.saveSettings(this.tableKey, settings);
        } catch (e) {
            console.error('[Table] Ошибка сохранения настроек:', e);
        }
    }	
	
    /**
     * Привязать обработчики ресайза строк.
     */
    _bindRowResizeHandlers() {
        const handles = this.container.querySelectorAll('.my-row-resize-handle');
        if (!handles.length) return;

        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._startRowResize(e, handle);
            });

            handle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
    }

    /**
     * Начать ресайз строки.
     */
    _startRowResize(e, handle) {
        const rowId = handle.dataset.rowId;
        if (!rowId) return;

        const tr = handle.closest('tr');
        if (!tr) return;

        const startY = e.clientY;
        const startHeight = tr.getBoundingClientRect().height;

        // Минимум/максимум из CSS
        const minPx = this._getCssRemPx('--my-table-row-min-height', 28);
        const maxPx = this._getCssRemPx('--my-table-row-max-height', 400);

        document.body.classList.add('row-resizing');
        handle.classList.add('dragging');

        const onMove = (moveEvent) => {
            const dy = moveEvent.clientY - startY;
            let newHeight = startHeight + dy;

            if (newHeight < minPx) newHeight = minPx;
            if (newHeight > maxPx) newHeight = maxPx;

            // Применяем к tr
            tr.style.height = newHeight + 'px';
        };

        const onUp = (upEvent) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.classList.remove('row-resizing');
            handle.classList.remove('dragging');

            upEvent.stopPropagation();
            upEvent.preventDefault();

            const finalHeight = tr.getBoundingClientRect().height;
            this._onRowResize(rowId, finalHeight);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    /**
     * Прочитать CSS-переменную в rem → вернуть в px.
     * Если в px — вернуть как есть.
     */
    _getCssRemPx(varName, fallback) {
        const val = getComputedStyle(document.documentElement)
            .getPropertyValue(varName).trim();
        if (!val) return fallback;

        // Парсим '1.75rem' или '28px'
        const m = val.match(/^([0-9.]+)\s*(rem|px)?$/);
        if (!m) return fallback;

        const num = parseFloat(m[1]);
        const unit = m[2] || 'px';

        if (unit === 'rem') {
            return num * this._getBaseFontPx();
        }
        return num;
    }

    /**
     * После ресайза строки — сохранить.
     */
    async _onRowResize(rowId, heightPx) {
        this._justResized = true;
        setTimeout(() => { this._justResized = false; }, 50);

        // px → rem
        const baseFontPx = this._getBaseFontPx();
        const heightRem = heightPx / baseFontPx;
        const rounded = Math.round(heightRem * 1000) / 1000;
        const measureStr = rounded + 'rem';

        // Обновляем локально
        if (!this.settings.row_heights) this.settings.row_heights = {};
        this.settings.row_heights[rowId] = measureStr;

        // Сохраняем
        await this._saveSettings();
    }	

    /**
     * Установить фильтр по столбцу.
     */
    async setFilter(columnKey, values) {
        if (values && values.length > 0) {
            this.params.filters[columnKey] = values;
        } else {
            delete this.params.filters[columnKey];
        }

        this.params.page = 1;

        this._showLoader();
        try {
            await this.loadData();
            this.render();
        } catch (error) {
            console.error('[Table] Ошибка фильтра:', error);
        }
    }

    /**
     * Обработчики кликов по заголовкам для сортировки.
     */
    _bindSortHandlers() {
        const ths = this.container.querySelectorAll('[data-sortable="1"]');
        ths.forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', (e) => {
                // Клик по кнопке фильтра — не сортировка
                if (e.target.closest('.my-filter-btn')) {
                    return;
                }
                // Клик по resize handle — не сортировка
                if (e.target.closest('.my-col-resize-handle')) {
                    return;
                }
                // Только что был ресайз — не сортировка
                if (this._justResized) {
                    this._justResized = false;
                    return;
                }
                const column = th.dataset.column;
                if (column) {
                    this.toggleSort(column);
                }
            });
        });
    }

    /**
     * Переключить сортировку по столбцу.
     * asc → desc → сброс → asc → ...
     */
    async toggleSort(columnKey) {
        const current = this.params.sort.find(s => s.key === columnKey);

        if (!current) {
            // Не сортировано → asc
            this.params.sort = [{ key: columnKey, direction: 'asc' }];
        } else if (current.direction === 'asc') {
            // asc → desc
            this.params.sort = [{ key: columnKey, direction: 'desc' }];
        } else {
            // desc → сброс
            this.params.sort = [];
        }

        this.params.page = 1;  // сброс на первую страницу

        this._showLoader();
        try {
            await this.loadData();
            this.render();
        } catch (error) {
            console.error('[Table] Ошибка сортировки:', error);
        }
    }
	
    /**
     * Установить сортировку по столбцу.
     */
    async setSort(columnKey, direction) {
        this.params.sort = [{ key: columnKey, direction: direction || 'asc' }];
        this.params.page = 1;
        this._showLoader();
        try {
            await this.loadData();
            this.render();
        } catch (error) {
            console.error('[Table] Ошибка сортировки:', error);
        }
    }

    /**
     * Сбросить сортировку по столбцу.
     */
    async resetSort(columnKey) {
        this.params.sort = this.params.sort.filter(s => s.key !== columnKey);
        this.params.page = 1;
        this._showLoader();
        try {
            await this.loadData();
            this.render();
        } catch (error) {
            console.error('[Table] Ошибка сброса сортировки:', error);
        }
    }

    _renderPagination() {
        const page = this.meta.page;
        const pages = this.meta.pages;
        const total = this.meta.total;

        // Пагинация только для больших таблиц (>5000)
        if (pages <= 1 || total <= 5000) {
            this.paginationEl.innerHTML = '';
            return;
        }

        const prevDisabled = page <= 1;
        const nextDisabled = page >= pages;

        this.paginationEl.innerHTML =
            '<ul class="my-pagination">' +
                '<li class="my-pagination-item ' + (prevDisabled ? 'disabled' : '') + '">' +
                    '<a class="my-pagination-link" data-page="' + (page - 1) + '">←</a>' +
                '</li>' +
                '<li class="my-pagination-item active">' +
                    '<span class="my-pagination-link">' + page + ' / ' + pages + '</span>' +
                '</li>' +
                '<li class="my-pagination-item ' + (nextDisabled ? 'disabled' : '') + '">' +
                    '<a class="my-pagination-link" data-page="' + (page + 1) + '">→</a>' +
                '</li>' +
            '</ul>';

        const self = this;
        this.paginationEl.querySelectorAll('[data-page]').forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const p = parseInt(link.dataset.page, 10);
                if (p >= 1 && p <= pages) {
                    self.goToPage(p);
                }
            });
        });
    }

    async goToPage(page) {
        this.params.page = page;
        this._showLoader();
        try {
            await this.loadData();
            this.render();
        } catch (error) {
            console.error('[Table] Ошибка загрузки:', error);
        }
    }

    _updatePageTitle() {
        const titleEl = document.getElementById('dynamicPageTitle');
        if (titleEl && this.schema && this.schema.table) {
            const textEl = titleEl.querySelector('.my-page-title-text');
            if (textEl) {
                textEl.textContent = this.schema.table.name;
            }
        }
    }

    _showLoader() {
        this.container.innerHTML =
            '<div class="my-table-wrap my-flex my-flex-center my-items-center" style="min-height: 200px;">' +
                '<div class="my-spinner"></div>' +
            '</div>';
    }

    _showError(message) {
        this.container.innerHTML =
            '<div class="my-table-wrap">' +
                '<div class="my-alert my-alert-danger" style="margin: var(--my-padding-md);">' +
                    'Ошибка загрузки: ' + message +
                '</div>' +
            '</div>';
    }

    _el(ref) {
        if (!ref) return null;
        if (typeof ref === 'string') {
            return document.querySelector(ref);
        }
        return ref;
    }
}

window.Table = Table;