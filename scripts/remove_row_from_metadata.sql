-- ============================================================
-- УДАЛЯЕМ СТОЛБЕЦ row ИЗ МЕТАДАННЫХ
-- ============================================================

-- 1. Удаляем значения для статуса (если есть)
DELETE FROM column_value_mappings 
WHERE column_id IN (
    SELECT id FROM table_columns 
    WHERE column_key = 'row'
);

-- 2. Удаляем сам столбец row
DELETE FROM table_columns 
WHERE column_key = 'row';

-- 3. Проверка
SELECT column_key, sort_order 
FROM table_columns 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers')
ORDER BY sort_order;

SELECT '✅ Столбец row удалён из метаданных!' as status;