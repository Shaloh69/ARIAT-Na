import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;

class AuthService extends ChangeNotifier {
  static const _tokenKey = 'access_token';
  static const _refreshKey = 'refresh_token';
  static const _userKey = 'user_data';
  static const _baseUrlKey = 'api_base_url';
  static const String defaultBaseUrl = 'http://10.0.2.2:5000/api/v1';

  String? _accessToken;
  String? _refreshToken;
  Map<String, dynamic>? _user;
  String _baseUrl = defaultBaseUrl;
  bool _isLoading = true;

  String? get accessToken => _accessToken;
  Map<String, dynamic>? get user => _user;
  bool get isAuthenticated => _accessToken != null && _user != null;
  bool get isLoading => _isLoading;
  String get baseUrl => _baseUrl;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _accessToken = prefs.getString(_tokenKey);
    _refreshToken = prefs.getString(_refreshKey);
    _baseUrl = prefs.getString(_baseUrlKey) ?? defaultBaseUrl;
    final userData = prefs.getString(_userKey);
    if (userData != null) {
      _user = jsonDecode(userData);
    }
    // Validate token
    if (_accessToken != null) {
      try {
        await fetchProfile();
      } catch (_) {
        if (_refreshToken != null) {
          try {
            await refreshAccessToken();
            await fetchProfile();
          } catch (_) {
            await _clearTokens();
          }
        } else {
          await _clearTokens();
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

  Future<void> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/auth/user/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode != 200 || body['success'] != true) {
      throw Exception(body['message'] ?? 'Login failed');
    }
    await _saveAuthData(body['data']);
  }

  Future<void> register(String fullName, String email, String password, {String? phone}) async {
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
