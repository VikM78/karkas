#!/usr/bin/env python3
# backend/app.py - Точка входа

import sys
from pathlib import Path

# Добавляем корень в PYTHONPATH
ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from flask import Flask, render_template, jsonify, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate

from backend.config import config
from backend.models import db
from backend.middleware import register_middleware
from backend.api.v1 import register_blueprints


def create_app():
    """Фабрика приложений"""
    app = Flask(
        __name__,
        static_folder='static',
        template_folder='templates',
        static_url_path='/static'
    )

    # ===== Конфигурация =====
    app.config['SECRET_KEY'] = config.SECRET_KEY
    app.config['SQLALCHEMY_DATABASE_URI'] = config.sqlalchemy_dsn
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET_KEY'] = config.JWT_SECRET_KEY
    app.config['JWT_TOKEN_LOCATION'] = ['cookies', 'headers']
    app.config['JWT_COOKIE_SECURE'] = False
    app.config['JWT_COOKIE_CSRF_PROTECT'] = False
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = config.JWT_ACCESS_TOKEN_EXPIRES

    # ===== Расширения =====
    CORS(
        app,
        origins=config.CORS_ORIGINS,
        supports_credentials=True,
        allow_headers=['Content-Type', 'Authorization'],
        expose_headers=['Content-Type', 'Set-Cookie']
    )
    JWTManager(app)
    db.init_app(app)
    Migrate(app, db)

    # ===== Middleware =====
    register_middleware(app)

    # ===== API =====
    register_blueprints(app)

    # ===== Страницы =====
    @app.route('/login')
    def login_page():
        """Страница входа"""
        return render_template('auth/login.html')

    @app.route('/')
    def index():
        """Главная страница (дашборд)"""
        return render_template('admin/dashboard.html')

    @app.route('/favicon.ico')
    def favicon():
        return send_from_directory('static', 'favicon.ico')

    # ===== Страницы приложения =====
    @app.route('/app/manufacturers')
    def app_manufacturers():
        return render_template('admin/manufacturers.html')

    @app.route('/app/suppliers')
    def app_suppliers():
        return render_template('admin/suppliers.html')

    @app.route('/app/products')
    def app_products():
        return render_template('admin/products.html')

    @app.route('/app/categories')
    def app_categories():
        return render_template('admin/categories.html')

    @app.route('/app/cubes')
    def app_cubes():
        return render_template('admin/cubes.html')

    @app.route('/app/constructor')
    def app_constructor():
        return render_template('admin/constructor.html')

    @app.route('/app/specifications')
    def app_specifications():
        return render_template('admin/specifications.html')

    @app.route('/app/import')
    def app_import():
        return render_template('admin/import.html')

    @app.route('/app/purchase-orders')
    def app_purchase_orders():
        return render_template('admin/purchase_orders.html')

    @app.route('/app/prices')
    def app_prices():
        return render_template('admin/prices.html')

    @app.route('/app/inventory')
    def app_inventory():
        return render_template('admin/inventory.html')

    @app.route('/app/movements')
    def app_movements():
        return render_template('admin/movements.html')

    @app.route('/app/inventory-count')
    def app_inventory_count():
        return render_template('admin/inventory_count.html')

    @app.route('/app/analytics')
    def app_analytics():
        return render_template('admin/analytics.html')

    @app.route('/app/offers')
    def app_offers():
        return render_template('admin/offers.html')

    @app.route('/app/users')
    def app_users():
        return render_template('admin/users.html')

    @app.route('/app/settings')
    def app_settings():
        return render_template('admin/settings.html')

    @app.route('/app/audit')
    def app_audit():
        return render_template('admin/audit.html')

    @app.route('/app/profile')
    def app_profile():
        return render_template('admin/profile.html')

    # ===== Обработчики ошибок =====
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Not found'}), 404

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({'error': 'Internal server error'}), 500

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(
        host=config.HOST,
        port=config.PORT,
        debug=config.DEBUG
    )