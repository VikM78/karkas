#!/usr/bin/env python3
# scripts/init_menu_data.py - Инициализация данных меню

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.app import create_app
from backend.models import db, MenuItem, MenuPermission


def init_menu_data():
    app = create_app()
    with app.app_context():
        # Проверяем, есть ли уже данные
        existing = MenuItem.query.first()
        if existing:
            print("⚠️ Данные меню уже существуют.")
            print("   Для обновления выполните в psql:")
            print("   TRUNCATE menu_permissions, menu_items RESTART IDENTITY CASCADE;")
            return

        # ============================================================
        #  ГРУППЫ
        # ============================================================
        print("📂 Создание групп...")

        groups = [
            {'menu_key': 'group_catalog', 'title': 'Справочники', 'icon': 'bi-folder', 'tooltip': 'Управление справочниками', 'is_group': True, 'group_key': 'catalog', 'group_title': 'Справочники', 'sort_order': 100},
            {'menu_key': 'group_constructor', 'title': 'Конструктор', 'icon': 'bi-puzzle', 'tooltip': 'Конструктор изделий', 'is_group': True, 'group_key': 'constructor', 'group_title': 'Конструктор', 'sort_order': 200},
            {'menu_key': 'group_purchases', 'title': 'Закупки', 'icon': 'bi-cart', 'tooltip': 'Управление закупками', 'is_group': True, 'group_key': 'purchases', 'group_title': 'Закупки', 'sort_order': 300},
            {'menu_key': 'group_warehouse', 'title': 'Склад', 'icon': 'bi-box-seam', 'tooltip': 'Складской учёт', 'is_group': True, 'group_key': 'warehouse', 'group_title': 'Склад', 'sort_order': 400},
            {'menu_key': 'group_reports', 'title': 'Отчеты', 'icon': 'bi-graph-up', 'tooltip': 'Отчёты и аналитика', 'is_group': True, 'group_key': 'reports', 'group_title': 'Отчеты', 'sort_order': 500},
            {'menu_key': 'group_system', 'title': 'Система', 'icon': 'bi-gear', 'tooltip': 'Настройки системы', 'is_group': True, 'group_key': 'system', 'group_title': 'Система', 'sort_order': 600},
        ]

        group_objs = {}
        for g in groups:
            item = MenuItem(**g)
            db.session.add(item)
            group_objs[g['group_key']] = item
        db.session.commit()
        print("  ✅ Группы созданы")

        # ============================================================
        #  ПУНКТЫ МЕНЮ
        # ============================================================
        print("📄 Создание пунктов меню...")

        items = [
            {'menu_key': 'dashboard', 'title': 'Дашборд', 'icon': 'bi-grid-1x2', 'tooltip': 'Главная страница', 'url': '/', 'sort_order': 10},

            {'menu_key': 'manufacturers', 'title': 'Производители', 'icon': 'bi-tags', 'tooltip': 'Список производителей', 'url': '/app/manufacturers', 'parent': 'group_catalog', 'sort_order': 110},
            {'menu_key': 'suppliers', 'title': 'Поставщики', 'icon': 'bi-building', 'tooltip': 'Список поставщиков', 'url': '/app/suppliers', 'parent': 'group_catalog', 'sort_order': 120},
            {'menu_key': 'products', 'title': 'Товары', 'icon': 'bi-box', 'tooltip': 'Каталог товаров', 'url': '/app/products', 'parent': 'group_catalog', 'sort_order': 130},
            {'menu_key': 'categories', 'title': 'Категории', 'icon': 'bi-folder', 'tooltip': 'Категории товаров', 'url': '/app/categories', 'parent': 'group_catalog', 'sort_order': 140},

            {'menu_key': 'cubes', 'title': 'Библиотека кубиков', 'icon': 'bi-puzzle', 'tooltip': 'Библиотека кубиков', 'url': '/app/cubes', 'parent': 'group_constructor', 'sort_order': 210},
            {'menu_key': 'constructor', 'title': 'Конструктор изделий', 'icon': 'bi-tools', 'tooltip': 'Конструктор изделий', 'url': '/app/constructor', 'parent': 'group_constructor', 'sort_order': 220},
            {'menu_key': 'specifications', 'title': 'Спецификации', 'icon': 'bi-list-ul', 'tooltip': 'Спецификации', 'url': '/app/specifications', 'parent': 'group_constructor', 'sort_order': 230},

            {'menu_key': 'import', 'title': 'Загрузка спецификаций', 'icon': 'bi-upload', 'tooltip': 'Загрузка спецификаций', 'url': '/app/import', 'parent': 'group_purchases', 'sort_order': 310},
            {'menu_key': 'purchase_orders', 'title': 'Заказы поставщикам', 'icon': 'bi-cart', 'tooltip': 'Заказы поставщикам', 'url': '/app/purchase-orders', 'parent': 'group_purchases', 'sort_order': 320},
            {'menu_key': 'prices', 'title': 'Цены и прайсы', 'icon': 'bi-currency-rub', 'tooltip': 'Цены и прайсы', 'url': '/app/prices', 'parent': 'group_purchases', 'sort_order': 330},

            {'menu_key': 'inventory', 'title': 'Номенклатура', 'icon': 'bi-box-seam', 'tooltip': 'Номенклатура', 'url': '/app/inventory', 'parent': 'group_warehouse', 'sort_order': 410},
            {'menu_key': 'movements', 'title': 'Движения', 'icon': 'bi-arrow-left-right', 'tooltip': 'Движения товаров', 'url': '/app/movements', 'parent': 'group_warehouse', 'sort_order': 420},
            {'menu_key': 'inventory_count', 'title': 'Инвентаризация', 'icon': 'bi-clipboard-check', 'tooltip': 'Инвентаризация', 'url': '/app/inventory-count', 'parent': 'group_warehouse', 'sort_order': 430},

            {'menu_key': 'analytics', 'title': 'Аналитика', 'icon': 'bi-graph-up', 'tooltip': 'Аналитика', 'url': '/app/analytics', 'parent': 'group_reports', 'sort_order': 510},
            {'menu_key': 'offers', 'title': 'Коммерческие предложения', 'icon': 'bi-file-earmark-text', 'tooltip': 'Коммерческие предложения', 'url': '/app/offers', 'parent': 'group_reports', 'sort_order': 520},

            {'menu_key': 'users', 'title': 'Пользователи', 'icon': 'bi-people', 'tooltip': 'Управление пользователями', 'url': '/app/users', 'parent': 'group_system', 'sort_order': 610},
            {'menu_key': 'settings', 'title': 'Настройки', 'icon': 'bi-gear', 'tooltip': 'Настройки системы', 'url': '/app/settings', 'parent': 'group_system', 'sort_order': 620},
            {'menu_key': 'audit', 'title': 'Журнал действий', 'icon': 'bi-clock-history', 'tooltip': 'Журнал действий', 'url': '/app/audit', 'parent': 'group_system', 'sort_order': 630},
        ]

        for item_data in items:
            item = MenuItem(
                menu_key=item_data['menu_key'],
                title=item_data['title'],
                icon=item_data.get('icon'),
                tooltip=item_data.get('tooltip'),
                url=item_data.get('url'),
                sort_order=item_data.get('sort_order', 0),
                is_active=True,
                is_group=False,
            )
            if 'parent' in item_data:
                parent = MenuItem.query.filter_by(menu_key=item_data['parent']).first()
                if parent:
                    item.parent_id = parent.id
            db.session.add(item)
        db.session.commit()
        print("  ✅ Пункты меню созданы")

        # ============================================================
        #  ПРАВА ДОСТУПА
        # ============================================================
        print("🔐 Создание прав доступа...")

        roles = ['admin', 'engineer', 'operator', 'viewer']
        all_menu_keys = ['dashboard', 'manufacturers', 'suppliers', 'products', 'categories',
                        'cubes', 'constructor', 'specifications', 'import', 'purchase_orders',
                        'prices', 'inventory', 'movements', 'inventory_count', 'analytics',
                        'offers', 'users', 'settings', 'audit']

        permissions = {
            'admin': all_menu_keys,
            'engineer': ['dashboard', 'manufacturers', 'suppliers', 'products', 'categories',
                        'cubes', 'constructor', 'specifications', 'import', 'purchase_orders',
                        'prices', 'inventory', 'movements', 'inventory_count', 'analytics',
                        'offers', 'audit'],
            'operator': ['dashboard', 'manufacturers', 'suppliers', 'products', 'categories',
                        'cubes', 'constructor', 'specifications', 'import', 'prices',
                        'inventory', 'movements', 'analytics', 'offers'],
            'viewer': ['dashboard', 'manufacturers', 'suppliers', 'products', 'categories',
                      'specifications', 'inventory', 'analytics', 'offers'],
        }

        for role in roles:
            for menu_key in all_menu_keys:
                is_allowed = menu_key in permissions.get(role, [])
                menu_item = MenuItem.query.filter_by(menu_key=menu_key).first()
                if menu_item:
                    perm = MenuPermission(
                        menu_id=menu_item.id,
                        role=role,
                        is_allowed=is_allowed
                    )
                    db.session.add(perm)
        db.session.commit()
        print("  ✅ Права созданы")

        # ============================================================
        #  ВЕРСИЯ МЕНЮ
        # ============================================================
        print("📌 Установка версии меню...")
        db.session.execute("""
            CREATE TABLE IF NOT EXISTS menu_metadata (
                id SERIAL PRIMARY KEY,
                version INTEGER DEFAULT 1,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """)
        db.session.commit()

        result = db.session.execute("SELECT version FROM menu_metadata LIMIT 1")
        row = result.fetchone()
        if row:
            new_version = row[0] + 1
            db.session.execute(
                "UPDATE menu_metadata SET version = :version, updated_at = NOW()",
                {'version': new_version}
            )
        else:
            new_version = 1
            db.session.execute(
                "INSERT INTO menu_metadata (version, updated_at) VALUES (:version, NOW())",
                {'version': new_version}
            )
        db.session.commit()
        print(f"  ✅ Версия меню: {new_version}")

        print("""
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   ✅ Данные меню инициализированы!                               ║
║                                                                  ║
║   📂 Групп: 6                                                    ║
║   📄 Пунктов: 19                                                 ║
║   🔐 Прав: 76                                                    ║
║   📌 Версия: {version}                                           ║
║                                                                  ║
║   🌐 Перезапустите приложение:                                   ║
║      python backend/app.py                                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
        """.format(version=new_version))


if __name__ == '__main__':
    init_menu_data()