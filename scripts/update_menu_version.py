# start_my_file scripts/update_menu_version.py
#!/usr/bin/env python3
# scripts/update_menu_version.py - Обновление версии меню

"""
Использование:
    python scripts/update_menu_version.py

При каждом изменении структуры меню запускайте этот скрипт,
чтобы клиенты обновили кеш.
"""

import sys
from pathlib import Path
from sqlalchemy import text

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.app import create_app
from backend.models import db


def update_version():
    app = create_app()
    with app.app_context():
        # Создаём таблицу menu_metadata если её нет
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS menu_metadata (
                id SERIAL PRIMARY KEY,
                version INTEGER DEFAULT 1,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        db.session.commit()

        # Проверяем, есть ли запись
        result = db.session.execute(text("SELECT version FROM menu_metadata LIMIT 1"))
        row = result.fetchone()

        if row:
            new_version = row[0] + 1
            db.session.execute(
                text("UPDATE menu_metadata SET version = :version, updated_at = NOW()"),
                {'version': new_version}
            )
        else:
            new_version = 1
            db.session.execute(
                text("INSERT INTO menu_metadata (version, updated_at) VALUES (:version, NOW())"),
                {'version': new_version}
            )

        db.session.commit()
        print(f"✅ Версия меню обновлена до: {new_version}")


if __name__ == '__main__':
    update_version()
# end_my_file scripts/update_menu_version.py