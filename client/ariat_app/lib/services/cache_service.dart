import 'dart:convert';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;

class CacheService {
  static Database? _db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    _db = await _initDb();
    return _db!;
  }

  Future<Database> _initDb() async {
    final dbPath = p.join(await getDatabasesPath(), 'ariat_cache.db');
    return openDatabase(
      dbPath,
      version: 2,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE destinations(
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE categories(
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE map_cache(
            cache_key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE auth_cache(
            email TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            user_data TEXT NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL
          )
        ''');
      },
    );
  }

  // --- Destinations ---
  Future<void> cacheDestinations(List<Map<String, dynamic>> destinations) async {
    final db = await database;
    final batch = db.batch();
    final now = DateTime.now().millisecondsSinceEpoch;
    for (final d in destinations) {
      batch.insert('destinations', {
        'id': d['id'] ?? '',
        'data': jsonEncode(d),
        'updated_at': now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
  }

  Future<List<Map<String, dynamic>>> getCachedDestinations() async {
    final db = await database;
    final results = await db.query('destinations', orderBy: 'updated_at DESC');
    return results.map((r) {
      return jsonDecode(r['data'] as String) as Map<String, dynamic>;
    }).toList();
  }

  Future<DateTime?> getDestinationsLastUpdated() async {
    final db = await database;
    final result = await db.rawQuery('SELECT MAX(updated_at) as max_ts FROM destinations');
    final ts = result.first['max_ts'] as int?;
    if (ts == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(ts);
  }

  // --- Categories ---
  Future<void> cacheCategories(List<Map<String, dynamic>> categories) async {
    final db = await database;
    final batch = db.batch();
    final now = DateTime.now().millisecondsSinceEpoch;
    for (final c in categories) {
      batch.insert('categories', {
        'id': c['id'] ?? '',
        'data': jsonEncode(c),
        'updated_at': now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
  }

  Future<List<Map<String, dynamic>>> getCachedCategories() async {
    final db = await database;
    final results = await db.query('categories', orderBy: 'updated_at DESC');
    return results.map((r) {
      return jsonDecode(r['data'] as String) as Map<String, dynamic>;
    }).toList();
  }

  // --- Map data ---
  Future<void> cacheMapData(String key, Map<String, dynamic> data) async {
    final db = await database;
    await db.insert('map_cache', {
      'cache_key': key,
      'data': jsonEncode(data),
      'updated_at': DateTime.now().millisecondsSinceEpoch,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<Map<String, dynamic>?> getCachedMapData(String key) async {
    final db = await database;
    final results = await db.query('map_cache', where: 'cache_key = ?', whereArgs: [key]);
    if (results.isEmpty) return null;
    return jsonDecode(results.first['data'] as String) as Map<String, dynamic>;
  }

  Future<DateTime?> getMapDataLastUpdated(String key) async {
    final db = await database;
    final results = await db.query('map_cache', where: 'cache_key = ?', whereArgs: [key], columns: ['updated_at']);
    if (results.isEmpty) return null;
    return DateTime.fromMillisecondsSinceEpoch(results.first['updated_at'] as int);
  }

  // --- Auth cache (offline login) ---
  Future<void> cacheAuthData({
    required String email,
    required String passwordHash,
    required Map<String, dynamic> userData,
    required String accessToken,
    required String refreshToken,
  }) async {
    final db = await database;
    await db.insert('auth_cache', {
      'email': email,
      'password_hash': passwordHash,
      'user_data': jsonEncode(userData),
      'access_token': accessToken,
      'refresh_token': refreshToken,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<Map<String, dynamic>?> getCachedAuth(String email) async {
    final db = await database;
    final results = await db.query('auth_cache', where: 'email = ?', whereArgs: [email]);
    if (results.isEmpty) return null;
    return {
      'email': results.first['email'],
      'password_hash': results.first['password_hash'],
      'user_data': jsonDecode(results.first['user_data'] as String),
      'access_token': results.first['access_token'],
      'refresh_token': results.first['refresh_token'],
    };
  }

  Future<void> clearAuthCache() async {
    final db = await database;
    await db.delete('auth_cache');
  }

  Future<void> clearAll() async {
    final db = await database;
    await db.delete('destinations');
    await db.delete('categories');
    await db.delete('map_cache');
  }
}
