from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from backend.models import User
from backend.services.menu_service import MenuService

bp = Blueprint('menu', __name__, url_prefix='/api/v1/menu')


@bp.route('/', methods=['GET'])
@jwt_required()
def get_menu():
    """Получить меню для текущего пользователя"""
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({'error': 'Пользователь не найден'}), 404

    menu = MenuService.get_user_menu(user.role)
    return jsonify({'menu': menu})


@bp.route('/settings', methods=['GET'])
@jwt_required()
def get_settings():
    """Получить настройки меню пользователя"""
    user_id = get_jwt_identity()
    settings = MenuService.get_user_settings(int(user_id))
    return jsonify({'settings': settings})


@bp.route('/settings', methods=['POST', 'PUT'])
@jwt_required()
def save_settings():
    """Сохранить настройки меню пользователя"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Нет данных'}), 400

    settings = MenuService.save_user_settings(int(user_id), data)
    return jsonify({'settings': settings})