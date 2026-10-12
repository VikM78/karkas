"""
Сервис для работы с глобальными настройками приложения.

Читает из таблицы app_settings с кешированием.
"""

from backend.models import db, AppSetting


_cache = {}


def get_setting(key, default=None):
    """Получить значение настройки (с кешем)."""
    if key in _cache:
        return _cache[key]

    setting = AppSetting.query.filter_by(key=key, is_deleted=False).first()
    value = setting.value if setting else default
    _cache[key] = value
    return value


def set_setting(key, value, description=None):
    """Сохранить значение настройки."""
    setting = AppSetting.query.filter_by(key=key, is_deleted=False).first()
    if setting:
        setting.value = str(value)
        if description:
            setting.description = description
    else:
        setting = AppSetting(
            key=key,
            value=str(value),
            description=description or '',
        )
        db.session.add(setting)

    db.session.commit()
    _cache[key] = str(value)
    return setting


def clear_cache():
    """Сбросить кеш."""
    global _cache
    _cache = {}


def get_base_font_size_px():
    """Базовый размер шрифта для FHD (px)."""
    value = get_setting('base_font_size_px', '16')
    try:
        return float(value)
    except (ValueError, TypeError):
        return 16.0