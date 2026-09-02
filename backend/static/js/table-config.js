// admin/static/table-config.js - конфигурация таблиц

const TABLE_CONFIGS = {};

// ============================================================
//  ЗАГРУЗКА СХЕМЫ ИЗ БД
// ============================================================

async function loadTableSchema(tableKey) {
    try {
        if (tableKey === 'manufacturers') {
            const cacheKey = `table_settings_${tableKey}`;
            localStorage.removeItem(cacheKey);
            console.log('🗑️ Кеш настроек очищен для:', tableKey);
        }
        
        const response = await fetch(`/api/v1/tables/${tableKey}/schema`, {
            credentials: 'include',
            cache: 'no-cache'
        });
        if (!response.ok) {
            throw new Error(`Ошибка загрузки схемы: ${response.status}`);
        }
        const data = await response.json();
        TABLE_CONFIGS[tableKey] = data;
        console.log('✅ Схема загружена:', tableKey);
        return data;
    } catch (error) {
        console.error('❌ Ошибка загрузки схемы:', error);
        return null;
    }
}

function getTableConfig(tableKey) {
    return TABLE_CONFIGS[tableKey] || null;
}

function getDefaultColumnSettings(tableKey) {
    const config = getTableConfig(tableKey);
    if (!config) return null;
    return config.default_settings || {};
}

function loadTableSettings(tableKey) {
    const storageKey = `table_settings_${tableKey}`;
    const defaults = getDefaultColumnSettings(tableKey);
    if (!defaults) return null;
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                visible: parsed.visible || defaults.visible || [],
                widths: { ...defaults.widths, ...parsed.widths },
                labels: { ...defaults.labels, ...parsed.labels },
                order: parsed.order || defaults.order || []
            };
        }
    } catch (e) {}
    return defaults;
}

function saveTableSettings(tableKey, settings) {
    const storageKey = `table_settings_${tableKey}`;
    try {
        localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch (e) {}
}

function getVisibleColumns(tableKey, settings) {
    const config = getTableConfig(tableKey);
    if (!config) return [];
    const columns = config.columns || [];
    const visible = settings.visible || [];
    return columns.filter(col => visible.includes(col.key) || col.fixed);
}

function getColumnByKey(tableKey, key) {
    const config = getTableConfig(tableKey);
    if (!config) return null;
    return config.columns.find(c => c.key === key);
}

// Делаем функции глобальными
window.loadTableSchema = loadTableSchema;
window.getTableConfig = getTableConfig;
window.getDefaultColumnSettings = getDefaultColumnSettings;
window.loadTableSettings = loadTableSettings;
window.saveTableSettings = saveTableSettings;
window.getVisibleColumns = getVisibleColumns;
window.getColumnByKey = getColumnByKey;
window.TABLE_CONFIGS = TABLE_CONFIGS;