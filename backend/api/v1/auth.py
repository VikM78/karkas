# start_my_file backend/api/v1/auth.py
from flask import Blueprint, request, jsonify, redirect, url_for
from flask_jwt_extended import (
    create_access_token, 
    set_access_cookies, 
    jwt_required, 
    get_jwt_identity, 
    unset_jwt_cookies,
    verify_jwt_in_request
)
from backend.models import User, db

bp = Blueprint('auth', __name__, url_prefix='/api/v1/auth')


@bp.route('/login', methods=['POST'])
def login():
    """Аутентификация пользователя"""
    username = request.form.get('username')
    password = request.form.get('password')

    if not username or not password:
        return jsonify({'error': 'Имя пользователя и пароль обязательны'}), 400

    user = User.query.filter_by(username=username).first()

    if not user or not user.check_password(password):
        return jsonify({'error': 'Неверное имя пользователя или пароль'}), 401

    if not user.is_active:
        return jsonify({'error': 'Пользователь заблокирован'}), 403

    # Обновляем время последнего входа
    user.last_login = db.func.now()
    db.session.commit()

    # Создаём JWT-токен
    access_token = create_access_token(identity=str(user.id))

    response = jsonify({
        'success': True,
        'user': user.to_dict(),
        'redirect': '/'
    })

    set_access_cookies(response, access_token)

    return response


@bp.route('/logout', methods=['POST'])
def logout():
    """Выход из системы"""
    response = jsonify({'success': True})
    unset_jwt_cookies(response)
    return response


@bp.route('/me', methods=['GET'])
def get_current_user():
    """Получить информацию о текущем пользователе (без обязательной JWT)"""
    try:
        verify_jwt_in_request()
        user_id = get_jwt_identity()
        user = User.query.get(int(user_id))

        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404

        return jsonify(user.to_dict())
    except Exception:
        return jsonify({'error': 'Не авторизован'}), 401
# end_my_file backend/api/v1/auth.py