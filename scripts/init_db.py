#!/usr/bin/env python3
# scripts/init_db.py - Инициализация базы данных

import sys
from pathlib import Path

# Добавляем корень в PYTHONPATH
ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.config import config
from backend.app import create_app
from backend.models import db, User


def init_database():
    """Инициализация БД: создание таблиц и начальных данных"""
    app = create_app()
    with app.app_context():
        print("📦 Создание таблиц...")
        db.create_all()
        print("✅ Таблицы созданы")

        # ===== Создание администратора =====
        print("👤 Создание администратора...")
        admin = User.query.filter_by(username=config.ADMIN_USERNAME).first()
        if not admin:
            admin = User(
                username=config.ADMIN_USERNAME,
                email=config.ADMIN_EMAIL,
                full_name=config.ADMIN_FULL_NAME,
                role='admin',
                is_active=True
            )
            admin.set_password(config.ADMIN_PASSWORD)
            db.session.add(admin)
            db.session.commit()
            print(f"  ✅ Создан администратор: {config.ADMIN_USERNAME}")
        else:
            print(f"  ⚠️ Администратор уже существует: {config.ADMIN_USERNAME}")

        print("""
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   ✅ Инициализация БД завершена!                                 ║
║                                                                  ║
║   👤 Администратор:                                              ║
║      Логин: {username}                                          ║
║      Пароль: {password}                                         ║
║                                                                  ║
║   🌐 Запуск приложения:                                          ║
║      python backend/app.py                                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
        """.format(
            username=config.ADMIN_USERNAME,
            password=config.ADMIN_PASSWORD
        ))


if __name__ == '__main__':
    init_database()