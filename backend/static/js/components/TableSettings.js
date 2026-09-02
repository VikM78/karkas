/**
 * TableSettings — настройка столбцов (видимость, ширина, порядок)
 */

class TableSettings {
    constructor() {
        this.settings = {
            visible: [],
            widths: {},
            labels: {},
            order: []
        };
        this._bindEvents();
    }

    _bindEvents() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-column-settings');
            if (btn) {
                e.preventDefault();
                this.openSettings(btn.dataset.tableKey);
            }
        });
    }

    openSettings(tableKey) {
        // Загружаем текущие настройки
        fetch(`/api/v1/tables/${tableKey}/settings`, {
            credentials: 'include'
        })
        .then(r => r.json())
        .then(settings => {
            this.settings = settings || this.settings;
            this._renderModal(tableKey);
        })
        .catch(() => {
            this._renderModal(tableKey);
        });
    }

    _renderModal(tableKey) {
        // Проверяем, есть ли уже модальное окно
        let modal = document.getElementById('columnSettingsModal');
        if (!modal) {
            modal = this._createModal();
        }

        const body = modal.querySelector('.modal-body');
        const settings = this.settings;

        // Загружаем схему для получения полного списка столбцов
        fetch(`/api/v1/tables/${tableKey}/schema`, {
            credentials: 'include'
        })
        .then(r => r.json())
        .then(schema => {
            const columns = schema.columns;
            const visible = settings.visible || schema.default_settings?.visible || [];
            const widths = settings.widths || schema.default_settings?.widths || {};
            const labels = settings.labels || schema.default_settings?.labels || {};
            const order = settings.order || schema.default_settings?.order || [];

            // Сортируем столбцы по порядку
            const sorted = [...columns].sort((a, b) => {
                const idxA = order.indexOf(a.key);
                const idxB = order.indexOf(b.key);
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });

            let html = `
                <div class="column-settings-list">
                    ${sorted.map(col => `
                        <div class="column-settings-item" data-key="${col.key}">
                            <div class="drag-handle">⠿</div>
                            <input type="checkbox" class="col-visibility" ${visible.includes(col.key) || col.fixed ? 'checked' : ''} ${col.fixed ? 'disabled' : ''}>
                            <input type="text" class="col-label" value="${labels[col.key] || col.label}" placeholder="Название">
                            <input type="number" class="col-width" value="${widths[col.key] || col.width || 150}" min="30" max="800" ${col.fixed ? 'disabled' : ''}>
                            <span class="col-width-unit">px</span>
                            ${col.fixed ? '<span class="badge bg-secondary">Фикс</span>' : ''}
                        </div>
                    `).join('')}
                </div>
            `;

            body.innerHTML = html;

            // Drag-and-drop для сортировки
            this._enableDragDrop(body);

            // Сохранение
            const saveBtn = modal.querySelector('.btn-save-settings');
            saveBtn?.addEventListener('click', () => {
                this._saveSettings(tableKey);
            });

            // Сброс
            const resetBtn = modal.querySelector('.btn-reset-settings');
            resetBtn?.addEventListener('click', () => {
                fetch(`/api/v1/tables/${tableKey}/schema`, { credentials: 'include' })
                    .then(r => r.json())
                    .then(schema => {
                        const defaults = schema.default_settings || {};
                        this.settings = {
                            visible: defaults.visible || [],
                            widths: defaults.widths || {},
                            labels: defaults.labels || {},
                            order: defaults.order || []
                        };
                        this._renderModal(tableKey);
                    });
            });

            // Показываем модальное окно
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        });
    }

    _createModal() {
        const modal = document.createElement('div');
        modal.className = 'modal fade column-settings-modal';
        modal.id = 'columnSettingsModal';
        modal.tabIndex = -1;
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">⚙️ Настройка столбцов</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body"></div>
                    <div class="modal-footer">
                        <button class="btn btn-outline-secondary btn-reset-settings">🔄 Сбросить</button>
                        <button class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        <button class="btn btn-primary btn-save-settings">💾 Сохранить</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    _enableDragDrop(container) {
        let dragItem = null;

        container.addEventListener('mousedown', (e) => {
            const handle = e.target.closest('.drag-handle');
            if (!handle) return;

            dragItem = handle.closest('.column-settings-item');
            if (!dragItem) return;

            e.preventDefault();

            const onMove = (ev) => {
                const target = document.elementFromPoint(ev.clientX, ev.clientY);
                if (!target) return;

                const targetItem = target.closest('.column-settings-item');
                if (targetItem && targetItem !== dragItem) {
                    const rect = targetItem.getBoundingClientRect();
                    if (ev.clientY > rect.top + rect.height / 2) {
                        targetItem.parentNode.insertBefore(dragItem, targetItem.nextSibling);
                    } else {
                        targetItem.parentNode.insertBefore(dragItem, targetItem);
                    }
                    dragItem.classList.add('dragging');
                }
            };

            const onUp = () => {
                if (dragItem) dragItem.classList.remove('dragging');
                dragItem = null;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    _saveSettings(tableKey) {
        const items = document.querySelectorAll('.column-settings-item');
        const visible = [];
        const widths = {};
        const labels = {};
        const order = [];

        items.forEach(item => {
            const key = item.dataset.key;
            const checkbox = item.querySelector('.col-visibility');
            const labelInput = item.querySelector('.col-label');
            const widthInput = item.querySelector('.col-width');

            if (checkbox && !checkbox.disabled && checkbox.checked) {
                visible.push(key);
            }
            if (labelInput) {
                labels[key] = labelInput.value || key;
            }
            if (widthInput) {
                widths[key] = parseInt(widthInput.value) || 150;
            }
            order.push(key);
        });

        const settings = {
            visible,
            widths,
            labels,
            order,
            filters: this.settings.filters || {},
            sort: this.settings.sort || {}
        };

        fetch(`/api/v1/tables/${tableKey}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(settings)
        })
        .then(r => r.json())
        .then(() => {
            this.settings = settings;
            const modal = document.getElementById('columnSettingsModal');
            const bsModal = bootstrap.Modal.getInstance(modal);
            if (bsModal) bsModal.hide();

            // Перезагрузить таблицу
            const event = new CustomEvent('tableSettingsChanged', {
                detail: { settings }
            });
            document.dispatchEvent(event);
        })
        .catch(err => {
            console.error('Ошибка сохранения настроек:', err);
            alert('Ошибка сохранения настроек');
        });
    }
}