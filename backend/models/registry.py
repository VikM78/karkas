"""
Реестр моделей.

Автоматически собирает всех наследников BaseModel и предоставляет
доступ по имени таблицы (__tablename__).

Использование:
    from backend.models.registry import get_model, get_all_models

    model = get_model('manufacturers')  # → класс Manufacturer
    all_models = get_all_models()        # → {tablename: class, ...}
"""


# ============================================================
# ВНУТРЕННЕЕ СОСТОЯНИЕ
# ============================================================

_registry = None  # кеш, строится один раз


# ============================================================
# ПУБЛИЧНОЕ API
# ============================================================

def get_model(table_key):
    """
    Получить класс модели по имени таблицы.

    :param table_key: имя таблицы (__tablename__), например 'manufacturers'.
    :return: класс модели или None.
    """
    registry = _build_registry()
    return registry.get(table_key)


def get_all_models():
    """
    Получить словарь всех зарегистрированных моделей.

    :return: {tablename: class, ...}.
    """
    return dict(_build_registry())


def rebuild_registry():
    """
    Принудительно перестроить реестр.

    Полезно в тестах или при динамическом добавлении моделей.
    """
    global _registry
    _registry = None
    return _build_registry()


# ============================================================
# ВНУТРЕННЯЯ ЛОГИКА
# ============================================================

# def _build_registry():
    # """
    # Построить реестр (с кешированием).

    # Собирает всех наследников BaseModel, у которых есть __tablename__
    # и которые не абстрактны.
    # """
    # global _registry
    # if _registry is not None:
        # return _registry

    # # КРИТИЧНО: загружаем модуль backend.models полностью,
    # # чтобы все модели были импортированы до сборки реестра.
    # import backend.models  # noqa: F401

    # # Только после этого импортируем BaseModel
    # from backend.models.base import BaseModel

    # _registry = {}
    # _collect_subclasses(BaseModel, _registry)
    # return _registry

def _build_registry():
    global _registry
    if _registry is not None:
        return _registry

    import backend.models
    from backend.models.base import BaseModel

    # ОТЛАДКА
    print(f'[REGISTRY] Subclasses: {len(BaseModel.__subclasses__())}')
    for s in BaseModel.__subclasses__():
        print(f'  - {s.__name__}: {getattr(s, "__tablename__", "N/A")}')

    _registry = {}
    _collect_subclasses(BaseModel, _registry)

    print(f'[REGISTRY] Built: {len(_registry)} models')
    return _registry

def _collect_subclasses(cls, registry):
    """
    Рекурсивно собрать наследников класса.

    :param cls: родительский класс.
    :param registry: словарь {tablename: class}, куда пишем.
    """
    for sub in cls.__subclasses__():
        # Пропускаем абстрактные (только если явно помечены в самом классе)
        if sub.__dict__.get('__abstract__', False):
            _collect_subclasses(sub, registry)
            continue

        # Пропускаем без __tablename__
        tablename = getattr(sub, '__tablename__', None)
        if tablename:
            registry[tablename] = sub

        # Рекурсивно — вдруг у sub есть свои наследники
        _collect_subclasses(sub, registry)