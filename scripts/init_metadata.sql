-- ============================================================
-- СКРИПТ СОЗДАНИЯ ТАБЛИЦ МЕТАДАННЫХ
-- ============================================================

-- 1. Таблица: tables (регистрация таблиц)
DROP TABLE IF EXISTS tables CASCADE;
CREATE TABLE tables (
    id SERIAL PRIMARY KEY,
    table_key VARCHAR(100) UNIQUE NOT NULL,
    table_name VARCHAR(200) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    model_name VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Таблица: column_types (типы столбцов)
DROP TABLE IF EXISTS column_types CASCADE;
CREATE TABLE column_types (
    id SERIAL PRIMARY KEY,
    type_key VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) DEFAULT 'basic',
    format_template VARCHAR(200),
    is_numeric BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Таблица: table_columns (столбцы таблиц)
DROP TABLE IF EXISTS table_columns CASCADE;
CREATE TABLE table_columns (
    id SERIAL PRIMARY KEY,
    table_id INTEGER REFERENCES tables(id) ON DELETE CASCADE,
    column_key VARCHAR(100) NOT NULL,
    column_label VARCHAR(200) NOT NULL,
    column_type_id INTEGER REFERENCES column_types(id),
    is_visible BOOLEAN DEFAULT TRUE,
    is_sortable BOOLEAN DEFAULT TRUE,
    is_filterable BOOLEAN DEFAULT TRUE,
    default_width INTEGER DEFAULT 150,
    min_width INTEGER DEFAULT 50,
    max_width INTEGER DEFAULT 500,
    sort_order INTEGER DEFAULT 0,
    is_fixed BOOLEAN DEFAULT FALSE,
    is_row_number BOOLEAN DEFAULT FALSE,
    is_editable BOOLEAN DEFAULT TRUE,
    is_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(table_id, column_key)
);

-- 4. Таблица: column_value_mappings (справочники для столбцов)
DROP TABLE IF EXISTS column_value_mappings CASCADE;
CREATE TABLE column_value_mappings (
    id SERIAL PRIMARY KEY,
    column_id INTEGER REFERENCES table_columns(id) ON DELETE CASCADE,
    value_key VARCHAR(100) NOT NULL,
    value_label VARCHAR(200) NOT NULL,
    value_color VARCHAR(20),
    value_icon VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(column_id, value_key)
);

-- 5. Таблица: user_table_settings (настройки пользователя)
DROP TABLE IF EXISTS user_table_settings CASCADE;
CREATE TABLE user_table_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    table_id INTEGER REFERENCES tables(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, table_id)
);

-- ============================================================
-- ЗАПОЛНЕНИЕ НАЧАЛЬНЫХ ДАННЫХ
-- ============================================================

-- 1. Типы столбцов
INSERT INTO column_types (type_key, display_name, category, format_template, is_numeric, sort_order) VALUES
('string', 'Текст', 'basic', NULL, FALSE, 10),
('text', 'Длинный текст', 'basic', NULL, FALSE, 20),
('int', 'Целое число', 'numeric', NULL, TRUE, 30),
('numeric', 'Число', 'numeric', NULL, TRUE, 40),
('currency', 'Денежный', 'numeric', '{value} ₽', TRUE, 50),
('percent', 'Процентный', 'numeric', '{value}%', TRUE, 60),
('boolean', 'Да/Нет', 'basic', NULL, FALSE, 70),
('date', 'Дата', 'date', 'DD.MM.YYYY', FALSE, 80),
('datetime', 'Дата+время', 'date', 'DD.MM.YYYY HH:MM', FALSE, 90),
('status', 'Статус', 'reference', NULL, FALSE, 100),
('foreign_key', 'Ссылка', 'reference', NULL, FALSE, 110),
('email', 'Email', 'contact', 'mailto:{value}', FALSE, 120),
('phone', 'Телефон', 'contact', '+7 {value}', FALSE, 130),
('url', 'Ссылка', 'contact', '{value}', FALSE, 140),
('row_number', 'Номер строки', 'system', NULL, FALSE, 150);

-- 2. Таблица manufacturers
INSERT INTO tables (table_key, table_name, description, icon, model_name) VALUES
('manufacturers', 'Производители', 'Справочник производителей', 'bi-tags', 'Manufacturer');

-- 3. Столбцы для таблицы manufacturers
WITH
    t AS (SELECT id FROM tables WHERE table_key = 'manufacturers'),
    string_t AS (SELECT id FROM column_types WHERE type_key = 'string'),
    status_t AS (SELECT id FROM column_types WHERE type_key = 'status'),
    date_t AS (SELECT id FROM column_types WHERE type_key = 'datetime'),
    row_t AS (SELECT id FROM column_types WHERE type_key = 'row_number')
INSERT INTO table_columns (table_id, column_key, column_label, column_type_id, is_visible, is_sortable, is_filterable, default_width, sort_order, is_fixed, is_row_number)
SELECT
    t.id,
    'row', '#', row_t.id, TRUE, FALSE, FALSE, 45, 0, TRUE, TRUE
FROM t, row_t
UNION ALL
SELECT
    t.id,
    'id', 'ID', string_t.id, FALSE, TRUE, TRUE, 60, 1, TRUE, FALSE
FROM t, string_t
UNION ALL
SELECT
    t.id,
    'name', 'Наименование', string_t.id, TRUE, TRUE, TRUE, 250, 2, FALSE, FALSE
FROM t, string_t
UNION ALL
SELECT
    t.id,
    'status', 'Статус', status_t.id, TRUE, TRUE, TRUE, 100, 3, TRUE, FALSE
FROM t, status_t
UNION ALL
SELECT
    t.id,
    'comment', 'Комментарий', string_t.id, TRUE, FALSE, TRUE, 200, 4, FALSE, FALSE
FROM t, string_t
UNION ALL
SELECT
    t.id,
    'created_at', 'Дата создания', date_t.id, TRUE, TRUE, TRUE, 160, 5, FALSE, FALSE
FROM t, date_t;

-- 4. Значения для статуса
WITH
    t AS (SELECT id FROM tables WHERE table_key = 'manufacturers'),
    c AS (SELECT id FROM table_columns WHERE table_id = (SELECT id FROM t) AND column_key = 'status')
INSERT INTO column_value_mappings (column_id, value_key, value_label, value_color, value_icon, sort_order)
SELECT
    c.id, 'active', 'Активен', '#059669', 'bi-check-circle', 1
FROM c
UNION ALL
SELECT
    c.id, 'hidden', 'Скрыт', '#6b7280', 'bi-eye-slash', 2
FROM c
UNION ALL
SELECT
    c.id, 'deleted', 'Удалён', '#dc2626', 'bi-trash', 3
FROM c
UNION ALL
SELECT
    c.id, 'archived', 'Архив', '#d97706', 'bi-archive', 4
FROM c;

-- Проверка
SELECT '✅ Метаданные созданы!' as status;