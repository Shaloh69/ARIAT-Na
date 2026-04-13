import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_compass/flutter_compass.dart';
import 'notification_service.dart';

class LocationService extends ChangeNotifier {
  Position? _currentPosition;
  StreamSubscription<Position>? _positionStream;
  StreamSubscription<CompassEvent>? _compassSubscription;
  bool _tracking = false;

  /// Current heading in degrees (0 = north, 90 = east).
  /// Uses GPS bearing when moving (> 0.5 m/s), device compass when stationary.
  double _heading = 0;

  /// Timestamp of the last GPS position update (not compass).
  /// Used by map_screen to skip the expensive snapping math on compass-only updates.
  DateTime? _lastPositionUpdate;

  // Destination proximity monitoring
  final List<MonitoredDestination> _monitored = [];
  final Set<String> _arrivedAt = {};
  final Set<String> _approachNotified = {};

  // Broadcast stream so UI layers can react to arrivals
  final StreamController<String> _arrivedController =
      StreamController<String>.broadcast();

  /// Stream emits the destination ID each time the user arrives at a monitored stop.
  Stream<String> get arrivedStream => _arrivedController.stream;

  Position? get currentPosition => _currentPosition;
  bool get isTracking => _tracking;
  double get heading => _heading;
  DateTime? get lastPositionUpdate => _lastPositionUpdate;

  Future<bool> checkPermission() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return false;
    }
    if (permission == LocationPermission.deniedForever) return false;
    return true;
  }

  Future<void> startTracking() async {
    if (_tracking) return;
    final ok = await checkPermission();
    if (!ok) return;

    _tracking = true;
    notifyListeners();

    // Get an immediate position so the UI doesn't wait for the first stream event
    try {
      _currentPosition = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      _lastPositionUpdate = DateTime.now();
      notifyListeners();
    } catch (_) {}

    // GPS position stream — fires every 10 m of movement
    _positionStream = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen((position) {
      _currentPosition = position;
      _lastPositionUpdate = DateTime.now();
      // While moving use GPS bearing (accurate direction of travel)
      if (position.speed > 0.5) {
        _heading = position.heading;
      }
      _checkProximity();
      notifyListeners();
    });

    // Compass stream — fires at sensor rate (~10–50 Hz)
    // Only used for heading when the user is stationary (speed ≤ 0.5 m/s)
    _compassSubscription = FlutterCompass.events?.listen((event) {
      final h = event.heading;
      if (h == null) return;
      if ((_currentPosition?.speed ?? 0) <= 0.5) {
        _heading = h;
        notifyListeners();
      }
    });
  }

  void monitorDestination(String id, String name, double lat, double lon) {
    if (_monitored.any((m) => m.id == id)) return;
    _monitored.add(MonitoredDestination(id: id, name: name, lat: lat, lon: lon));
    _arrivedAt.remove(id);
    _approachNotified.remove(id);
  }

  void clearMonitoring() {
    _monitored.clear();
    _arrivedAt.clear();
    _approachNotified.clear();
  }

  void _checkProximity() {
    if (_currentPosition == null) return;

    for (final dest in _monitored) {
      final dist = _haversine(
        _currentPosition!.latitude,
        _currentPosition!.longitude,
        dest.lat,
        dest.lon,
      );

      if (dist <= 50 && !_arrivedAt.contains(dest.id)) {
        _arrivedAt.add(dest.id);
        NotificationService.showDestinationArrived(dest.name);
        _arrivedController.add(dest.id);
      } else if (dist <= 200 && !_approachNotified.contains(dest.id)) {
        _approachNotified.add(dest.id);
        NotificationService.showApproaching(dest.name);
      }
    }
  }

  double _haversine(double lat1, double lon1, double lat2, double lon2) {
    const R = 6371000.0;
    final dLat = _toRad(lat2 - lat1);
    final dLon = _toRad(lon2 - lon1);
    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(_toRad(lat1)) * cos(_toRad(lat2)) * sin(dLon / 2) * sin(dLon / 2);
    return R * 2 * atan2(sqrt(a), sqrt(1 - a));
  }

  double _toRad(double deg) => deg * pi / 180;

  void stopTracking() {
    _positionStream?.cancel();
    _positionStream = null;
    _compassSubscription?.cancel();
    _compassSubscription = null;
    _tracking = false;
    _heading = 0;
    clearMonitoring();
    notifyListeners();
  }

  @override
  void dispose() {
    _positionStream?.cancel();
    _compassSubscription?.cancel();
    _arrivedController.close();
    super.dispose();
  }
}

class MonitoredDestination {
  final String id;
  final String name;
  final double lat;
  final double lon;
  MonitoredDestination({
    required this.id,
    required this.name,
    required this.lat,
    required this.lon,
  });
}
