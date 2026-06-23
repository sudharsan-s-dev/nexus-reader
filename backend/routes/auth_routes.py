from flask import Blueprint, request, jsonify, make_response, g
import sqlite3
import random
import hashlib
import re
import datetime
import uuid
from functools import wraps
from itsdangerous import URLSafeSerializer

import os

auth_bp = Blueprint('auth', __name__)
DB_PATH = os.environ.get('DB_PATH', os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'storage', 'nexus_reader.db')))
SECRET_KEY = 'nexus-secret-key-super-secure-token-signing'
serializer = URLSafeSerializer(SECRET_KEY, salt='auth-session')

# Email validation helper
def is_valid_email(email):
    return re.match(r"[^@]+@[^@]+\.[^@]+", email)

# Login required decorator
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get('session_token')
        if not token:
            # Fallback for easier API testing
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]

        if not token:
            return jsonify({'error': 'Authentication required. No session token provided.'}), 401

        try:
            data = serializer.loads(token)
            g.user_id = data['user_id']
            g.email = data['email']
        except Exception:
            return jsonify({'error': 'Invalid or expired session. Please login again.'}), 401

        return f(*args, **kwargs)
    return decorated

@auth_bp.route('/api/auth/request-otp', methods=['POST'])
def request_otp():
    data = request.json or {}
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify({'error': 'Email is required'}), 400
    if not is_valid_email(email):
        return jsonify({'error': 'Invalid email address format'}), 400

    # Generate 6-digit numeric OTP
    otp = f"{random.randint(100000, 999999)}"
    otp_hash = hashlib.sha256(otp.encode('utf-8')).hexdigest()
    expires_at = (datetime.datetime.now() + datetime.timedelta(minutes=5)).strftime('%Y-%m-%d %H:%M:%S')

    # Save to user_otps table
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            # Clear any existing active OTPs for this email first
            cursor.execute('DELETE FROM user_otps WHERE email = ?', (email,))
            cursor.execute('''
                INSERT INTO user_otps (email, otp_hash, expires_at, is_verified)
                VALUES (?, ?, ?, 0)
            ''', (email, otp_hash, expires_at))
            conn.commit()
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

    # Simulate email sending (print to Flask console)
    print("\n" + "="*50)
    print(f"SMTP SIMULATION: Sending OTP to {email}")
    print(f"Your secure verification OTP code is: {otp}")
    print("="*50 + "\n")

    return jsonify({
        'message': 'OTP sent successfully to your email.',
        'simulation_otp': otp # Returning for automated verification workflows
    })

@auth_bp.route('/api/auth/verify-otp', methods=['POST'])
def verify_otp():
    data = request.json or {}
    email = data.get('email', '').strip().lower()
    otp = data.get('otp', '').strip()

    if not email or not otp:
        return jsonify({'error': 'Email and OTP code are required'}), 400

    otp_hash = hashlib.sha256(otp.encode('utf-8')).hexdigest()
    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    # Check OTP in database
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT expires_at, is_verified FROM user_otps 
                WHERE email = ? AND otp_hash = ? AND expires_at > ? AND is_verified = 0
            ''', (email, otp_hash, now_str))
            row = cursor.fetchone()

            if not row:
                return jsonify({'error': 'Invalid or expired OTP'}), 400

            # Mark OTP as verified/used
            cursor.execute('UPDATE user_otps SET is_verified = 1 WHERE email = ?', (email,))

            # Find or create user
            cursor.execute('SELECT user_id FROM users WHERE email = ?', (email,))
            user_row = cursor.fetchone()

            if user_row:
                user_id = user_row[0]
                cursor.execute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?', (user_id,))
            else:
                user_id = str(uuid.uuid4())
                cursor.execute('''
                    INSERT INTO users (user_id, email, created_at, last_login)
                    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ''', (user_id, email))
            conn.commit()
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

    # Generate session token
    session_data = {
        'user_id': user_id,
        'email': email,
        'created_at': now_str
    }
    token = serializer.dumps(session_data)

    # Set token in HTTP-only Cookie
    response = make_response(jsonify({
        'message': 'Authentication successful',
        'user': {
            'user_id': user_id,
            'email': email
        },
        'token': token # Optional output for bearer header validation
    }))

    # Secure HTTP-only Cookie setup
    response.set_cookie(
        'session_token',
        token,
        httponly=True,
        samesite='Lax',
        max_age=3600 * 24 # Valid for 24 hours
    )
    return response

@auth_bp.route('/api/auth/session', methods=['GET'])
def get_session():
    token = request.cookies.get('session_token')
    if not token:
        # Fallback bearer check
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]

    if not token:
        return jsonify({'authenticated': False}), 200

    try:
        data = serializer.loads(token)
        return jsonify({
            'authenticated': True,
            'user': {
                'user_id': data['user_id'],
                'email': data['email']
            }
        })
    except Exception:
        return jsonify({'authenticated': False}), 200

@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    response = make_response(jsonify({'message': 'Logged out successfully'}))
    response.delete_cookie('session_token')
    return response
