from flask import Blueprint

from .auth import bp as auth_bp
from .menu import bp as menu_bp
from .tables import bp as tables_bp


def register_blueprints(app):
    """Регистрация API blueprints"""
    app.register_blueprint(auth_bp)
    app.register_blueprint(menu_bp)
    app.register_blueprint(tables_bp)
    print("✅ Все API blueprints зарегистрированы:")
    print("   - /api/v1/auth/*")
    print("   - /api/v1/menu/*")
    print("   - /api/v1/tables/*")