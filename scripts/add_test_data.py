#!/usr/bin/env python3
# scripts/add_test_data.py - Добавление тестовых данных

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.app import create_app
from backend.models import db
from backend.models.catalog.manufacturer import Manufacturer
from datetime import datetime


def add_test_data():
    app = create_app()
    with app.app_context():
        # Проверяем, есть ли уже данные
        count = Manufacturer.query.count()
        if count > 0:
            print(f"⚠️ В таблице уже есть {count} записей")
            return

        # Добавляем тестовые данные
        manufacturers = [
            Manufacturer(
                name='ООО Ромашка',
                status='active',
                comment='Основной поставщик',
                created_at=datetime.utcnow()
            ),
            Manufacturer(
                name='ООО Лютик',
                status='active',
                comment='Резервный поставщик',
                created_at=datetime.utcnow()
            ),
            Manufacturer(
                name='ООО Василек',
                status='hidden',
                comment='Временно не работает',
                created_at=datetime.utcnow()
            ),
            Manufacturer(
                name='ООО Одуванчик',
                status='archived',
                comment='Архивирован',
                created_at=datetime.utcnow()
            ),
            Manufacturer(
                name='ООО Пион',
                status='deleted',
                comment='Удалён',
                created_at=datetime.utcnow()
            ),
            Manufacturer(
                name='ООО Астра',
                status='active',
                comment='Новый поставщик',
                created_at=datetime.utcnow()
            ),
            Manufacturer(
                name='ООО Роза',
                status='active',
                comment='Проверенный поставщик',
                created_at=datetime.utcnow()
            ),
            Manufacturer(
                name='ООО Тюльпан',
                status='hidden',
                comment='На реконструкции',
                created_at=datetime.utcnow()
            ),
            Manufacturer(
                name='ООО Орхидея',
                status='archived',
                comment='Архив',
                created_at=datetime.utcnow()
            ),
            Manufacturer(
                name='ООО Хризантема',
                status='active',
                comment='Активный',
                created_at=datetime.utcnow()
            ),
        ]

        for m in manufacturers:
            db.session.add(m)

        db.session.commit()
        print(f"✅ Добавлено {len(manufacturers)} производителей")

        # Показываем список
        all_manufacturers = Manufacturer.query.all()
        print("\n📋 Список производителей:")
        for m in all_manufacturers:
            print(f"  {m.id}. {m.name} - {m.status} - {m.comment or '—'}")


if __name__ == '__main__':
    add_test_data()