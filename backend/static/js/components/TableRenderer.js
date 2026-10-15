/**
 * Рендер таблицы в HTML.
 *
 * Отвечает за:
 *   - построение <thead>, <tbody>
 *   - форматирование ячеек (по типам)
 *   - виртуальный столбец "row" (порядковый номер)
 *   - применение row_styles для статусов
 */

const TableRenderer = {
    /**
     * Отрендерить таблицу.
     *
     * @param {HTMLElement} container — куда рендерить
     * @param {Object} schema — схема из API
     * @param {Array} data — массив записей
     * @param {Object} settings — настройки пользователя (visible, order, widths)
     * @param {Object} meta — пагинация (для номеров строк)
     */
    render(container, schema, data, settings, meta) {
        // Сохранить сортировку, фильтры, высоты
        this._currentSort = settings.sort || [];
        this._currentFilters = settings.filters || {};
        this._currentRowHeights = settings.row_heights || {};

        const columns = this._getVisibleColumns(schema, settings);
        const html = `
            <div class="my-table-wrap">
                <table class="my-table" id="table-main">
                    ${this._renderColgroup(columns)}
                    <thead>
                        ${this._renderHead(columns)}
                    </thead>
                    <tbody>
                        ${this._renderBody(columns, data, meta)}
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = html;
    },

    /**
     * Базовый размер шрифта для FHD (px) — из CSS.
     */
    _getBaseFontPx() {
        const val = getComputedStyle(document.documentElement)
            .getPropertyValue('--my-base-font-size-px');
        const num = parseFloat(val);
        return num && num > 0 ? num : 16;
    },

    /**
     * Рендер <colgroup> — ширины колонок + виртуальный столбец-заполнитель.
     */
    _renderColgroup(columns) {
        const cols = columns.map(col => {
            const width = this._getColWidthRaw(col);
            return `<col style="width: ${width}">`;
        }).join('');
        const fillerCol = `<col class="my-col-filler">`;
        return `<colgroup>${cols}${fillerCol}</colgroup>`;
    },

    /**
     * Получить ширину колонки в rem.
     */
    _getColWidthRaw(col) {
        // col.default_width — объект {raw, value, unit, rem, px} из API
        if (col.default_width && col.default_width.raw) {
            return col.default_width.raw;
        }
        // Fallback — если строка без парсинга
        if (typeof col.default_width === 'string') {
            return col.default_width;
        }
        return '9.375rem';
    },

    /**
     * Получить видимые столбцы в правильном порядке.
     */
    _getVisibleColumns(schema, settings) {
        const visibleKeys = settings.visible || [];
        const orderKeys = settings.order || [];
        const widths = settings.widths || {};

        const colMap = {};
        schema.columns.forEach(c => { colMap[c.key] = c; });

        const result = [];

        // Виртуальный "row"
        result.push({
            key: 'row',
            label: '№',
            type: 'row_number',
            is_virtual: true,
            align_h: 'center',
            align_v: 'middle',
            visible: true,
            sortable: false,
            filterable: false,
            default_width: this._toMeasure(widths['row']) || { raw: '2.8125rem' },
            _index: 0,
        });

        // Status
        if (visibleKeys.includes('status') && colMap['status']) {
            const col = { ...colMap['status'] };
            const w = this._toMeasure(widths['status']);
            if (w) col.default_width = w;
            col._index = result.length;
            result.push(col);
        }

        // Остальные
        for (const key of orderKeys) {
            if (key === 'row' || key === 'status') continue;
            if (!visibleKeys.includes(key)) continue;
            const col = colMap[key];
            if (col) {
                const colCopy = { ...col };
                const w = this._toMeasure(widths[key]);
                if (w) colCopy.default_width = w;
                colCopy._index = result.length;
                result.push(colCopy);
            }
        }

        return result;
    },
	
    /**
     * Проверить, применён ли фильтр по столбцу.
     */
    _isFiltered(columnKey) {
        if (!this._currentFilters) return false;
        const values = this._currentFilters[columnKey];
        return Array.isArray(values) && values.length > 0;
    },

    /**
     * Привести значение из user_settings.widths к measure-структуре.
     * Принимает строку ('16.5rem') или объект ({raw}).
     */
    _toMeasure(value) {
        if (!value) return null;
        if (typeof value === 'string') {
            return { raw: value };
        }
        if (typeof value === 'object' && value.raw) {
            return value;
        }
        return null;
    },

    /**
     * Рендер <thead>.
     */
    _renderHead(columns) {
        return `
            <tr>
                ${columns.map(col => this._renderTh(col)).join('')}
                <th class="my-col-filler-th"></th>
            </tr>
        `;
    },

    /**
     * Рендер <th>.
     */
    _renderTh(col) {
        const classes = [];
        if (col.is_virtual && col.key === 'row') classes.push('my-col-row-sticky');
        if (col.type === 'status') classes.push('my-col-status-th');

        const style = '';

        const sortable = col.sortable === true && !col.is_virtual;
        const sortAttr = sortable ? `data-sortable="1" data-column="${col.key}"` : '';

        const isStatus = col.type === 'status';

        const sortIcon = this._renderSortIndicator(col.key);

        const filterIcon = col.filterable && !col.is_virtual
            ? `<button class="my-col-btn my-filter-btn${this._isFiltered(col.key) ? ' active' : ''}" data-column="${col.key}" title="Фильтр"><i class="bi bi-funnel-fill"></i></button>`
            : '';

        const contentHtml = isStatus
            ? `${sortIcon}${filterIcon}`
            : `<span class="my-col-label">${col.label}</span>${sortIcon}${filterIcon}`;

        // Resize handle — не для виртуальных
        const resizeHandle = !col.is_virtual
            ? `<div class="my-col-resize-handle" data-column="${col.key}" data-index="${col._index}"></div>`
            : '';

        // Атрибут для идентификации колонки
        const colAttr = `data-col-key="${col.key}" data-col-index="${col._index}"`;

        return `
            <th class="${classes.join(' ')} my-col-${col.type}" style="${style}" ${sortAttr} ${colAttr}>
                <div class="my-th-content">
                    ${contentHtml}
                </div>
                ${resizeHandle}
            </th>
        `;
    },

    /**
     * Проверить, применён ли фильтр по столбцу.
     */
    _isFiltered(columnKey) {
        if (!this._currentFilters) return false;
        const values = this._currentFilters[columnKey];
        return Array.isArray(values) && values.length > 0;
    },

    /**
     * Индикатор сортировки — только если столбец активен в сортировке.
     */
    _renderSortIndicator(columnKey) {
        if (!this._currentSort || !Array.isArray(this._currentSort)) return '';

        const active = this._currentSort.find(s => s.key === columnKey || s.column === columnKey);
        if (!active) return '';

        const icon = active.direction === 'desc' ? 'bi-arrow-down' : 'bi-arrow-up';
        return `<i class="bi ${icon} my-sort-indicator"></i>`;
    },
	
    /**
     * Рендер <tbody>.
     */
    _renderBody(columns, data, meta) {
        if (!data || data.length === 0) {
            const colSpan = columns.length || 1;
            return `<tr><td colspan="${colSpan}" class="my-text-center my-text-muted my-py-4">Нет данных</td></tr>`;
        }

        const startNumber = ((meta.page || 1) - 1) * (meta.per_page || 50);

        return data.map((row, idx) => {
            const rowNumber = startNumber + idx + 1;
            return this._renderTr(row, columns, rowNumber);
        }).join('');
    },

    /**
     * Рендер <tr>.
     */
    _renderTr(row, columns, rowNumber) {
        const trClasses = [];
        const trStyles = {};

        // Стиль строки из status
        const statusFormatted = row.status_formatted;
        if (statusFormatted && statusFormatted.row_styles) {
            const rs = statusFormatted.row_styles;
            if (rs.fontStyle) trStyles.fontStyle = rs.fontStyle;
            if (rs.backgroundColor) trStyles.backgroundColor = rs.backgroundColor;
            if (rs.textDecoration) trStyles.textDecoration = rs.textDecoration;
        }

        // Удалённые
        if (row.is_deleted) {
            trClasses.push('my-row-deleted');
        }

        // Высота строки из user_settings.row_heights
        if (row.id !== undefined && this._currentRowHeights && this._currentRowHeights[row.id]) {
            const h = this._currentRowHeights[row.id];
            if (typeof h === 'string') {
                trStyles.height = h;
            } else if (typeof h === 'object' && h.raw) {
                trStyles.height = h.raw;
            }
        }

        const styleAttr = Object.keys(trStyles).length
            ? `style="${Object.entries(trStyles).map(([k, v]) => `${this._kebab(k)}: ${v}`).join(';')}"`
            : '';

        const tds = columns.map(col => this._renderTd(col, row, rowNumber)).join('');

        // Виртуальная ячейка-заполнитель
        const fillerTd = `<td class="my-col-filler-td"></td>`;

        return `<tr class="${trClasses.join(' ')}" ${styleAttr}>${tds}${fillerTd}</tr>`;
    },

    /**
     * Рендер <td>.
     */
    _renderTd(col, row, rowNumber) {
        const classes = [];
        const style = [];

        if (col.is_virtual && col.key === 'row') {
            classes.push('my-col-row-sticky');
        }
        if (col.type === 'status') {
            classes.push('my-col-status-td');
        }
        if (col.align_h) {
            style.push(`text-align: ${col.align_h}`);
        }
        if (col.align_v) {
            style.push(`vertical-align: ${col.align_v}`);
        }
        if (col.width) {
            style.push(`width: ${col.width}px`);
        }

        // Виртуальный "row" — с handle для ресайза строки
        if (col.is_virtual && col.key === 'row') {
            const rowId = row.id;
            const handle = rowId !== undefined
                ? `<div class="my-row-resize-handle" data-row-id="${rowId}"></div>`
                : '';
            return `<td class="${classes.join(' ')}" style="${style.join('; ')}">${rowNumber}${handle}</td>`;
        }

        // Значение
        const value = row[col.key];
        const content = this._renderCellContent(col, row, value);

                // Применяем opacity к содержимому (не к tr — чтобы не портить границы)
        const statusFormatted = row.status_formatted;
        const opacity = statusFormatted?.row_styles?.opacity;
        const styledContent = opacity !== undefined && opacity < 1
            ? `<span style="opacity: ${opacity};">${content}</span>`
            : content;

        return `<td class="${classes.join(' ')} my-col-${col.type}" style="${style.join(';')}">${styledContent}</td>`;
    },

    /**
     * Рендер содержимого ячейки по типу.
     */
    _renderCellContent(col, row, value) {
        // NULL
        if (value === null || value === undefined || value === '') {
            return '';
        }

        // Статус
        if (col.type === 'status') {
            const formatted = row[`${col.key}_formatted`];
            if (formatted && formatted.icon) {
                const color = formatted.color || 'inherit';
                return `<span class="my-status-icon" style="color: ${color};" title="${formatted.label}"><i class="bi ${formatted.icon}"></i></span>`;
            }
            return '';
        }

        // Boolean
        if (col.type === 'boolean') {
            return value ? '<i class="bi bi-check-circle-fill" style="color: #059669;"></i>' : '';
        }

        // Дата
        if (col.type === 'date') {
            return this._formatDate(value);
        }

        if (col.type === 'datetime') {
            return this._formatDateTime(value);
        }

        // Число
        if (col.type === 'int') {
            return this._escape(String(value));
        }

        if (col.type === 'numeric' || col.type === 'currency') {
            return this._escape(String(value));
        }

        // Строка / текст
        if (col.is_multiline) {
            return `<span class="my-col-multiline" title="${this._escape(value)}">${this._escape(value)}</span>`;
        }

        return `<span class="my-col-ellipsis" title="${this._escape(value)}">${this._escape(value)}</span>`;
    },

    /**
     * Форматирование даты (YYYY-MM-DD).
     */
    _formatDate(value) {
        if (!value) return '';
        return String(value).slice(0, 10);
    },

    /**
     * Форматирование даты+времени.
     */
    _formatDateTime(value) {
        if (!value) return '';
        // "2026-10-06T10:31:27.165501" → "06.10.2026 10:31"
        const d = new Date(value);
        if (isNaN(d.getTime())) return String(value);

        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    /**
     * Escape HTML.
     */
    _escape(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    /**
     * camelCase → kebab-case.
     */
    _kebab(str) {
        return str.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    },
};

window.TableRenderer = TableRenderer;