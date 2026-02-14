import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:crypto/crypto.dart';
import 'cache_service.dart';

class AuthService extends ChangeNotifier {
  static const _tokenKey = 'access_token';
  static const _refreshKey = 'refresh_token';
  static const _userKey = 'user_data';
  static const _baseUrlKey = 'api_base_url';
  static const String defaultBaseUrl = 'http://10.0.2.2:5000/api/v1';

  final CacheService _cache = CacheService();

  String? _accessToken;
  String? _refreshToken;
  Map<String, dynamic>? _user;
  String _baseUrl = defaultBaseUrl;
  bool _isLoading = true;
  bool _isOfflineSession = false;

  String? get accessToken => _accessToken;
  Map<String, dynamic>? get user => _user;
  bool get isAuthenticated => _accessToken != null && _user != null;
  bool get isLoading => _isLoading;
  String get baseUrl => _baseUrl;
  bool get isOfflineSession => _isOfflineSession;

  String _hashPassword(String password) {
    return sha256.convert(utf8.encode(password)).toString();
  }

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _accessToken = prefs.getString(_tokenKey);
    _refreshToken = prefs.getString(_refreshKey);
    _baseUrl = prefs.getString(_baseUrlKey) ?? defaultBaseUrl;
    final userData = prefs.getString(_userKey);
    if (userData != null) {
      _user = jsonDecode(userData);
    }

    if (_accessToken != null) {
      try {
        await fetchProfile();
      } catch (_) {
        if (_refreshToken != null) {
          try {
            await refreshAccessToken();
            await fetchProfile();
          } catch (_) {
            // Offline — keep cached session alive
            if (_user != null) {
              _isOfflineSession = true;
            } else {
              await _clearTokens();
            }
          }
        } else {
          if (_user == null) await _clearTokens();
          _isOfflineSession = _user != null;
        }
      }
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<void> setBaseUrl(String url) async {
    _baseUrl = url;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_baseUrlKey, url);
    notifyListeners();
  }

  Map<String, String> _authHeaders() => {
        'Content-Type': 'application/json',
        if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
      };

  /// Login — tries online first, falls back to cached credentials if offline
  Future<void> login(String email, String password, {required bool isOnline}) async {
    if (isOnline) {
      await _onlineLogin(email, password);
    } else {
      await _offlineLogin(email, password);
    }
  }

  Future<void> _onlineLogin(String email, String password) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/auth/user/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode != 200 || body['success'] != true) {
      throw Exception(body['message'] ?? 'Login failed');
    }
    _isOfflineSession = false;
    await _saveAuthData(body['data']);

    // Cache credentials for offline use
    await _cache.cacheAuthData(
      email: email,
      passwordHash: _hashPassword(password),
      userData: _user!,
      accessToken: _accessToken!,
      refreshToken: _refreshToken!,
    );
  }

  Future<void> _offlineLogin(String email, String password) async {
    final cached = await _cache.getCachedAuth(email);
    if (cached == null) {
      throw Exception('No cached credentials. Connect to internet to sign in.');
    }

    final inputHash = _hashPassword(password);
    if (inputHash != cached['password_hash']) {
      throw Exception('Invalid credentials');
    }

    _user = cached['user_data'] as Map<String, dynamic>;
    _accessToken = cached['access_token'] as String;
    _refreshToken = cached['refresh_token'] as String;
    _isOfflineSession = true;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, _accessToken!);
    await prefs.setString(_refreshKey, _refreshToken!);
    await prefs.setString(_userKey, jsonEncode(_user));
    notifyListeners();
  }

  /// Register always requires internet
  Future<void> register(String fullName, String email, String password,
      {String? phone}) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/auth/user/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'full_name': fullName,
        'email': email,
        'password': password,
        if (phone != null && phone.isNotEmpty) 'phone_number': phone,
      }),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode != 201 || body['success'] != true) {
      throw Exception(body['message'] ?? 'Registration failed');
    }
    await _saveAuthData(body['data']);

    // Cache for future offline login
    await _cache.cacheAuthData(
      email: email,
      passwordHash: _hashPassword(password),
      userData: _user!,
      accessToken: _accessToken!,
      refreshToken: _refreshToken!,
    );
  }

  Future<void> fetchProfile() async {
    final response = await http.get(
      Uri.parse('$_baseUrl/auth/user/me'),
      headers: _authHeaders(),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode == 200 && body['success'] == true) {
      _user = body['data'];
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_userKey, jsonEncode(_user));
      notifyListeners();
    } else {
      throw Exception('Failed to fetch profile');
    }
  }

  Future<void> updateProfile({String? fullName, String? phone}) async {
    final response = await http.put(
      Uri.parse('$_baseUrl/auth/user/me'),
      headers: _authHeaders(),
      body: jsonEncode({
        if (fullName != null) 'full_name': fullName,
        if (phone != null) 'phone_number': phone,
      }),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode == 200 && body['success'] == true) {
      await fetchProfile();
    } else {
      throw Exception(body['message'] ?? 'Update failed');
    }
  }

  Future<void> refreshAccessToken() async {
    final response = await http.post(
      Uri.parse('$_baseUrl/auth/refresh'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'refreshToken': _refreshToken}),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode == 200 && body['success'] == true) {
      _accessToken = body['data']['accessToken'];
      _refreshToken = body['data']['refreshToken'];
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_tokenKey, _accessToken!);
      await prefs.setString(_refreshKey, _refreshToken!);
    } else {
      throw Exception('Token refresh failed');
    }
  }

  Future<void> logout() async {
    try {
      await http.post(
        Uri.parse('$_baseUrl/auth/logout'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': _refreshToken}),
      );
    } catch (_) {}
    _isOfflineSession = false;
    await _clearTokens();
  }

  Future<void> _saveAuthData(Map<String, dynamic> data) async {
    _accessToken = data['accessToken'];
    _refreshToken = data['refreshToken'];
    _user = data['user'];
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, _accessToken!);
    await prefs.setString(_refreshKey, _refreshToken!);
    await prefs.setString(_userKey, jsonEncode(_user));
    notifyListeners();
  }

  Future<void> _clearTokens() async {
    _accessToken = null;
    _refreshToken = null;
    _user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_refreshKey);
    await prefs.remove(_userKey);
    notifyListeners();
  }
}
