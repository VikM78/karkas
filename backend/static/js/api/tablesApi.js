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
        // Авто-refresh перед запросом (если скоро истечёт)
        await this._ensureFreshToken();

        const response = await fetch(url, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
            ...options,
        });

        // 401 — попробовать refresh один раз
        if (response.status === 401) {
            const refreshed = await this._tryRefresh();

            if (refreshed) {
                // Повторить запрос
                const retry = await fetch(url, {
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(options.headers || {}),
                    },
                    ...options,
                });

                return this._parseResponse(retry);
            }

            // Refresh не удался — редирект на login
            this._redirectToLogin();
            const error = new Error('Unauthorized');
            error.status = 401;
            throw error;
        }

        return this._parseResponse(response);
    },

    /**
     * Разобрать ответ: JSON или ошибка.
     */
    async _parseResponse(response) {
        if (response.status === 204) return null;

        let data = null;
        try {
            data = await response.json();
        } catch (e) {}

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
     * Проверить: если access истекает в течение 2 минут — refresh.
     */
    async _ensureFreshToken() {
        const exp = this._getAccessExp();
        if (!exp) return;

        const now = Math.floor(Date.now() / 1000);
        const timeLeft = exp - now;

        if (timeLeft < 120) {
            await this._tryRefresh();
        }
    },

    /**
     * Получить exp access-токена из куки (декодировать JWT payload).
     */
    _getAccessExp() {
        try {
            const cookies = document.cookie.split('; ');
            const cookie = cookies.find(c => c.startsWith('access_token_cookie='));
            if (!cookie) return null;

            const token = cookie.split('=').slice(1).join('=');   // на случай '=' в токене
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            // Base64url → JSON
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(atob(base64));
            return payload.exp || null;
        } catch (e) {
            console.warn('[API] Не удалось декодировать access exp:', e);
            return null;
        }
    },

    /**
     * Попробовать refresh access-токена.
     */
    async _tryRefresh() {
        // Уже идёт refresh — не дублировать
        if (window._refreshing && window._refreshPromise) {
            return await window._refreshPromise;
        }

        window._refreshing = true;
        window._refreshPromise = (async () => {
            try {
                const response = await fetch('/api/v1/auth/refresh', {
                    method: 'POST',
                    credentials: 'include',
                });
                return response.ok;
            } catch (e) {
                console.warn('[API] Refresh failed:', e);
                return false;
            } finally {
                window._refreshing = false;
                window._refreshPromise = null;
            }
        })();

        return await window._refreshPromise;
    },

    /**
     * Редирект на login (один раз).
     */
    _redirectToLogin() {
        if (window._redirectingToLogin) return;
        window._redirectingToLogin = true;

        // Сохранить текущий путь для возврата после логина
        try {
            const returnPath = window.location.pathname + window.location.search;
            if (returnPath !== '/login' && !returnPath.startsWith('/login')) {
                sessionStorage.setItem('karkas_return_to', returnPath);
            }
        } catch (e) {}

        window.location.href = '/login';
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