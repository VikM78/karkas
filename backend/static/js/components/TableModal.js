/**
 * Универсальная модалка добавления / редактирования записи.
 *
 * Использование:
 *   const modal = new TableModal({
 *       tableKey: 'manufacturers',
 *       schema: schema,
 *       onSave: () => table.reload(),
 *   });
 *   modal.openCreate();
 *   modal.openEdit(row);
 */

class TableModal {
    constructor(options) {
        this.tableKey = options.tableKey;
        this.schema = options.schema;
        this.onSave = options.onSave || function() {};

        this._container = null;
        this._mode = null;         // 'create' | 'edit'
        this._rowId = null;
        this._fields = [];         // список редактируемых столбцов
    }

    /**
     * Открыть пустую форму (создание).
     */
    openCreate() {
        this._mode = 'create';
        this._rowId = null;
        this._open({});
    }

    /**
     * Открыть форму с данными (редактирование).
     */
    openEdit(row) {
        if (!row || row.id === undefined) {
            console.warn('[TableModal] Нет row для редактирования');
            return;
        }
        this._mode = 'edit';
        this._rowId = row.id;
        this._open(row);
    }

    /**
     * Закрыть модалку.
     */
    close() {
        if (this._container) {
            this._container.remove();
            this._container = null;
        }
        //this._mode = null;
        //this._rowId = null;
		// _mode и _rowId НЕ сбрасываем — их устанавливают openCreate/openEdit
        // при каждом открытии. Сброс здесь ломает _open (он вызывает close).

        this._fields = [];
    }

    /**
     * Открыть модалку.
     */
    _open(rowData) {
        this.close();

        // Отфильтровать поля
        this._fields = this._getEditableFields();

        if (!this._fields.length) {
            alert('Нет доступных для редактирования полей');
            return;
        }

        const container = document.createElement('div');
        container.className = 'my-modal show';
        container.innerHTML = this._renderModal(rowData);

        document.body.appendChild(container);
        this._container = container;

        this._bindEvents();
    }

    /**
     * Получить редактируемые поля (по sort_order).
     */
    _getEditableFields() {
        if (!this.schema || !this.schema.columns) return [];

        const service = ['id', 'created_at', 'updated_at', 'created_by', 'updated_by',
                         'is_deleted', 'deleted_at', 'deleted_by'];

        return this.schema.columns
            .filter(c => c.editable === true && !service.includes(c.key))
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }

    /**
     * HTML модалки.
     */
    _renderModal(rowData) {
        const title = this._mode === 'create'
            ? `Добавить: ${this.schema.table.name}`
            : `Редактировать: ${this.schema.table.name}`;

        const fieldsHtml = this._fields
            .map(col => this._renderField(col, rowData[col.key]))
            .join('');

        return `
            <div class="my-modal-dialog">
                <div class="my-modal-content">
                    <div class="my-modal-header">
                        <h5 class="my-modal-title">${this._escape(title)}</h5>
                        <button type="button" class="my-btn-close" data-action="close">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                    <div class="my-modal-body">
                        <form id="table-modal-form" onsubmit="return false;">
                            ${fieldsHtml}
                        </form>
                    </div>
                    <div class="my-modal-footer">
                        <button type="button" class="my-btn my-btn-primary" data-action="save">
                            <i class="bi bi-check-lg"></i>
                            <span>Сохранить</span>
                        </button>
                        <button type="button" class="my-btn my-btn-secondary" data-action="close">
                            <span>Отмена</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * HTML одного поля по типу.
     */
    _renderField(col, value) {
        const id = `field-${col.key}`;
        const label = col.label;
        const required = col.required ? ' my-form-label-required' : '';
        const requiredAttr = col.required ? 'required' : '';
        const type = col.type;

        // Для boolean — особый layout
        if (type === 'boolean') {
            const checked = value ? 'checked' : '';
            return `
                <div class="my-form-group" data-field="${col.key}">
                    <div class="my-form-check">
                        <input type="checkbox" class="my-form-check-input"
                               id="${id}" name="${col.key}" ${checked}>
                        <label for="${id}" class="my-form-check-label">${this._escape(label)}</label>
                    </div>
                    <span class="my-form-error" data-error="${col.key}"></span>
                </div>
            `;
        }

        // Status — select
        if (type === 'status') {
            const values = col.values || [];
            const options = ['<option value="">— не задан —</option>']
                .concat(values.map(v => {
                    const selected = String(value) === String(v.key) ? 'selected' : '';
                    return `<option value="${this._escapeAttr(v.key)}" ${selected}>${this._escape(v.label)}</option>`;
                }))
                .join('');
            return `
                <div class="my-form-group" data-field="${col.key}">
                    <label for="${id}" class="my-form-label${required}">${this._escape(label)}</label>
                    <div class="my-form-select-wrapper">
                        <select id="${id}" name="${col.key}" class="my-form-select" ${requiredAttr}>
                            ${options}
                        </select>
                    </div>
                    <span class="my-form-error" data-error="${col.key}"></span>
                </div>
            `;
        }

        // Text (multiline) — textarea
        if (type === 'text' && col.is_multiline) {
            return `
                <div class="my-form-group" data-field="${col.key}">
                    <label for="${id}" class="my-form-label${required}">${this._escape(label)}</label>
                    <textarea id="${id}" name="${col.key}" class="my-form-control"
                              rows="4" ${requiredAttr}>${this._escape(value || '')}</textarea>
                    <span class="my-form-error" data-error="${col.key}"></span>
                </div>
            `;
        }

        // Text (однострочный) и string — обычный input
        if (type === 'text' || type === 'string') {
            return `
                <div class="my-form-group" data-field="${col.key}">
                    <label for="${id}" class="my-form-label${required}">${this._escape(label)}</label>
                    <input type="text" id="${id}" name="${col.key}" class="my-form-control"
                           value="${this._escapeAttr(value || '')}" ${requiredAttr}>
                    <span class="my-form-error" data-error="${col.key}"></span>
                </div>
            `;
        }

        // Остальные типы — input с атрибутом type
        const inputType = this._inputTypeFor(type);
        const step = this._stepFor(type);
        const inputValue = this._inputValueFor(type, value);

        return `
            <div class="my-form-group" data-field="${col.key}">
                <label for="${id}" class="my-form-label${required}">${this._escape(label)}</label>
                <input type="${inputType}" id="${id}" name="${col.key}" class="my-form-control"
                       value="${this._escapeAttr(inputValue)}" ${step} ${requiredAttr}>
                <span class="my-form-error" data-error="${col.key}"></span>
            </div>
        `;
    }

    _inputTypeFor(type) {
        const map = {
            'int': 'number',
            'numeric': 'number',
            'currency': 'number',
            'percent': 'number',
            'date': 'date',
            'datetime': 'datetime-local',
            'time': 'time',
            'email': 'email',
            'phone': 'tel',
            'url': 'url',
        };
        return map[type] || 'text';
    }

    _stepFor(type) {
        if (type === 'int') return 'step="1"';
        if (type === 'numeric' || type === 'currency' || type === 'percent') return 'step="0.01"';
        return '';
    }

    _inputValueFor(type, value) {
        if (value === null || value === undefined) return '';

        if (type === 'datetime') {
            // "2026-10-06T10:31:27.165501" → "2026-10-06T10:31"
            const s = String(value);
            if (s.includes('T')) {
                return s.slice(0, 16);
            }
            return s;
        }
        if (type === 'date') {
            // "2026-10-06" → "2026-10-06"
            return String(value).slice(0, 10);
        }
        return String(value);
    }

    /**
     * Привязать обработчики.
     */
    _bindEvents() {
        if (!this._container) return;

        // Закрытие
        this._container.querySelectorAll('[data-action="close"]').forEach(btn => {
            btn.addEventListener('click', () => this.close());
        });

        // Закрытие по клику на backdrop
        this._container.addEventListener('click', (e) => {
            if (e.target === this._container) {
                this.close();
            }
        });

        // Escape
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Сохранение
        this._container.querySelector('[data-action="save"]').addEventListener('click', () => {
            this._submit();
        });
    }

    /**
     * Собрать данные из формы.
     */
    _collectData() {
        const data = {};
        const form = this._container.querySelector('#table-modal-form');
        if (!form) return data;

        this._fields.forEach(col => {
            const el = form.querySelector(`[name="${col.key}"]`);
            if (!el) return;

            if (col.type === 'boolean') {
                data[col.key] = el.checked;
            } else if (col.type === 'int') {
                const v = el.value.trim();
                data[col.key] = v === '' ? null : parseInt(v, 10);
            } else if (col.type === 'numeric' || col.type === 'currency' || col.type === 'percent') {
                const v = el.value.trim();
                data[col.key] = v === '' ? null : parseFloat(v);
            } else {
                const v = el.value.trim();
                data[col.key] = v === '' ? null : v;
            }
        });

        return data;
    }

    /**
     * Отправить на сервер.
     */
    async _submit() {
        // Очистить ошибки
        this._clearErrors();

        const data = this._collectData();

        try {
            const saveBtn = this._container.querySelector('[data-action="save"]');
            if (saveBtn) {
                saveBtn.disabled = true;
                const label = saveBtn.querySelector('span');
                if (label) label.textContent = 'Сохранение...';
            }

            if (this._mode === 'create') {
                await TablesApi.createRow(this.tableKey, data);
            } else {
                await TablesApi.updateRow(this.tableKey, this._rowId, data);
            }

            this.close();
            if (this.onSave) this.onSave();
        } catch (error) {
            console.error('[TableModal] Ошибка сохранения:', error);

            // Показать ошибку
            if (error.field) {
                this._showFieldError(error.field, error.message);
            } else {
                this._showGeneralError(error.message || 'Ошибка сохранения');
            }

            // Восстановить кнопку
            const saveBtn = this._container.querySelector('[data-action="save"]');
            if (saveBtn) {
                saveBtn.disabled = false;
                const label = saveBtn.querySelector('span');
                if (label) label.textContent = 'Сохранить';
            }
        }
    }

    _clearErrors() {
        this._container.querySelectorAll('[data-error]').forEach(el => el.textContent = '');
        this._container.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
        const general = this._container.querySelector('#modal-general-error');
        if (general) general.remove();
    }

    _showFieldError(fieldKey, message) {
        const errorEl = this._container.querySelector(`[data-error="${fieldKey}"]`);
        if (errorEl) errorEl.textContent = message;

        const inputEl = this._container.querySelector(`[name="${fieldKey}"]`);
        if (inputEl) inputEl.classList.add('is-invalid');
    }

    _showGeneralError(message) {
        const body = this._container.querySelector('.my-modal-body');
        if (!body) return;

        let el = body.querySelector('#modal-general-error');
        if (!el) {
            el = document.createElement('div');
            el.id = 'modal-general-error';
            el.className = 'my-alert my-alert-danger';
            body.insertBefore(el, body.firstChild);
        }
        el.textContent = message;
    }

    _escape(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _escapeAttr(str) {
        return this._escape(str);
    }
}

window.TableModal = TableModal;