from backend.models import db, MenuItem, MenuPermission, UserMenuSettings


class MenuService:
    @staticmethod
    def get_user_menu(user_role):
        """Получить меню для пользователя по роли"""
        # Получаем все активные пункты меню
        items = MenuItem.query.filter_by(is_active=True).order_by(MenuItem.sort_order).all()

        # Получаем права для роли
        permissions = {}
        for perm in MenuPermission.query.filter_by(role=user_role, is_allowed=True).all():
            permissions[perm.menu_id] = True

        # Строим дерево меню
        result = []
        groups = {}

        for item in items:
            # Проверяем доступ
            if item.id in permissions or item.is_group:
                if item.is_group:
                    groups[item.group_key] = {
                        'key': item.group_key,
                        'title': item.group_title or item.title,
                        'is_group': True,
                        'items': []
                    }
                elif item.parent_id is None and not item.is_group:
                    # Корневые пункты
                    result.append(item.to_dict(include_children=False))
                elif item.parent_id is not None and not item.is_group:
                    # Дочерние пункты — добавляем в группы
                    parent = MenuItem.query.get(item.parent_id)
                    if parent and parent.is_group:
                        group_key = parent.group_key
                        if group_key in groups:
                            groups[group_key]['items'].append(item.to_dict(include_children=False))

        # Добавляем группы с пунктами в результат
        for group in groups.values():
            if group['items']:
                result.append(group)

        return result

    @staticmethod
    def get_user_settings(user_id):
        """Получить настройки меню пользователя"""
        settings = UserMenuSettings.query.filter_by(user_id=user_id).first()
        if settings:
            return settings.settings
        # Настройки по умолчанию
        return {
            'collapsed': False,
            'mode': 'full',  # full, icons, hidden
            'expanded_groups': []
        }

    @staticmethod
    def save_user_settings(user_id, settings):
        """Сохранить настройки меню пользователя"""
        user_settings = UserMenuSettings.query.filter_by(user_id=user_id).first()
        if user_settings:
            user_settings.settings = settings
        else:
            user_settings = UserMenuSettings(user_id=user_id, settings=settings)
            db.session.add(user_settings)
        db.session.commit()
        return user_settings.settings