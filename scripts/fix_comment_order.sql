-- ============================================================
-- ИСПРАВЛЕНИЕ ПОРЯДКА СТОЛБЦОВ (Комментарий — последним)
-- ============================================================

-- Проверить текущий порядок
SELECT column_key, column_label, sort_order 
FROM table_columns 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers')
ORDER BY sort_order;

-- Изменить порядок: комментарий последним (sort_order = 6)
UPDATE table_columns 
SET sort_order = 6 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers') 
  AND column_key = 'comment';

-- Пересчитать порядок, если нужно
UPDATE table_columns 
SET sort_order = 1 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers') 
  AND column_key = 'row';

UPDATE table_columns 
SET sort_order = 2 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers') 
  AND column_key = 'id';

UPDATE table_columns 
SET sort_order = 3 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers') 
  AND column_key = 'name';

UPDATE table_columns 
SET sort_order = 4 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers') 
  AND column_key = 'status';

UPDATE table_columns 
SET sort_order = 5 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers') 
  AND column_key = 'created_at';

-- Проверить результат
SELECT column_key, column_label, sort_order 
FROM table_columns 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers')
ORDER BY sort_order;