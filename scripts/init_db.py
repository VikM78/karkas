# start_my_file scripts/init_db.py
import sys
import secrets
from pathlib import Path

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

        print("👤 Создание администратора...")
        admin = User.query.filter_by(username=config.ADMIN_USERNAME).first()
        
        password_to_show = config.ADMIN_PASSWORD
        
        if not admin:
            if not password_to_show:
                # Генерируем безопасный пароль, если он не передан в ENV
                password_to_show = secrets.token_urlsafe(12)
                print("🎲 Пароль не задан в ENV. Сгенерирован случайный безопасный пароль.")
            
            admin = User(
                username=config.ADMIN_USERNAME,
                email=config.ADMIN_EMAIL,
                full_name=config.ADMIN_FULL_NAME,
                role='admin',
                is_active=True
            )
            admin.set_password(password_to_show)
            db.session.add(admin)
            db.session.commit()
            print(f"  ✅ Создан администратор: {config.ADMIN_USERNAME}")
        else:
            print(f"  ⚠️ Администратор уже существует: {config.ADMIN_USERNAME}")
            password_to_show = "******** (Уже был создан ранее)"

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
            password=password_to_show
        ))

if __name__ == '__main__':
    init_database()
# end_my_file scripts/init_db.py
