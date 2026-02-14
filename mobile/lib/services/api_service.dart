import 'dart:convert';
import 'package:http/http.dart' as http;
import 'auth_service.dart';

class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, this.statusCode);
  @override
  String toString() => message;
}

class ApiService {
  static const String _defaultBaseUrl = 'http://10.0.2.2:5000/api/v1';
  String _baseUrl;
  final AuthService _authService;

  ApiService(this._authService, {String? baseUrl})
      : _baseUrl = baseUrl ?? _defaultBaseUrl;

  String get baseUrl => _baseUrl;
  set baseUrl(String url) => _baseUrl = url;

  Map<String, String> _headers({bool auth = false, String? token}) {
    final headers = <String, String>{'Content-Type': 'application/json'};
    final t = token ?? (auth ? _authService.accessToken : null);
    if (t != null) headers['Authorization'] = 'Bearer $t';
    return headers;
  }

  Future<Map<String, dynamic>> get(String path, {bool auth = false, Map<String, String>? query}) async {
    final uri = Uri.parse('$_baseUrl$path').replace(queryParameters: query);
    final response = await http.get(uri, headers: _headers(auth: auth));
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body, bool auth = false}) async {
    final uri = Uri.parse('$_baseUrl$path');
    final response = await http.post(uri, headers: _headers(auth: auth), body: body != null ? jsonEncode(body) : null);
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> put(String path, {Map<String, dynamic>? body, bool auth = false}) async {
    final uri = Uri.parse('$_baseUrl$path');
    final response = await http.put(uri, headers: _headers(auth: auth), body: body != null ? jsonEncode(body) : null);
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> delete(String path, {bool auth = false}) async {
    final uri = Uri.parse('$_baseUrl$path');
    final response = await http.delete(uri, headers: _headers(auth: auth));
    return _handleResponse(response);
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    }
    final message = body['message'] as String? ?? 'Request failed';
    throw ApiException(message, response.statusCode);
  }
}
