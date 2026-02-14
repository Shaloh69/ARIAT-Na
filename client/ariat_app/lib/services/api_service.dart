import 'dart:convert';
import 'package:http/http.dart' as http;
import 'auth_service.dart';
import 'cache_service.dart';
import 'connectivity_service.dart';

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
  final CacheService _cache;
  final ConnectivityService _connectivity;

  ApiService(this._authService, this._cache, this._connectivity,
      {String? baseUrl})
      : _baseUrl = baseUrl ?? _defaultBaseUrl;

  String get baseUrl => _baseUrl;
  set baseUrl(String url) => _baseUrl = url;
  bool get isOnline => _connectivity.isOnline;

  Map<String, String> _headers({bool auth = false}) {
    final headers = <String, String>{'Content-Type': 'application/json'};
    final t = auth ? _authService.accessToken : null;
    if (t != null) headers['Authorization'] = 'Bearer $t';
    return headers;
  }

  // Fetches with offline cache fallback for GET requests
  Future<Map<String, dynamic>> get(String path,
      {bool auth = false, Map<String, String>? query}) async {
    if (_connectivity.isOnline) {
      try {
        final uri =
            Uri.parse('$_baseUrl$path').replace(queryParameters: query);
        final response = await http.get(uri, headers: _headers(auth: auth));
        final body = _handleResponse(response);

        // Cache certain endpoints
        _cacheIfNeeded(path, query, body);
        return body;
      } catch (e) {
        // Network error — try cache
        return await _getCachedOrThrow(path, query, e);
      }
    } else {
      return await _getCachedOrThrow(path, query, null);
    }
  }

  Future<Map<String, dynamic>> post(String path,
      {Map<String, dynamic>? body, bool auth = false}) async {
    if (!_connectivity.isOnline) {
      throw ApiException('No internet connection. This action requires online access.', 0);
    }
    final uri = Uri.parse('$_baseUrl$path');
    final response = await http.post(uri,
        headers: _headers(auth: auth),
        body: body != null ? jsonEncode(body) : null);
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> put(String path,
      {Map<String, dynamic>? body, bool auth = false}) async {
    if (!_connectivity.isOnline) {
      throw ApiException('No internet connection. This action requires online access.', 0);
    }
    final uri = Uri.parse('$_baseUrl$path');
    final response = await http.put(uri,
        headers: _headers(auth: auth),
        body: body != null ? jsonEncode(body) : null);
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> delete(String path,
      {bool auth = false}) async {
    if (!_connectivity.isOnline) {
      throw ApiException('No internet connection. This action requires online access.', 0);
    }
    final uri = Uri.parse('$_baseUrl$path');
    final response =
        await http.delete(uri, headers: _headers(auth: auth));
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

  // --- Caching logic ---
  void _cacheIfNeeded(
      String path, Map<String, String>? query, Map<String, dynamic> body) {
    final data = body['data'];
    if (data == null) return;

    if (path == '/destinations' || path == '/destinations/featured') {
      if (data is List) {
        _cache.cacheDestinations(data.cast<Map<String, dynamic>>());
      }
    } else if (path == '/categories') {
      if (data is List) {
        _cache.cacheCategories(data.cast<Map<String, dynamic>>());
      }
    }
  }

  Future<Map<String, dynamic>> _getCachedOrThrow(
      String path, Map<String, String>? query, Object? originalError) async {
    if (path == '/destinations' || path == '/destinations/featured') {
      final cached = await _cache.getCachedDestinations();
      if (cached.isNotEmpty) {
        return {'success': true, 'data': cached, 'cached': true};
      }
    } else if (path == '/categories') {
      final cached = await _cache.getCachedCategories();
      if (cached.isNotEmpty) {
        return {'success': true, 'data': cached, 'cached': true};
      }
    }

    if (originalError != null) {
      if (originalError is ApiException) throw originalError;
      throw ApiException('Offline — no cached data available', 0);
    }
    throw ApiException('Offline — no cached data available', 0);
  }
}
