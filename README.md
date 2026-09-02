START_FILE: README.md
# КАРКАС — Automation Construction System

Система конструирования шкафов автоматики.

## Быстрый старт

```bash
git clone https://github.com/yourusername/karkas.git
cd karkas
python -m venv venv
source venv/bin/activate      # Linux/Mac
# или
venv\Scripts\activate         # Windows
pip install -r requirements.txt
cp .env.example .env
# Отредактировать .env
createdb karkas
python scripts/init_db.py
python backend/app.py
```

## Структура проекта

```
karkas/
├── backend/
│   ├── app.py
│   ├── config.py
│   ├── models/
│   ├── schemas/
│   ├── services/
│   ├── api/
│   ├── middleware/
│   ├── core/
│   ├── static/
│   └── templates/
├── migrations/
├── scripts/
├── tests/
├── docs/
├── requirements.txt
├── .env.example
└── README.md
```

## Переменные окружения

| Переменная | Описание | Пример |
|------------|----------|--------|
| DB_HOST | Хост PostgreSQL | localhost |
| DB_PORT | Порт PostgreSQL | 5432 |
| DB_NAME | Имя базы данных | karkas |
| DB_USER | Пользователь БД | postgres |
| DB_PASSWORD | Пароль БД | your_password |
| SECRET_KEY | Секретный ключ Flask | dev-secret-key |
| JWT_SECRET_KEY | Секретный ключ JWT | jwt-secret-key |
| ADMIN_USERNAME | Логин администратора | admin |
| ADMIN_PASSWORD | Пароль администратора | admin123 |

## Разработка

### Запуск

```bash
source venv/bin/activate      # Linux/Mac
venv\Scripts\activate         # Windows
python backend/app.py
```

### Миграции

```bash
flask db migrate -m "Описание"
flask db upgrade
flask db downgrade
```

### Тесты

```bash
pytest tests/
```

## Лицензия

MIT License
END_FILE: README.md