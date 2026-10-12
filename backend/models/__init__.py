from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# Базовая модель
from .base import BaseModel

# Каталог (справочники)
from .catalog import User, Manufacturer

# Меню
from .menu import MenuItem, MenuPermission, UserMenuSettings

# Метаданные
from .metadata import Table, TableColumn, ColumnType, ColumnValue, ValidationRule

# Система
from .system import AppSetting

# Настройки пользователя
from .user_settings import UserTableSetting

__all__ = [
    'db',
    'BaseModel',
    'User',
    'Manufacturer',
    'MenuItem',
    'MenuPermission',
    'UserMenuSettings',
    'Table',
    'TableColumn',
    'ColumnType',
    'ColumnValue',
    'ValidationRule',
    'UserTableSetting',
    'AppSetting',
]