/**
 * TableRenderer — рендеринг таблицы на основе схемы
 */

class TableRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Контейнер ${containerId} не найден`);
        }
    }

    /**
     * Отрисовать таблицу
     * @param {Object} schema — схема таблицы
     * @param {Array} data — данные
     * @param {Object} settings — настройки пользователя
     */
    render(schema, data, settings = {}) {
        if (!schema || !schema.columns || !data) {
            console.warn('Нет данных для отображения');
            return;
        }

        const visibleColumns = this._getVisibleColumns(schema, settings);
        const html = this._buildTable(visibleColumns, data, schema, settings);
        this.container.innerHTML = html;
    }

    _getVisibleColumns(schema, settings) {
        const visibleKeys = settings.visible || schema.default_settings.visible || [];
        const order = settings.order || schema.default_settings.order || [];
        const widths = settings.widths || schema.default_settings.widths || {};

        // Получаем все столбцы из схемы
        const columns = schema.columns;

        // Фильтруем по видимости
        let filtered = columns.filter(col => visibleKeys.includes(col.key) || col.fixed);

        // Сортируем по порядку
        filtered.sort((a, b) => {
            const indexA = order.indexOf(a.key);
            const indexB = order.indexOf(b.key);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        // Добавляем ширину
        filtered.forEach(col => {
            col._width = widths[col.key] || col.width || 150;
        });

        return filtered;
    }

    _buildTable(columns, data, schema, settings) {
        if (!data || data.length === 0) {
            return this._buildEmptyState(columns.length);
        }

        const labels = settings.labels || schema.default_settings.labels || {};

        let html = `
            <div class="table-wrapper">
                <table class="table table-hover table-sm universal-table">
                    <thead>
                        <tr>
                            ${columns.map(col => `
                                <th style="width: ${col._width}px; min-width: ${col.min_width || 50}px; max-width: ${col.max_width || 500}px;"
                                    data-key="${col.key}"
                                    ${col.sortable ? 'data-sortable="true"' : ''}
                                    ${col.filterable ? 'data-filterable="true"' : ''}
                                    class="${col.sortable ? 'sortable' : ''}">
                                    <div class="th-content">
                                        <span class="th-label">${labels[col.key] || col.label}</span>
                                        ${col.sortable ? `<span class="sort-indicator">⇅</span>` : ''}
                                        ${col.filterable ? `<button class="filter-btn" data-key="${col.key}">🔽</button>` : ''}
                                    </div>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((item, index) => `
                            <tr data-id="${item.id || index}">
                                ${columns.map(col => `
                                    <td>
                                        ${this._renderCell(item, col, index, schema)}
                                    </td>
                                `).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        return html;
    }

    _renderCell(item, column, index, schema) {
        const value = item[column.key];

        // Номер строки
        if (column.type === 'row_number') {
            return index + 1;
        }

        // Статус
        if (column.type === 'status' && column.values) {
            const val = column.values.find(v => v.key === value);
            if (val) {
                return `
                    <span class="status-badge" style="background:${val.color}20; color:${val.color};">
                        ${val.icon ? `<i class="bi ${val.icon}"></i>` : ''}
                        ${val.label}
                    </span>
                `;
            }
            return value || '';
        }

        // Булево
        if (column.type === 'boolean') {
            return value
                ? '<span class="badge bg-success"><i class="bi bi-check-lg"></i></span>'
                : '<span class="badge bg-secondary"><i class="bi bi-x-lg"></i></span>';
        }

        // Дата/время
        if (column.type === 'datetime' && value) {
            try {
                const date = new Date(value);
                return date.toLocaleString('ru-RU');
            } catch {
                return value;
            }
        }

        if (column.type === 'date' && value) {
            try {
                const date = new Date(value);
                return date.toLocaleDateString('ru-RU');
            } catch {
                return value;
            }
        }

        // Денежный
        if (column.type === 'currency' && value !== null && value !== undefined) {
            return new Intl.NumberFormat('ru-RU', {
                style: 'currency',
                currency: 'RUB',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(value);
        }

        // Процент
        if (column.type === 'percent' && value !== null && value !== undefined) {
            return value.toFixed(2) + '%';
        }

        // Число
        if ((column.type === 'int' || column.type === 'numeric') && value !== null && value !== undefined) {
            return new Intl.NumberFormat('ru-RU').format(value);
        }

        // Ссылка
        if (column.type === 'url' && value) {
            return `<a href="${value}" target="_blank">${value}</a>`;
        }

        if (column.type === 'email' && value) {
            return `<a href="mailto:${value}">${value}</a>`;
        }

        // По умолчанию
        return value || '';
    }

    _buildEmptyState(colspan) {
        return `
            <div class="table-wrapper">
                <table class="table table-hover table-sm universal-table">
                    <tbody>
                        <tr>
                            <td colspan="${colspan || 1}" class="text-center text-muted py-4">
                                <i class="bi bi-inbox me-2"></i>Нет данных
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }
}