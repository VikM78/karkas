"""
Синхронизация метаданных таблиц с моделями.

Сканирует модели из реестра и добавляет в table_columns
отсутствующие поля — с дефолтными настройками.

Использование:
    flask sync-metadata                  # для всех таблиц
    flask sync-metadata --table manufacturers  # для одной
"""

import click
from flask import current_app

from backend.models import db, Table, TableColumn, ColumnType
from backend.models.registry import get_all_models


# ============================================================
# СЛОВАРЬ МЕТОК (человеко-читаемые названия для общих полей)
# ============================================================

FIELD_LABELS = {
    'id': 'ID',
    'name': 'Наименование',
    'comment': 'Комментарий',
    'status': 'Статус',
    'created_at': 'Дата создания',
    'updated_at': 'Дата изменения',
    'created_by': 'Кем создано',
    'updated_by': 'Кем изменено',
    'is_deleted': 'Удалён',
    'deleted_at': 'Дата удаления',
    'deleted_by': 'Кем удалено',
}

# Служебные поля — is_visible = false по умолчанию
HIDDEN_BY_DEFAULT = {
    'id', 'created_at', 'updated_at',
    'created_by', 'updated_by',
    'is_deleted', 'deleted_at', 'deleted_by',
}


# ============================================================
# МАППИНГ ТИПОВ SQLALCHEMY → column_types.type_key
# ============================================================

def _sa_type_to_type_key(sa_column):
    """Определить type_key по типу SQLAlchemy-колонки."""
    import sqlalchemy as sa

    t = sa_column.type

    # Integer
    if isinstance(t, sa.Integer):
        # ID и foreign_key-поля — int; row_number отдельно
        return 'int'

    # String
    if isinstance(t, sa.String):
        # Проверим по имени — статус, email, phone, url
        if sa_column.name == 'status':
            return 'status'
        if sa_column.name == 'email':
            return 'email'
        if sa_column.name == 'phone':
            return 'phone'
        if sa_column.name in ('url', 'website'):
            return 'url'
        return 'string'

    # Text
    if isinstance(t, sa.Text):
        return 'text'

    # Boolean
    if isinstance(t, sa.Boolean):
        return 'boolean'

    # DateTime
    if isinstance(t, sa.DateTime):
        if sa_column.name in ('created_at', 'updated_at', 'deleted_at'):
            return 'datetime'
        return 'datetime'

    # Date
    if isinstance(t, sa.Date):
        return 'date'

    # Time
    if isinstance(t, sa.Time):
        return 'time'

    # Numeric / Decimal
    if isinstance(t, sa.Numeric):
        if sa_column.name in ('price', 'amount', 'cost'):
            return 'currency'
        if sa_column.name in ('percent', 'rate'):
            return 'percent'
        return 'numeric'

    # JSON
    if isinstance(t, sa.JSON):
        return 'text'  # показываем как текст

    # Default
    return 'string'


# ============================================================
# ОСНОВНАЯ ЛОГИКА
# ============================================================

def _sync_one_table(table_key, dry_run=False):
    """
    Синхронизировать метаданные для одной таблицы.

    :return: (added_count, removed_count, skipped_count)
    """
    table = Table.query.filter_by(table_key=table_key).first()
    if not table:
        click.echo(f'  ⚠ Таблица {table_key} не найдена в tables — пропускаю')
        return 0, 0, 0

    # Модель
    models = get_all_models()
    model = models.get(table_key)
    if not model:
        click.echo(f'  ⚠ Модель для {table_key} не найдена — пропускаю')
        return 0, 0, 0

    # Существующие столбцы
    existing = {c.column_key: c for c in table.columns.all()}

    # Все колонки модели
    model_columns = {c.name: c for c in model.__table__.columns}

    # Типы столбцов — кеш
    type_cache = {ct.type_key: ct for ct in ColumnType.query.all()}

    added = 0
    skipped = 0

    # Определим текущий максимальный sort_order
    max_sort = max((c.sort_order for c in existing.values()), default=0)

    for col_name, model_col in model_columns.items():
        if col_name in existing:
            skipped += 1
            continue

        # Новый столбец — добавляем
        type_key = _sa_type_to_type_key(model_col)
        column_type = type_cache.get(type_key)

        if not column_type:
            click.echo(f'  ⚠ Тип {type_key} не найден в column_types — пропускаю {col_name}')
            continue

        max_sort += 1

        # Определяем label
        label = FIELD_LABELS.get(col_name, col_name.replace('_', ' ').capitalize())

        # Видимость
        is_visible = col_name not in HIDDEN_BY_DEFAULT

        # Тип решает дефолтные размеры/выравнивание
        default_width_px = column_type.default_width_px or 150
        min_width_px = column_type.min_width_px
        max_width_px = column_type.max_width_px

        new_col = TableColumn(
            table_id=table.id,
            column_key=col_name,
            column_label=label,
            column_type_id=column_type.id,
            is_visible=is_visible,
            is_sortable=True,
            is_filterable=True,
            is_editable=True,
            is_required=False,
            is_multiline=(type_key == 'text'),
            sort_order=max_sort,
            default_width=int(default_width_px) if default_width_px else 150,
            default_width_px=default_width_px,
            min_width_px=min_width_px,
            max_width_px=max_width_px,
            align_h=column_type.default_align_h,
            align_v=column_type.default_align_v,
        )

        if not dry_run:
            db.session.add(new_col)

        click.echo(f'  + {col_name:20} ({type_key:10}) — {label} (visible={is_visible})')
        added += 1

    return added, 0, skipped


# ============================================================
# CLI-КОМАНДА FLASK
# ============================================================

def register_commands(app):
    """Зарегистрировать команду `flask sync-metadata`."""

    @app.cli.command('sync-metadata')
    @click.option('--table', 'table_key', default=None, help='Синхронизировать только одну таблицу')
    @click.option('--dry-run', is_flag=True, help='Показать, что будет сделано, без записи')
    def sync_metadata(table_key, dry_run):
        """Синхронизировать метаданные table_columns с моделями."""
        click.echo('🔄 Синхронизация метаданных...')
        click.echo()

        if table_key:
            tables = [table_key]
        else:
            # Все таблицы, у которых есть модель и запись в tables
            all_models = get_all_models()
            tables = []
            for t in Table.query.filter_by(is_active=True).all():
                if t.table_key in all_models:
                    tables.append(t.table_key)
                else:
                    click.echo(f'  ⚠ Таблица {t.table_key} — модель не найдена, пропуск')

        total_added = 0
        total_skipped = 0

        for tk in tables:
            click.echo(f'📋 {tk}:')
            added, removed, skipped = _sync_one_table(tk, dry_run=dry_run)
            total_added += added
            total_skipped += skipped
            if added == 0:
                click.echo(f'  ✓ Всё синхронизировано ({skipped} столбцов)')
            click.echo()

        if not dry_run:
            try:
                db.session.commit()
                click.echo(f'✅ Готово: добавлено {total_added}, пропущено {total_skipped}')
            except Exception as e:
                db.session.rollback()
                click.echo(f'❌ Ошибка: {e}')
        else:
            click.echo(f'🔍 DRY-RUN: было бы добавлено {total_added}')