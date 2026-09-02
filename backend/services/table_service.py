from backend.models import db, Table, TableColumn, ColumnValue, UserTableSetting, Manufacturer
from datetime import datetime


class TableService:
    """Сервис для работы с таблицами и их метаданными"""

    @staticmethod
    def get_table_by_key(table_key):
        """Получить таблицу по ключу"""
        return Table.query.filter_by(table_key=table_key, is_active=True).first()

    @staticmethod
    def get_table_schema(table_key, user_id=None):
        """Получить полную схему таблицы"""
        table = TableService.get_table_by_key(table_key)
        if not table:
            return None

        columns = table.columns.filter_by(is_visible=True).all()

        user_settings = None
        if user_id:
            user_settings = UserTableSetting.query.filter_by(
                user_id=user_id, table_id=table.id
            ).first()

        result = {
            'table': table.to_dict(),
            'columns': [],
            'settings': user_settings.settings if user_settings else {},
            'default_settings': {
                'visible': [col.column_key for col in columns],
                'widths': {col.column_key: col.default_width for col in columns},
                'labels': {col.column_key: col.column_label for col in columns},
                'order': [col.column_key for col in columns]
            }
        }

        for col in columns:
            col_data = col.to_dict(include_values=True)
            result['columns'].append(col_data)

        return result

    @staticmethod
    def get_table_data(table_key, user_id=None, params=None):
        """Получить данные таблицы с учётом настроек пользователя"""
        table = TableService.get_table_by_key(table_key)
        if not table:
            return None

        params = params or {}
        page = params.get('page', 1)
        per_page = params.get('per_page', 50)
        search = params.get('search', '')
        filters = params.get('filters', {})
        sort = params.get('sort', {})
        sort_key = sort.get('key', 'id')
        sort_direction = sort.get('direction', 'asc')

        # Для manufacturers используем модель Manufacturer
        model = Manufacturer
        query = model.query

        # Поиск
        if search:
            search_columns = table.columns.filter_by(is_filterable=True).all()
            if search_columns:
                conditions = []
                for col in search_columns:
                    if hasattr(model, col.column_key):
                        conditions.append(
                            getattr(model, col.column_key).ilike(f'%{search}%')
                        )
                if conditions:
                    from sqlalchemy import or_
                    query = query.filter(or_(*conditions))

        # Фильтры по статусу
        if filters.get('status'):
            query = query.filter(Manufacturer.status.in_(filters['status']))

        # Фильтры по столбцам
        for key, values in filters.items():
            if key != 'status' and hasattr(model, key) and values:
                query = query.filter(getattr(model, key).in_(values))

        # Сортировка
        if hasattr(model, sort_key):
            if sort_direction == 'desc':
                query = query.order_by(getattr(model, sort_key).desc())
            else:
                query = query.order_by(getattr(model, sort_key).asc())
        else:
            query = query.order_by(model.id)

        # Пагинация
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        data = []
        for item in paginated.items:
            row = item.to_dict()
            # Добавляем отформатированные значения для статусов
            for col in table.columns.all():
                if col.column_type and col.column_type.type_key == 'status':
                    mapping = col.get_value_mapping(row.get(col.column_key))
                    if mapping:
                        row[f'{col.column_key}_formatted'] = {
                            'label': mapping.value_label,
                            'color': mapping.value_color,
                            'icon': mapping.value_icon
                        }
            data.append(row)

        return {
            'data': data,
            'meta': {
                'total': paginated.total,
                'page': paginated.page,
                'per_page': paginated.per_page,
                'pages': paginated.pages
            }
        }

    @staticmethod
    def save_user_settings(table_key, user_id, settings):
        """Сохранить настройки пользователя для таблицы"""
        table = TableService.get_table_by_key(table_key)
        if not table:
            return None

        user_setting = UserTableSetting.query.filter_by(
            user_id=user_id, table_id=table.id
        ).first()

        if user_setting:
            user_setting.settings = settings
            user_setting.updated_at = datetime.utcnow()
        else:
            user_setting = UserTableSetting(
                user_id=user_id,
                table_id=table.id,
                settings=settings
            )
            db.session.add(user_setting)

        db.session.commit()
        return user_setting.settings

    @staticmethod
    def get_user_settings(table_key, user_id):
        """Получить настройки пользователя для таблицы"""
        table = TableService.get_table_by_key(table_key)
        if not table:
            return None

        user_setting = UserTableSetting.query.filter_by(
            user_id=user_id, table_id=table.id
        ).first()

        if user_setting:
            return user_setting.settings

        columns = table.columns.filter_by(is_visible=True).all()
        return {
            'visible': [col.column_key for col in columns],
            'widths': {col.column_key: col.default_width for col in columns},
            'labels': {col.column_key: col.column_label for col in columns},
            'order': [col.column_key for col in columns],
            'filters': {},
            'sort': {'key': 'id', 'direction': 'asc'}
        }