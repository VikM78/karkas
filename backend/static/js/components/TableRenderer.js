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
        const columns = this._getVisibleColumns(schema, settings);
        const html = `
            <div class="my-table-wrap">
                <table class="my-table" id="table-main">
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
     * Получить видимые столбцы в правильном порядке.
     */
    _getVisibleColumns(schema, settings) {
        const visibleKeys = settings.visible || [];
        const orderKeys = settings.order || [];

        // Карта столбцов по ключу
        const colMap = {};
        schema.columns.forEach(c => { colMap[c.key] = c; });

        // Строим список: виртуальный "row" + видимые из order
        const result = [];

        // Виртуальный столбец "row" — всегда первый
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
            width: settings.widths?.row || 45,
        });

        for (const key of orderKeys) {
            if (key === 'row') continue;
            if (!visibleKeys.includes(key)) continue;
            const col = colMap[key];
            if (col) {
                result.push(col);
            }
        }

        return result;
    },

    /**
     * Рендер <thead>.
     */
    _renderHead(columns) {
        return `
            <tr>
                ${columns.map(col => this._renderTh(col)).join('')}
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

        const style = col.width ? `width: ${col.width}px;` : '';

        const sortable = col.sortable && !col.is_virtual;
        const sortAttr = sortable ? `data-sortable="1" data-column="${col.key}"` : '';

        return `
            <th class="${classes.join(' ')} my-col-${col.type}" style="${style}" ${sortAttr}>
                <div class="my-th-content">
                    <span class="my-col-label">${col.label}</span>
                </div>
            </th>
        `;
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
            if (rs.opacity !== undefined) trStyles.opacity = rs.opacity;
            if (rs.fontStyle) trStyles.fontStyle = rs.fontStyle;
            if (rs.backgroundColor) trStyles.backgroundColor = rs.backgroundColor;
            if (rs.textDecoration) trStyles.textDecoration = rs.textDecoration;
        }

        // Удалённые
        if (row.is_deleted) {
            trClasses.push('my-row-deleted');
        }

        const styleAttr = Object.keys(trStyles).length
            ? `style="${Object.entries(trStyles).map(([k, v]) => `${this._kebab(k)}: ${v}`).join(';')}"`
            : '';

        const tds = columns.map(col => this._renderTd(col, row, rowNumber)).join('');

        return `<tr class="${trClasses.join(' ')}" ${styleAttr}>${tds}</tr>`;
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

        // Виртуальный "row"
        if (col.is_virtual && col.key === 'row') {
            return `<td class="${classes.join(' ')}" style="${style.join(';')}">${rowNumber}</td>`;
        }

        // Значение
        const value = row[col.key];
        const content = this._renderCellContent(col, row, value);

        return `<td class="${classes.join(' ')} my-col-${col.type}" style="${style.join(';')}">${content}</td>`;
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