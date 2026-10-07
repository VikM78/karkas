/**
 * API-клиент для работы с таблицами.
 *
 * Все запросы идут через /api/v1/tables/<table_key>/...
 * Обрабатывает ошибки, возвращает JSON или бросает Error.
 */

const TablesApi = {
    /**
     * Базовый URL.
     */
    BASE: '/api/v1/tables',

    /**
     * Обёртка над fetch с обработкой ошибок.
     */
    async _request(url, options = {}) {
        const response = await fetch(url, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
            ...options,
        });

        // Пустой ответ (204)
        if (response.status === 204) {
            return null;
        }

        let data = null;
        try {
            data = await response.json();
        } catch (e) {
            // Не JSON
        }

        if (!response.ok) {
            const error = new Error(
                (data && data.error) || `HTTP ${response.status}`
            );
            error.status = response.status;
            error.error_code = data && data.error_code;
            error.field = data && data.field;
            error.data = data;
            throw error;
        }

        return data;
    },

    /**
     * Схема таблицы.
     */
    async getSchema(tableKey) {
        return this._request(`${this.BASE}/${tableKey}/schema`);
    },

    /**
     * Данные таблицы.
     */
    async getData(tableKey, params = {}) {
        const qs = this._buildQuery(params);
        const url = `${this.BASE}/${tableKey}/data${qs ? '?' + qs : ''}`;
        return this._request(url);
    },

    /**
     * Уникальные значения столбца.
     */
    async getDistinct(tableKey, columnKey, filters = {}, includeDeleted = false) {
        const params = {
            include_deleted: includeDeleted,
            ...Object.fromEntries(
                Object.entries(filters).map(([k, v]) => [
                    `filter_${k}`,
                    Array.isArray(v) ? v.join(',') : v,
                ])
            ),
        };
        // Не включаем фильтр по самому столбцу
        delete params[`filter_${columnKey}`];

        const qs = this._buildQuery(params);
        const url = `${this.BASE}/${tableKey}/distinct/${columnKey}${qs ? '?' + qs : ''}`;
        return this._request(url);
    },

    /**
     * Настройки пользователя.
     */
    async getSettings(tableKey) {
        return this._request(`${this.BASE}/${tableKey}/settings`);
    },

    /**
     * Сохранить настройки.
     */
    async saveSettings(tableKey, settings) {
        return this._request(`${this.BASE}/${tableKey}/settings`, {
            method: 'PUT',
            body: JSON.stringify(settings),
        });
    },

    /**
     * Создать запись.
     */
    async createRow(tableKey, data) {
        return this._request(`${this.BASE}/${tableKey}/row`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    /**
     * Получить запись.
     */
    async getRow(tableKey, rowId) {
        return this._request(`${this.BASE}/${tableKey}/row/${rowId}`);
    },

    /**
     * Обновить запись.
     */
    async updateRow(tableKey, rowId, data) {
        return this._request(`${this.BASE}/${tableKey}/row/${rowId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    /**
     * Пометить на удаление.
     */
    async markDelete(tableKey, rowId) {
        return this._request(`${this.BASE}/${tableKey}/row/${rowId}/mark-delete`, {
            method: 'PATCH',
        });
    },

    /**
     * Снять пометку.
     */
    async unmarkDelete(tableKey, rowId) {
        return this._request(`${this.BASE}/${tableKey}/row/${rowId}/unmark-delete`, {
            method: 'PATCH',
        });
    },

    /**
     * Полное удаление.
     */
    async hardDelete(tableKey, rowId) {
        return this._request(`${this.BASE}/${tableKey}/row/${rowId}/hard`, {
            method: 'DELETE',
        });
    },

    /**
     * Построить query-строку.
     */
    _buildQuery(params) {
        const parts = [];
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined || value === null || value === '') continue;

            if (Array.isArray(value)) {
                // sort: список объектов
                if (key === 'sort' && typeof value[0] === 'object') {
                    // Пока поддерживаем один столбец
                    const first = value[0];
                    if (first && first.key) {
                        parts.push(`sort=${encodeURIComponent(first.key)}`);
                        parts.push(`order=${encodeURIComponent(first.direction || 'asc')}`);
                    }
                } else {
                    parts.push(`${key}=${encodeURIComponent(value.join(','))}`);
                }
            } else if (typeof value === 'object') {
                // filters: {col: [values]}
                for (const [k, v] of Object.entries(value)) {
                    if (Array.isArray(v) && v.length > 0) {
                        parts.push(`filter_${k}=${encodeURIComponent(v.join(','))}`);
                    }
                }
            } else {
                parts.push(`${key}=${encodeURIComponent(value)}`);
            }
        }
        return parts.join('&');
    },
};

window.TablesApi = TablesApi;