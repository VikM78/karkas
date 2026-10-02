"""
Исключения для CrudService и API.

Иерархия:
    CrudError (базовое)
    ├── ValidationError (400) — данные не прошли валидацию
    ├── NotFoundError (404) — запись не найдена
    ├── PermissionError (403) — нет прав
    └── ConflictError (409) — конфликт (уникальность, ссылки)
"""


class CrudError(Exception):
    """Базовое исключение CRUD-операций."""

    status = 400
    error_code = 'crud_error'

    def __init__(self, message, status=None, error_code=None):
        super().__init__(message)
        self.message = message
        if status is not None:
            self.status = status
        if error_code is not None:
            self.error_code = error_code

    def to_dict(self):
        return {
            'error': self.message,
            'error_code': self.error_code,
        }


class ValidationError(CrudError):
    """Ошибка валидации данных."""

    status = 400
    error_code = 'validation_error'

    def __init__(self, message, field=None):
        super().__init__(message)
        self.field = field

    def to_dict(self):
        result = super().to_dict()
        if self.field:
            result['field'] = self.field
        return result


class NotFoundError(CrudError):
    """Запись или таблица не найдена."""

    status = 404
    error_code = 'not_found'


class ConflictError(CrudError):
    """Конфликт: уникальность, ссылки."""

    status = 409
    error_code = 'conflict'


class PermissionDeniedError(CrudError):
    """Нет прав на операцию."""

    status = 403
    error_code = 'permission_denied'