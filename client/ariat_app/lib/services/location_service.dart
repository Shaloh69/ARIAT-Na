import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'notification_service.dart';

class LocationService extends ChangeNotifier {
  Position? _currentPosition;
  StreamSubscription<Position>? _positionStream;
  bool _tracking = false;

  // Destination proximity monitoring
  final List<MonitoredDestination> _monitored = [];
  final Set<String> _arrivedAt = {};
  final Set<String> _approachNotified = {};

  Position? get currentPosition => _currentPosition;
  bool get isTracking => _tracking;

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

    try {
      _currentPosition = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      notifyListeners();
    } catch (_) {}

    _positionStream = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen((position) {
      _currentPosition = position;
      _checkProximity();
      notifyListeners();
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
    _tracking = false;
    clearMonitoring();
    notifyListeners();
  }

  @override
  void dispose() {
    _positionStream?.cancel();
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
