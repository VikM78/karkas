-- ============================================================
-- ОБНОВЛЕНИЕ МЕТАДАННЫХ ДЛЯ УНИВЕРСАЛЬНОЙ ТАБЛИЦЫ
-- Добавляем width, min_width, max_width
-- ============================================================

-- 1. Добавляем колонки в table_columns (если их нет)
ALTER TABLE table_columns ADD COLUMN IF NOT EXISTS width VARCHAR(20) DEFAULT 'auto';
ALTER TABLE table_columns ADD COLUMN IF NOT EXISTS min_width VARCHAR(20);
ALTER TABLE table_columns ADD COLUMN IF NOT EXISTS max_width VARCHAR(20);

-- 2. Обновляем данные для manufacturers
DO $$
DECLARE
    v_table_id INTEGER;
BEGIN
    SELECT id INTO v_table_id FROM tables WHERE table_key = 'manufacturers';
    
    -- row (#)
    UPDATE table_columns 
    SET width = '1%', min_width = '4.5rem', max_width = '5.5rem'
    WHERE table_id = v_table_id AND column_key = 'row';
    
    -- status
    UPDATE table_columns 
    SET width = '1%', min_width = '2.5rem', max_width = '3.5rem'
    WHERE table_id = v_table_id AND column_key = 'status';
    
    -- name (авто-столбец)
    UPDATE table_columns 
    SET width = '99%', min_width = '12rem', max_width = NULL
    WHERE table_id = v_table_id AND column_key = 'name';
    
    -- created_at
    UPDATE table_columns 
    SET width = '1%', min_width = '12ch', max_width = '16ch'
    WHERE table_id = v_table_id AND column_key = 'created_at';
    
    -- comment
    UPDATE table_columns 
    SET width = '99%', min_width = '8rem', max_width = NULL
    WHERE table_id = v_table_id AND column_key = 'comment';
    
    -- id
    UPDATE table_columns 
    SET width = 'auto', min_width = '5ch', max_width = '8ch'
    WHERE table_id = v_table_id AND column_key = 'id';
    
    RAISE NOTICE '✅ Метаданные обновлены для manufacturers';
END $$;

-- 3. Проверка
SELECT column_key, width, min_width, max_width
FROM table_columns 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers')
ORDER BY sort_order;

-- 4. Добавляем column_type_id для column_types, если ещё нет
-- (убеждаемся, что все типы существуют)
INSERT INTO column_types (type_key, display_name, category, sort_order)
VALUES 
    ('row_number', 'Номер строки', 'system', 150),
    ('status', 'Статус', 'reference', 100),
    ('datetime', 'Дата+время', 'date', 90),
    ('date', 'Дата', 'date', 80),
    ('time', 'Время', 'date', 85),
    ('string', 'Текст', 'basic', 10),
    ('text', 'Длинный текст', 'basic', 20),
    ('email', 'Email', 'contact', 120),
    ('phone', 'Телефон', 'contact', 130),
    ('url', 'Ссылка', 'contact', 140),
    ('foreign_key', 'Ссылка', 'reference', 110),
    ('int', 'Целое число', 'numeric', 30),
    ('numeric', 'Число', 'numeric', 40),
    ('currency', 'Денежный', 'numeric', 50),
    ('percent', 'Процентный', 'numeric', 60),
    ('boolean', 'Да/Нет', 'basic', 70)
ON CONFLICT (type_key) DO UPDATE SET 
    display_name = EXCLUDED.display_name,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order;

SELECT '✅ Метаданные обновлены!' as status;