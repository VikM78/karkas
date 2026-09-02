#!/usr/bin/env python3
# scripts/init_metadata.py - Инициализация метаданных через Python

import sys
import os
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

# Устанавливаем переменную окружения
os.environ['FLASK_APP'] = 'backend/app.py'

from backend.app import create_app
from backend.models import db
from sqlalchemy import text


def init_metadata():
    app = create_app()
    with app.app_context():
        # Читаем SQL-файл
        sql_path = Path(__file__).parent / 'init_metadata.sql'
        if not sql_path.exists():
            print(f'❌ Файл не найден: {sql_path}')
            return

        with open(sql_path, 'r', encoding='utf-8') as f:
            sql_content = f.read()

        # Разбиваем на отдельные запросы
        statements = []
        current = []
        for line in sql_content.split('\n'):
            line = line.strip()
            if line.startswith('--') or not line:
                continue
            current.append(line)
            if line.endswith(';'):
                statements.append(' '.join(current))
                current = []

        if current:
            statements.append(' '.join(current))

        # Выполняем каждый запрос
        print('📦 Выполнение SQL-скрипта...')
        success = 0
        errors = 0

        for stmt in statements:
            if not stmt:
                continue
            try:
                db.session.execute(text(stmt))
                db.session.commit()
                success += 1
                print(f'  ✅ Выполнен: {stmt[:50]}...')
            except Exception as e:
                errors += 1
                print(f'  ❌ Ошибка: {e}')
                print(f'     Запрос: {stmt[:100]}...')
                db.session.rollback()

        print(f'\n📊 Результат: {success} успешно, {errors} ошибок')

        if errors == 0:
            print('✅ Метаданные успешно созданы!')
        else:
            print('⚠️ Некоторые запросы не выполнились')


if __name__ == '__main__':
    init_metadata()