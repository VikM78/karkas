/**
 * TableRenderer — чистый модуль рендеринга HTML-структуры таблицы на основе схемы метаданных.
 * Не содержит глобальных слушателей, что предотвращает утечки памяти.
 */
class TableRenderer {
    constructor() {
        this.absoluteMin = 'var(--col-absolute-min, 4ch + 1rem)';
    }

    render(schema, data, settings = {}, currentPage = 1, currentSort = { key: null, direction: null }) {
        if (!schema || !schema.columns) {
            return this._buildErrorState('Схема метаданных таблицы не загружена');
        }

        const visibleColumns = this._getVisibleColumns(schema, settings);
        
        if (!data || data.length === 0) {
            return this._buildEmptyState(visibleColumns.length || 1);
        }

        return this._buildTableHtml(visibleColumns, data, schema, settings, currentPage, currentSort);
    }

    _getVisibleColumns(schema, settings) {
        const visibleKeys = settings.visible || schema.default_settings?.visible || [];
        const order = settings.order || schema.default_settings?.order || [];
        const columns = schema.columns || [];

        let filtered = columns.filter(col => visibleKeys.includes(col.key) || col.fixed);
        
        filtered.sort((a, b) => {
            const ia = order.indexOf(a.key);
            const ib = order.indexOf(b.key);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        return filtered;
    }

    _buildTableHtml(columns, data, schema, settings, currentPage, currentSort) {
        const labels = settings.labels || schema.default_settings?.labels || {};
        
        const rowCol = {
            key: 'row',
            type: 'row_number',
            label: '#',
            width: '1%',
            min_width: '4.5rem',
            max_width: '5.5rem',
            fixed: true,
            sortable: false,
            filterable: false
        };

        const statusCol = columns.find(c => c.type === 'status');
        const restColumns = columns.filter(c => c.type !== 'status');

        const finalColumns = [rowCol];
        if (statusCol) finalColumns.push(statusCol);
        finalColumns.push(...restColumns);

        const flexibleColumns = finalColumns.filter(c => c.is_auto === true);
        const totalFlex = flexibleColumns.length;

        const columnStyles = finalColumns.map((col) => {
            let widthStyle = 'width: auto;';
            let minStyle = 'min-width: ' + (col.min_width && parseFloat(col.min_width) > 0 ? col.min_width : this.absoluteMin) + ';';
            let maxStyle = col.max_width && parseFloat(col.max_width) > 0 ? 'max-width: ' + col.max_width + ';' : '';

            if (col.key === 'row' || col.type === 'row_number' || col.type === 'status') {
                widthStyle = 'width: 1%;';
            } else if (col.is_auto === true) {
                const share = totalFlex > 0 ? (100 / totalFlex) : 100;
                widthStyle = 'width: ' + share + '%;';
            }

            return { widthStyle, minStyle, maxStyle };
        });

        let html = '<div class="table-wrap">';
        html += '<table class="table table-hover table-sm table-custom" style="width: 100%; border-collapse: separate; border-spacing: 0;">';
        
        html += '<colgroup>';
        finalColumns.forEach((col, idx) => {
            const style = columnStyles[idx];
            let colClass = col.key === 'row' ? 'col-row' : (col.type === 'status' ? 'col-status' : 'col-ellipsis');
            html += '<col data-col="' + col.key + '" class="' + colClass + '" style="' + style.widthStyle + ' ' + style.minStyle + ' ' + style.maxStyle + '">';
        });
        html += '</colgroup>';

        html += '<thead><tr>';
        finalColumns.forEach((col, idx) => {
            const isRow = col.key === 'row' || col.type === 'row_number';
            const isStatus = col.type === 'status';
            const isFixed = col.fixed || false;
            const isSortActive = currentSort && currentSort.key === col.key;
            
            let classes = [];
            if (isRow) classes.push('col-row', 'col-row-sticky');
            if (isStatus) classes.push('col-status', 'col-status-th');
            if (col.sortable) classes.push('sortable');
            if (isSortActive) classes.push('sort-active');

            const labelText = isStatus ? '' : (labels[col.key] || col.label || '');
            const stickyStyle = isRow ? 'style="z-index: 11;"' : '';

            html += '<th data-col="' + col.key + '" data-index="' + idx + '" class="' + classes.join(' ') + '" ' + stickyStyle + '>';
            html += '<div class="th-content" style="display: flex; align-items: center; gap: 0.25rem;">';
            html += '<span class="col-label" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + labelText + '</span>';
            
            if (col.sortable) {
                const arrow = currentSort.direction === 'asc' ? '↑' : '↓';
                html += '<span class="sort-indicator" style="font-size: 0.75rem; color: var(--color-primary, #4a6cf7); flex-shrink: 0; display: ' + (isSortActive ? 'inline' : 'none') + ';">' + arrow + '</span>';
            }
            if (col.filterable) {
                html += '<button class="col-btn filter-btn" data-key="' + col.key + '" style="background: none; border: none; padding: 0 2px; color: #adb5bd; cursor: pointer; font-size: 0.75rem; flex-shrink: 0;">▼</button>';
            }
            
            html += '</div>';
            if (!isFixed && idx < finalColumns.length - 1) {
                html += '<div class="resize-handle" data-index="' + idx + '" style="position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; background: transparent; z-index: 5;"></div>';
            }
            html += '</th>';
        });
        html += '</tr></thead>';

        html += '<tbody>';
        data.forEach((item, index) => {
            const statusClass = item.status ? 'status-' + item.status : '';
            const deletedClass = item.is_deleted ? 'table-deleted' : '';
            const rowNumber = (currentPage - 1) * 50 + index + 1;

            html += '<tr data-id="' + (item.id || index) + '" class="' + statusClass + ' ' + deletedClass + '">';
            
            finalColumns.forEach((col) => {
                const isRow = col.key === 'row' || col.type === 'row_number';
                const isStatus = col.type === 'status';
                const isMultiline = col.is_multiline === true;

                let cellClass = 'col-ellipsis';
                if (isRow) cellClass = 'col-row col-row-sticky';
                else if (isStatus) cellClass = 'col-status col-status-td';
                else if (isMultiline) cellClass = 'col-multiline';

                const align = isRow || isStatus ? 'center' : 'left';
                
                html += '<td class="' + cellClass + '" style="vertical-align: var(--cell-vertical-align, middle); text-align: ' + align + ';">';
                
                if (isRow) {
                    html += rowNumber;
                } else {
                    html += this._renderCellContent(item[col.key], col);
                }
                
                html += '</td>';
            });
            
            html += '</tr>';
        });
        html += '</tbody></table></div>';

        return html;
    }

    _renderCellContent(value, column) {
        if (value === null || value === undefined || value === '') return '';
        
        const type = column.type || 'string';
        const strVal = String(value);

        if (type === 'status' && column.values) {
            const valObj = column.values.find(v => v.key === value);
            if (valObj) {
                const iconMap = { 'active': '✅', 'hidden': '👁️‍🗨️', 'deleted': '🗑️', 'archived': '📦' };
                return '<span class="status-icon" data-tooltip="' + this._escapeHtml(valObj.label) + '" style="display: inline-flex; align-items: center; justify-content: center; font-size: 1.125em; width: 1.75em; height: 1.75em; cursor: default;">' + (iconMap[valObj.key] || '❓') + '</span>';
            }
            return value;
        }

        if (type === 'boolean') {
            const color = value ? 'var(--color-success)' : 'var(--text-muted)';
            return '<span class="status-icon" data-tooltip="' + (value ? 'Да' : 'Нет') + '" style="color: ' + color + '; font-size: 1.125em;">' + (value ? '✓' : '✗') + '</span>';
        }

        if (type === 'currency') {
            return '<span class="col-truncated" style="display:block; text-align:right;">' + new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value) + '</span>';
        }

        if (type === 'text' || type === 'textarea' || column.is_multiline) {
            return '<span class="col-truncated col-expandable" data-tooltip="' + this._escapeHtml(strVal) + '" data-expanded="false" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: help;" decoding-flag="1">' + this._escapeHtml(strVal) + '</span>';
        }

        return '<span class="col-truncated" data-tooltip="' + this._escapeHtml(strVal) + '" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + this._escapeHtml(strVal) + '</span>';
    }

    _escapeHtml(str) {
        return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    _buildEmptyState(colspan) {
        return '<div class="table-wrap"><table class="table table-custom"><tbody><tr><td colspan="' + colspan + '" style="text-align: center; padding: 30px 0; color: #adb5bd;">📭 Нет данных</td></tr></tbody></table></div>';
    }

    _buildErrorState(msg) {
        return '<div class="alert alert-danger m-3">⚠️ Ошибка: ' + msg + '</div>';
    }
}

export default TableRenderer;