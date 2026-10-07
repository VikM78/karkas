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
            per_page: 50,
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
            page: this.params.page,
            per_page: this.params.per_page,
            sort: this.params.sort,
            filters: this.params.filters,
            include_deleted: this.params.include_deleted,
        };

        const result = await TablesApi.getData(this.tableKey, params);
        this.data = result.data;
        this.meta = result.meta;
    }

    render() {
        TableRenderer.render(
            this.container,
            this.schema,
            this.data,
            this.settings,
            this.meta
        );

        if (this.paginationEl) {
            this._renderPagination();
        }

        this._updatePageTitle();
    }

    _renderPagination() {
        const page = this.meta.page;
        const pages = this.meta.pages;
        const total = this.meta.total;

        if (pages <= 1) {
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