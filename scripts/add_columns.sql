-- ============================================================
-- ДОБАВЛЕНИЕ СТОЛБЦОВ В МЕТАДАННЫЕ
-- ============================================================

-- Добавляем updated_at (дата изменения)
INSERT INTO table_columns (
    table_id, column_key, column_label, column_type_id, 
    is_visible, is_sortable, is_filterable, default_width, 
    sort_order, is_fixed, is_row_number, is_editable, is_required
)
SELECT
    (SELECT id FROM tables WHERE table_key = 'manufacturers'),
    'updated_at', 'Дата изменения', 
    (SELECT id FROM column_types WHERE type_key = 'datetime'),
    FALSE, TRUE, TRUE, 160, 7, FALSE, FALSE, FALSE, FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM table_columns 
    WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers') 
    AND column_key = 'updated_at'
);

-- Добавляем updated_by (кем изменено)
INSERT INTO table_columns (
    table_id, column_key, column_label, column_type_id, 
    is_visible, is_sortable, is_filterable, default_width, 
    sort_order, is_fixed, is_row_number, is_editable, is_required
)
SELECT
    (SELECT id FROM tables WHERE table_key = 'manufacturers'),
    'updated_by', 'Кем изменено',
    (SELECT id FROM column_types WHERE type_key = 'string'),
    FALSE, TRUE, TRUE, 120, 8, FALSE, FALSE, FALSE, FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM table_columns 
    WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers') 
    AND column_key = 'updated_by'
);

-- Проверить результат
SELECT column_key, column_label, sort_order, is_visible
FROM table_columns 
WHERE table_id = (SELECT id FROM tables WHERE table_key = 'manufacturers')
ORDER BY sort_order;