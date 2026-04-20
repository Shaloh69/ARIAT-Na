import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'auth_service.dart';

/// Events emitted by this service.
class NavRouteUpdate {
  final List<List<double>> path; // [[lat,lon], ...]
  final double totalDistance;
  final int estimatedTime;
  NavRouteUpdate({required this.path, required this.totalDistance, required this.estimatedTime});
}

class NavProgressUpdate {
  final double distanceToNext; // km
  final bool isOnCourse;
  NavProgressUpdate({required this.distanceToNext, required this.isOnCourse});
}

class NavigationWsService extends ChangeNotifier {
  final AuthService _authService;
  io.Socket? _socket;
  String? _sessionId;
  bool _connected = false;

  final StreamController<NavRouteUpdate> _routeUpdateCtrl =
      StreamController<NavRouteUpdate>.broadcast();
  final StreamController<NavProgressUpdate> _progressCtrl =
      StreamController<NavProgressUpdate>.broadcast();
  final StreamController<String> _errorCtrl =
      StreamController<String>.broadcast();

  Stream<NavRouteUpdate> get routeUpdates => _routeUpdateCtrl.stream;
  Stream<NavProgressUpdate> get progressUpdates => _progressCtrl.stream;
  Stream<String> get errors => _errorCtrl.stream;

  bool get connected => _connected;
  String? get sessionId => _sessionId;

  NavigationWsService(this._authService);

  void connect() {
    final token = _authService.accessToken;
    if (token == null) return;
    if (_socket != null) return;

    // Derive WS server root from the API base URL (strip /api/v1)
    final wsUrl = _authService.baseUrl.replaceAll(RegExp(r'/api/v1$'), '');

    _socket = io.io(
      wsUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .build(),
    );

    _socket!.onConnect((_) {
      _connected = true;
      notifyListeners();
    });

    _socket!.onDisconnect((_) {
      _connected = false;
      _sessionId = null;
      notifyListeners();
    });

    _socket!.on('navigation:route-recalculated', (data) {
      try {
        final newRoute = data['newRoute'] as Map<String, dynamic>;
        final rawPath = newRoute['path'] as List;
        final pts = rawPath
            .map((p) => [
                  (p['lat'] as num).toDouble(),
                  (p['lon'] as num).toDouble(),
                ])
            .toList();
        _routeUpdateCtrl.add(NavRouteUpdate(
          path: pts,
          totalDistance: (newRoute['totalDistance'] as num?)?.toDouble() ?? 0,
          estimatedTime: (newRoute['estimatedTime'] as num?)?.toInt() ?? 0,
        ));
      } catch (_) {}
    });

    _socket!.on('navigation:progress', (data) {
      try {
        _progressCtrl.add(NavProgressUpdate(
          distanceToNext: (data['distanceToNext'] as num?)?.toDouble() ?? 0,
          isOnCourse: data['isOnCourse'] == true,
        ));
      } catch (_) {}
    });

    _socket!.on('navigation:error', (data) {
      _errorCtrl.add((data['message'] as String?) ?? 'Navigation error');
    });

    _socket!.connect();
  }

  void startNavigation({
    required String sessionId,
    required Map<String, dynamic> route,
    required double destLat,
    required double destLon,
    String optimizeFor = 'distance',
  }) {
    _sessionId = sessionId;
    _socket?.emit('navigation:start', {
      'sessionId': sessionId,
      'route': route,
      'destination': {'lat': destLat, 'lon': destLon},
      'optimizeFor': optimizeFor,
    });
  }

  void sendLocationUpdate({
    required double latitude,
    required double longitude,
    double? heading,
    double? speed,
  }) {
    if (_sessionId == null) return;
    _socket?.emit('navigation:location-update', {
      'sessionId': _sessionId,
      'latitude': latitude,
      'longitude': longitude,
      if (heading != null) 'heading': heading,
      if (speed != null) 'speed': speed,
    });
  }

  void announceItinerary({required String title, required int stopCount}) {
    _socket?.emit('user:set-itinerary', {
      'title': title,
      'stopCount': stopCount,
    });
  }

  void endNavigation() {
    if (_sessionId != null) {
      _socket?.emit('navigation:end', {'sessionId': _sessionId});
      _sessionId = null;
    }
  }

  void disconnect() {
    endNavigation();
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _connected = false;
  }

  @override
  void dispose() {
    disconnect();
    _routeUpdateCtrl.close();
    _progressCtrl.close();
    _errorCtrl.close();
    super.dispose();
  }
}
