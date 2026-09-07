-- ============================================================
-- ДОБАВЛЯЕМ is_multiline ДЛЯ МНОГОСТРОЧНЫХ СТОЛБЦОВ
-- ============================================================

-- 1. Добавляем колонку is_multiline
ALTER TABLE table_columns ADD COLUMN IF NOT EXISTS is_multiline BOOLEAN DEFAULT FALSE;

-- 2. Для name и comment — включаем многострочный режим
UPDATE table_columns SET is_multiline = TRUE 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers') 
AND column_key IN ('name', 'comment');

-- 3. Проверка
SELECT column_key, is_multiline
FROM table_columns 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers')
ORDER BY sort_order;

SELECT '✅ is_multiline добавлен!' as status;