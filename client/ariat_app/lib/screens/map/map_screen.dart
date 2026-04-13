import 'dart:math';
import 'dart:ui';
import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path; // dart:ui also exports Path — prefer the canvas one
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../services/api_service.dart';
import '../../services/connectivity_service.dart';
import '../../services/location_service.dart';
import '../../models/destination.dart';
import '../../models/route_result.dart';
import '../../models/transport_leg.dart';
import '../../theme/app_theme.dart';
import '../../widgets/toast_overlay.dart';
import 'itinerary_bottom_sheet.dart';

/// Safe numeric parse — handles both num and String values from JSON.
double _parseDouble(dynamic v, [double fallback = 0.0]) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? fallback;
  return fallback;
}

class MapScreen extends StatefulWidget {
  /// When provided, the map opens in route-planning mode with this destination
  /// pre-loaded as the first stop (user can then set their start point).
  final Destination? destination;
  const MapScreen({super.key, this.destination});
  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final MapController _mapController = MapController();
  List<Destination> _destinations = [];
  List<RouteResult> _routeLegs = [];
  LatLng? _routeStart;
  List<_RouteStop> _routeStops = [];
  bool _routeLoading = false;
  String? _routeError;
  String _optimizeFor = 'distance';
  String _transportMode = 'private_car';
  List<MultiModalRoute> _multiModalLegs = [];
  bool _showRoutePanel = false;
  bool _isNavigating = false;
  bool _isAiItinerary = false;
  bool _aiGenerating = false;

  // ── Navigation state ──────────────────────────────────────────────────────
  /// Reference saved so the listener can be removed in dispose()
  LocationService? _locationService;
  /// Snapped position on the route polyline (null = use raw GPS)
  LatLng? _snappedPosition;
  /// True when user is >60 m from the route polyline for 2+ consecutive GPS updates
  bool _isOffRoute = false;
  /// True while an auto-reroute calculation is in progress (private car only)
  bool _rerouting = false;
  /// Consecutive GPS updates where the user was off-route
  int _offRouteCount = 0;
  /// Timestamp of the last triggered reroute (enforces 15 s cooldown)
  DateTime? _lastRerouteTime;
  /// Used to skip expensive snapping math on compass-only updates
  DateTime? _lastHandledPositionTime;

  // Cebu Province bounding box
  static final _cebuBounds = LatLngBounds(
    const LatLng(9.3223413, 123.2352650),
    const LatLng(11.6238718, 124.6671822),
  );
  static const _defaultCenter = LatLng(10.4731066, 123.9512236);

  @override
  void initState() {
    super.initState();
    _loadDestinations();
    if (widget.destination != null) {
      final dest = widget.destination!;
      _showRoutePanel = true;
      _routeStops = [
        _RouteStop(
          position: LatLng(dest.latitude, dest.longitude),
          name: dest.name,
          destId: dest.id,
        ),
      ];
    }
    // Register location listener after the first frame (context is ready)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _locationService = context.read<LocationService>();
      _locationService!.addListener(_handleLocationUpdate);
    });
  }

  @override
  void dispose() {
    _locationService?.removeListener(_handleLocationUpdate);
    super.dispose();
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  Future<void> _loadDestinations() async {
    try {
      final api = context.read<ApiService>();
      final res = await api.get('/destinations', query: {'limit': '100'});
      final data = (res['data'] as List?) ?? [];
      setState(() {
        _destinations = data.map((d) => Destination.fromJson(d)).toList();
      });
    } catch (_) {}
  }

  // ── Map tap / stop management ─────────────────────────────────────────────

  void _onMapTap(LatLng point) {
    if (!_showRoutePanel) return;
    if (_routeStart == null) {
      setState(() {
        _routeStart = point;
        _routeStops = [];
        _routeLegs = [];
        _routeError = null;
      });
      AppToast.info(context, 'Start set. Add destinations to build itinerary.');
    } else {
      _addStop(_RouteStop(position: point, name: 'Stop ${_routeStops.length + 1}'));
    }
  }

  void _addDestinationStop(Destination dest) {
    if (_routeStart == null) {
      AppToast.warning(context, 'Tap the map to set a starting point first');
      return;
    }
    if (_routeStops.any((s) => s.destId == dest.id)) {
      AppToast.warning(context, '${dest.name} is already in the itinerary');
      return;
    }
    _addStop(_RouteStop(
      position: LatLng(dest.latitude, dest.longitude),
      name: dest.name,
      destId: dest.id,
    ));
  }

  void _addStop(_RouteStop stop) {
    final newStops = [..._routeStops, stop];
    setState(() => _routeStops = newStops);
    _calculateRoute(newStops);
  }

  void _removeStop(int index) {
    final newStops = List<_RouteStop>.from(_routeStops)..removeAt(index);
    setState(() {
      _routeStops = newStops;
      if (newStops.isEmpty) {
        _routeLegs = [];
        _routeError = null;
      }
    });
    if (newStops.isNotEmpty) _calculateRoute(newStops);
  }

  void _reorderStop(int oldIndex, int newIndex) {
    if (newIndex > oldIndex) newIndex--;
    final stops = List<_RouteStop>.from(_routeStops);
    final item = stops.removeAt(oldIndex);
    stops.insert(newIndex, item);
    setState(() => _routeStops = stops);
    if (stops.isNotEmpty) _calculateRoute(stops);
  }

  // ── Route calculation ─────────────────────────────────────────────────────

  static const _multiModalModes = {
    'bus_commute', 'bus', 'jeepney', 'taxi', 'ferry', 'habal_habal', 'tricycle', 'walk'
  };

  Future<void> _calculateRoute(List<_RouteStop> stops) async {
    if (_routeStart == null || stops.isEmpty) return;

    final isOnline = context.read<ConnectivityService>().isOnline;
    if (!isOnline) {
      setState(() => _routeError = 'Route calculation requires internet');
      AppToast.warning(context, 'Route calculation needs internet connection');
      return;
    }

    setState(() {
      _routeLoading = true;
      _routeError = null;
    });

    final useMultiModal = _multiModalModes.contains(_transportMode);

    try {
      final api = context.read<ApiService>();
      final waypoints = [_routeStart!, ...stops.map((s) => s.position)];

      if (useMultiModal) {
        final mmLegs = <MultiModalRoute>[];
        for (int i = 0; i < waypoints.length - 1; i++) {
          final from = waypoints[i];
          final to = waypoints[i + 1];
          final res = await api.post('/routes/calculate-multimodal', body: {
            'start_lat': from.latitude,
            'start_lon': from.longitude,
            'end_lat': to.latitude,
            'end_lon': to.longitude,
            'transport_mode': _transportMode,
            'optimize_for': _optimizeFor,
          }, auth: true);

          if (res['success'] == true && res['data'] != null) {
            mmLegs.add(MultiModalRoute.fromJson(res['data'] as Map<String, dynamic>));
          } else {
            final fromName = i == 0 ? 'Start' : stops[i - 1].name;
            final toName = stops[i].name;
            setState(() {
              _routeError = 'No route: $fromName → $toName';
              _multiModalLegs = mmLegs;
              _routeLoading = false;
            });
            return;
          }
        }
        final totalDist = mmLegs.fold<double>(0, (s, l) => s + l.totalDistance);
        final totalTime = mmLegs.fold<int>(0, (s, l) => s + l.totalDuration);
        final totalFare = mmLegs.fold<double>(0, (s, l) => s + l.totalFare);
        setState(() {
          _multiModalLegs = mmLegs;
          _routeLegs = [];
          _routeLoading = false;
        });
        if (mounted) {
          AppToast.success(context,
              '${totalDist.toStringAsFixed(2)} km · ~$totalTime min · ₱${totalFare.toStringAsFixed(0)}');
        }
      } else {
        final legs = <RouteResult>[];
        for (int i = 0; i < waypoints.length - 1; i++) {
          final from = waypoints[i];
          final to = waypoints[i + 1];
          final res = await api.post('/routes/calculate-gps', body: {
            'start_lat': from.latitude,
            'start_lon': from.longitude,
            'end_lat': to.latitude,
            'end_lon': to.longitude,
            'optimize_for': _optimizeFor,
          }, auth: true);

          if (res['success'] == true && res['data'] != null) {
            legs.add(RouteResult.fromJson(res['data']));
          } else {
            final fromName = i == 0 ? 'Start' : stops[i - 1].name;
            final toName = stops[i].name;
            setState(() {
              _routeError = 'No route: $fromName → $toName';
              _routeLegs = legs;
              _routeLoading = false;
            });
            return;
          }
        }
        final totalDist = legs.fold<double>(0, (s, l) => s + l.totalDistance);
        final totalTime = legs.fold<int>(0, (s, l) => s + l.estimatedTime);
        setState(() {
          _routeLegs = legs;
          _multiModalLegs = [];
          _routeLoading = false;
        });
        if (mounted) {
          AppToast.success(context, '${totalDist.toStringAsFixed(2)} km · ~$totalTime min');
        }
      }
    } catch (e) {
      setState(() {
        _routeError = e.toString().replaceFirst('Exception: ', '');
        _routeLoading = false;
      });
      if (mounted) AppToast.error(context, 'Route calculation failed');
    }
  }

  // ── Navigation control ────────────────────────────────────────────────────

  void _startNavigation() {
    final hasRoute = _routeLegs.isNotEmpty || _multiModalLegs.isNotEmpty;
    if (!hasRoute || _routeStops.isEmpty) return;

    final locationService = context.read<LocationService>();
    locationService.startTracking();
    locationService.clearMonitoring();

    for (final stop in _routeStops) {
      locationService.monitorDestination(
        stop.destId ?? 'stop_${stop.name}',
        stop.name,
        stop.position.latitude,
        stop.position.longitude,
      );
    }

    setState(() {
      _isNavigating = true;
      _snappedPosition = null;
      _isOffRoute = false;
      _rerouting = false;
      _offRouteCount = 0;
      _lastRerouteTime = null;
      _lastHandledPositionTime = null;
    });
    AppToast.success(context, 'Navigation started! You will be notified when you arrive.');
  }

  void _stopNavigation() {
    context.read<LocationService>().stopTracking();
    setState(() {
      _isNavigating = false;
      _snappedPosition = null;
      _isOffRoute = false;
      _rerouting = false;
      _offRouteCount = 0;
    });
    // Reset map to north-up
    try { _mapController.rotate(0); } catch (_) {}
    AppToast.info(context, 'Navigation stopped');
  }

  void _clearRoute() {
    if (_isNavigating) _stopNavigation();
    setState(() {
      _routeStart = null;
      _routeStops = [];
      _routeLegs = [];
      _multiModalLegs = [];
      _routeError = null;
      _isAiItinerary = false;
    });
  }

  // ── Location update handler ───────────────────────────────────────────────

  /// Fires on every LocationService notify (GPS + compass updates).
  void _handleLocationUpdate() {
    final ls = _locationService;
    if (ls == null || !_isNavigating || !mounted) return;

    final pos = ls.currentPosition;
    if (pos == null) return;

    final userLatLng = LatLng(pos.latitude, pos.longitude);

    // ── Camera: follow + rotate (cheap, runs on compass + GPS updates) ──
    final displayPos = _snappedPosition ?? userLatLng;
    try {
      _mapController.moveAndRotate(
        displayPos,
        _mapController.camera.zoom,
        -ls.heading, // negative: map rotates so heading direction faces "up"
      );
    } catch (_) {}

    // ── Snapping + off-route: only on new GPS positions ──────────────────
    final posTime = ls.lastPositionUpdate;
    if (posTime == null || posTime == _lastHandledPositionTime) return;
    _lastHandledPositionTime = posTime;

    final polyline = _flatRoutePolyline();
    if (polyline.length >= 2) {
      final snapped = _snapToPolyline(userLatLng, polyline);
      final distOff = _distMeters(userLatLng, snapped);

      setState(() => _snappedPosition = snapped);

      if (distOff > 60) {
        _offRouteCount++;
        if (_offRouteCount >= 2) {
          final isMultiModal = _multiModalLegs.isNotEmpty;
          if (isMultiModal) {
            // Public transit: warn the user, no auto-reroute
            if (!_isOffRoute) setState(() => _isOffRoute = true);
          } else {
            // Private car: auto-reroute with 15 s cooldown
            final now = DateTime.now();
            final canReroute = _lastRerouteTime == null ||
                now.difference(_lastRerouteTime!).inSeconds >= 15;
            if (canReroute && !_rerouting) {
              _lastRerouteTime = now;
              _offRouteCount = 0;
              setState(() {
                _rerouting = true;
                _routeStart = userLatLng;
              });
              AppToast.warning(context, 'Off route — recalculating...');
              _calculateRoute(_routeStops).whenComplete(() {
                if (mounted) setState(() => _rerouting = false);
              });
            }
          }
        }
      } else {
        _offRouteCount = 0;
        if (_isOffRoute) setState(() => _isOffRoute = false);
      }
    } else {
      setState(() => _snappedPosition = userLatLng);
    }
  }

  // ── Route geometry helpers ────────────────────────────────────────────────

  /// Concatenates all leg geometries into a single flat polyline.
  List<LatLng> _flatRoutePolyline() {
    if (_routeLegs.isNotEmpty) {
      return _routeLegs.expand(_routePolyline).toList();
    }
    if (_multiModalLegs.isNotEmpty) {
      return _multiModalLegs
          .expand((mm) => mm.legs)
          .expand((leg) => leg.geometry.map((c) => LatLng(c[0], c[1])))
          .toList();
    }
    return [];
  }

  /// Haversine distance in metres between two LatLng points.
  double _distMeters(LatLng a, LatLng b) {
    const R = 6371000.0;
    final dLat = (b.latitude - a.latitude) * pi / 180;
    final dLon = (b.longitude - a.longitude) * pi / 180;
    final sinLat = sin(dLat / 2);
    final sinLon = sin(dLon / 2);
    final x = sinLat * sinLat +
        cos(a.latitude * pi / 180) * cos(b.latitude * pi / 180) * sinLon * sinLon;
    return R * 2 * atan2(sqrt(x), sqrt(1 - x));
  }

  /// Returns the nearest point on segment A→B to point P (clamped to segment).
  LatLng _nearestOnSegment(LatLng p, LatLng a, LatLng b) {
    final dx = b.latitude - a.latitude;
    final dy = b.longitude - a.longitude;
    if (dx == 0 && dy == 0) return a;
    final t = ((p.latitude - a.latitude) * dx + (p.longitude - a.longitude) * dy) /
        (dx * dx + dy * dy);
    final tc = t.clamp(0.0, 1.0);
    return LatLng(a.latitude + tc * dx, a.longitude + tc * dy);
  }

  /// Projects [point] onto the nearest segment of [polyline].
  LatLng _snapToPolyline(LatLng point, List<LatLng> polyline) {
    if (polyline.length < 2) return point;
    var minDist = double.infinity;
    var snapped = polyline.first;
    for (int i = 0; i < polyline.length - 1; i++) {
      final candidate = _nearestOnSegment(point, polyline[i], polyline[i + 1]);
      final d = _distMeters(point, candidate);
      if (d < minDist) {
        minDist = d;
        snapped = candidate;
      }
    }
    return snapped;
  }

  // ── AI itinerary ──────────────────────────────────────────────────────────

  Future<void> _generateAiItinerary() async {
    final isOnline = context.read<ConnectivityService>().isOnline;
    if (!isOnline) {
      AppToast.warning(context, 'AI itinerary requires internet connection');
      return;
    }

    final params = await showItinerarySheet(context);
    if (params == null || !mounted) return;

    final locationService = context.read<LocationService>();
    final userPos = locationService.currentPosition;
    if (userPos == null) {
      AppToast.warning(context, 'Could not get your current location');
      return;
    }

    setState(() {
      _aiGenerating = true;
      _showRoutePanel = true;
      _routeError = null;
    });

    try {
      final api = context.read<ApiService>();
      final res = await api.post('/ai/itinerary/generate', body: {
        'start': {'lat': userPos.latitude, 'lon': userPos.longitude},
        ...params.toJson(),
      }, auth: true);

      if (!mounted) return;

      if (res['success'] == true && res['data'] != null) {
        final data = res['data'] as Map<String, dynamic>;
        final rawStops = (data['stops'] as List?) ?? [];
        final rawLegs = (data['legs'] as List?) ?? [];

        if (rawStops.isEmpty) {
          AppToast.warning(context, 'No destinations found matching your criteria');
          setState(() => _aiGenerating = false);
          return;
        }

        final stops = rawStops.map((s) {
          final dest = s['destination'] as Map<String, dynamic>;
          return _RouteStop(
            position: LatLng(
              _parseDouble(dest['latitude']),
              _parseDouble(dest['longitude']),
            ),
            name: dest['name'] as String? ?? '',
            destId: dest['id'] as String?,
          );
        }).toList();

        final legs = rawLegs
            .map((l) => RouteResult.fromJson(l as Map<String, dynamic>))
            .toList();

        setState(() {
          _routeStart = LatLng(userPos.latitude, userPos.longitude);
          _routeStops = stops;
          _routeLegs = legs;
          _transportMode = params.transportMode;
          _isAiItinerary = true;
          _aiGenerating = false;
        });

        final dist = (data['totalDistance'] as num?)?.toStringAsFixed(2) ?? '?';
        final time = data['estimatedTotalTime'] ?? '?';
        AppToast.success(context, '${stops.length} stops • $dist km • ~$time min total');
      } else {
        setState(() => _aiGenerating = false);
        AppToast.error(context, res['message'] as String? ?? 'Generation failed');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _aiGenerating = false;
        _routeError = e.toString().replaceFirst('Exception: ', '');
      });
      AppToast.error(context, 'AI itinerary generation failed');
    }
  }

  Future<void> _saveItinerary() async {
    if (_routeStops.isEmpty) return;

    try {
      final api = context.read<ApiService>();
      final totalDist = _routeLegs.fold<double>(0, (s, l) => s + l.totalDistance);
      final totalTime = _routeLegs.fold<int>(0, (s, l) => s + l.estimatedTime);

      final stops = _routeStops
          .map((s) => {'destination_id': s.destId, 'name': s.name})
          .toList();

      final res = await api.post('/ai/itinerary/save', body: {
        'title': 'My Itinerary (${DateTime.now().day}/${DateTime.now().month})',
        'stops': stops,
        'total_distance': totalDist,
        'estimated_time': totalTime,
        'start_latitude': _routeStart?.latitude,
        'start_longitude': _routeStart?.longitude,
        'optimize_for': _optimizeFor,
      }, auth: true);

      if (!mounted) return;
      if (res['success'] == true) {
        AppToast.success(context, 'Itinerary saved!');
      } else {
        AppToast.error(context, res['message'] as String? ?? 'Save failed');
      }
    } catch (e) {
      if (!mounted) return;
      AppToast.error(context, 'Could not save itinerary');
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  Color _modeColor(String mode) {
    switch (mode) {
      case 'walk':                return const Color(0xFF9ca3af);
      case 'bus':
      case 'jeepney':             return const Color(0xFF2563eb);
      case 'tricycle':
      case 'habal_habal':         return const Color(0xFF16a34a);
      case 'ferry':               return const Color(0xFF7c3aed);
      case 'taxi':                return const Color(0xFFf59e0b);
      default:                    return const Color(0xFFdc2626);
    }
  }

  List<LatLng> _routePolyline(RouteResult leg) {
    if (leg.routeGeometry != null && leg.routeGeometry!.length >= 2) {
      return leg.routeGeometry!.map((c) => LatLng(c[0], c[1])).toList();
    }
    return leg.path.map((p) => LatLng(p.latitude, p.longitude)).toList();
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final locationService = context.watch<LocationService>();
    final userPos = locationService.currentPosition;

    return Stack(
      children: [
        // ── Map ──────────────────────────────────────────────────────────────
        FlutterMap(
          mapController: _mapController,
          options: MapOptions(
            initialCameraFit: CameraFit.insideBounds(
              bounds: _cebuBounds,
              padding: const EdgeInsets.all(20),
            ),
            initialCenter: _defaultCenter,
            initialZoom: 13,
            minZoom: 8.2,
            maxZoom: 19,
            cameraConstraint: CameraConstraint.contain(bounds: _cebuBounds),
            onTap: (_, point) => _onMapTap(point),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.example.ariat_app',
            ),

            // Destination markers — rotate: true keeps them upright when map rotates
            MarkerLayer(
              markers: _destinations.map((d) => Marker(
                point: LatLng(d.latitude, d.longitude),
                width: 36, height: 36,
                rotate: true,
                child: GestureDetector(
                  onTap: () {
                    if (_showRoutePanel) _addDestinationStop(d);
                  },
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.red500,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                      boxShadow: [
                        BoxShadow(color: AppColors.red500.withAlpha(100), blurRadius: 8),
                      ],
                    ),
                    child: const Icon(FluentIcons.poi, color: Colors.white, size: 16),
                  ),
                ),
              )).toList(),
            ),

            // Route start marker
            if (_routeStart != null)
              MarkerLayer(markers: [
                Marker(
                  point: _routeStart!,
                  width: 28, height: 28,
                  rotate: true,
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.green,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                    child: const Icon(FluentIcons.location, color: Colors.white, size: 14),
                  ),
                ),
              ]),

            // Route stop markers
            if (_routeStops.isNotEmpty)
              MarkerLayer(
                markers: _routeStops.asMap().entries.map((e) {
                  final idx = e.key;
                  final stop = e.value;
                  final isLast = idx == _routeStops.length - 1;
                  return Marker(
                    point: stop.position,
                    width: 28, height: 28,
                    rotate: true,
                    child: Container(
                      decoration: BoxDecoration(
                        color: isLast ? const Color(0xFFDC2626) : AppColors.purple,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: Center(
                        child: Text(
                          '${idx + 1}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),

            // Route polylines — standard (private car)
            if (_routeLegs.isNotEmpty)
              PolylineLayer(
                polylines: _routeLegs.asMap().entries.map((e) {
                  final colors = [
                    AppColors.purple, AppColors.blue, AppColors.cyan,
                    AppColors.green, AppColors.amber,
                  ];
                  return Polyline(
                    points: _routePolyline(e.value),
                    strokeWidth: 5,
                    color: colors[e.key % colors.length].withAlpha(200),
                  );
                }).toList(),
              ),

            // Route polylines — multi-modal (colour-coded per transport mode)
            if (_multiModalLegs.isNotEmpty)
              PolylineLayer(
                polylines: _multiModalLegs.expand((mm) => mm.legs).map((leg) {
                  final pts = leg.geometry.map((c) => LatLng(c[0], c[1])).toList();
                  if (pts.length < 2) return null;
                  return Polyline(
                    points: pts,
                    strokeWidth: 5,
                    color: _modeColor(leg.mode).withAlpha(210),
                  );
                }).whereType<Polyline>().toList(),
              ),

            // ── Navigation arrow ──────────────────────────────────────────
            // rotate: false — map rotation already puts heading at the top,
            // so the upward-pointing arrow always faces the direction of travel.
            if (userPos != null && _isNavigating)
              MarkerLayer(markers: [
                Marker(
                  point: _snappedPosition ?? LatLng(userPos.latitude, userPos.longitude),
                  width: 44, height: 44,
                  rotate: false,
                  child: CustomPaint(
                    size: const Size(44, 44),
                    painter: _NavArrowPainter(),
                  ),
                ),
              ]),
          ],
        ),

        // ── AI Plan button (hidden while navigating) ──────────────────────
        if (!_isNavigating)
          Positioned(
            top: MediaQuery.of(context).padding.top + 10,
            left: 14,
            child: GestureDetector(
              onTap: _aiGenerating ? null : _generateAiItinerary,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: _isAiItinerary
                          ? AppColors.purple
                          : c.surfaceCard.withAlpha(220),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: c.borderLight),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_aiGenerating)
                          const SizedBox(
                            width: 14, height: 14,
                            child: ProgressRing(strokeWidth: 2),
                          )
                        else
                          Icon(FluentIcons.lightbulb, size: 16,
                              color: _isAiItinerary ? Colors.white : c.text),
                        const SizedBox(width: 6),
                        Text('AI Plan',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: _isAiItinerary ? Colors.white : c.text,
                            )),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),

        // ── Route toggle button ───────────────────────────────────────────
        Positioned(
          top: MediaQuery.of(context).padding.top + 10,
          right: 14,
          child: GestureDetector(
            onTap: () => setState(() => _showRoutePanel = !_showRoutePanel),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: _showRoutePanel
                        ? AppColors.red500
                        : c.surfaceCard.withAlpha(220),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: c.borderLight),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(FluentIcons.map_directions, size: 16,
                          color: _showRoutePanel ? Colors.white : c.text),
                      const SizedBox(width: 6),
                      Text('Route',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: _showRoutePanel ? Colors.white : c.text,
                          )),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),

        // ── Navigation status indicator ───────────────────────────────────
        if (_isNavigating)
          Positioned(
            top: MediaQuery.of(context).padding.top + 10,
            left: 14,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: _isOffRoute
                        ? const Color(0xFFDC2626).withAlpha(220)
                        : _rerouting
                            ? AppColors.amber.withAlpha(220)
                            : AppColors.green.withAlpha(220),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_rerouting)
                        const SizedBox(
                          width: 14, height: 14,
                          child: ProgressRing(strokeWidth: 2),
                        )
                      else
                        Icon(
                          _isOffRoute ? FluentIcons.warning : FluentIcons.location,
                          size: 14, color: Colors.white,
                        ),
                      const SizedBox(width: 6),
                      Text(
                        _rerouting
                            ? 'Recalculating...'
                            : _isOffRoute
                                ? 'Off Route!'
                                : 'Navigating',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                      // Speed readout when on-route and moving
                      if (!_rerouting && !_isOffRoute &&
                          (userPos?.speed ?? 0) > 0.5) ...[
                        const SizedBox(width: 6),
                        Text(
                          '· ${((userPos!.speed) * 3.6).toStringAsFixed(0)} km/h',
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.white.withAlpha(200),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),

        // ── Off-route banner (multi-modal / public transit) ───────────────
        if (_isOffRoute && _multiModalLegs.isNotEmpty)
          Positioned(
            top: MediaQuery.of(context).padding.top + 60,
            left: 14, right: 14,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFDC2626).withAlpha(230),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(FluentIcons.warning, color: Colors.white, size: 16),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Text('Off Route!',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13,
                                )),
                            const SizedBox(height: 2),
                            Text(
                              'Ask the driver or nearby passengers where this vehicle is heading, or hop off and ride another vehicle.',
                              style: TextStyle(
                                color: Colors.white.withAlpha(220),
                                fontSize: 11,
                                height: 1.4,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 6),
                      GestureDetector(
                        onTap: () => setState(() => _isOffRoute = false),
                        child: const Icon(FluentIcons.chrome_close,
                            color: Colors.white, size: 14),
                      ),
                    ],
                  ),
                ),
              ),
            ).animate().slideY(begin: -0.3, end: 0, duration: 250.ms),
          ),

        // ── Route panel ───────────────────────────────────────────────────
        if (_showRoutePanel)
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                child: Container(
                  constraints: BoxConstraints(
                      maxHeight: MediaQuery.of(context).size.height * 0.5),
                  padding: const EdgeInsets.fromLTRB(20, 14, 20, 10),
                  decoration: BoxDecoration(
                    color: c.surfaceCard.withAlpha(230),
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                    border: Border(top: BorderSide(color: c.borderLight)),
                  ),
                  child: SingleChildScrollView(child: _buildRoutePanel()),
                ),
              ),
            ).animate().slideY(begin: 1, end: 0, duration: 300.ms, curve: Curves.easeOut),
          ),
      ],
    );
  }

  // ── Route panel widget ────────────────────────────────────────────────────

  Widget _buildRoutePanel() {
    final c = context.appColors;
    final isMultiModal = _multiModalLegs.isNotEmpty;
    final totalDist = isMultiModal
        ? _multiModalLegs.fold<double>(0, (s, l) => s + l.totalDistance)
        : _routeLegs.fold<double>(0, (s, l) => s + l.totalDistance);
    final totalTime = isMultiModal
        ? _multiModalLegs.fold<int>(0, (s, l) => s + l.totalDuration)
        : _routeLegs.fold<int>(0, (s, l) => s + l.estimatedTime);
    final totalFare = isMultiModal
        ? _multiModalLegs.fold<double>(0, (s, l) => s + l.totalFare)
        : 0.0;
    final hasRoute = _routeLegs.isNotEmpty || _multiModalLegs.isNotEmpty;
    final isOnline = context.watch<ConnectivityService>().isOnline;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Center(
          child: Container(
            width: 36, height: 4,
            decoration: BoxDecoration(
                color: c.borderStrong, borderRadius: BorderRadius.circular(2)),
          ),
        ),
        const SizedBox(height: 12),

        Row(
          children: [
            Text('Itinerary Planner',
                style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                    color: c.textStrong)),
            const Spacer(),
            if (_routeStart != null)
              GestureDetector(
                onTap: _clearRoute,
                child: const Text('Clear',
                    style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFFDC2626),
                        fontWeight: FontWeight.w500)),
              ),
          ],
        ),
        const SizedBox(height: 12),

        // Transport mode chips
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _transportChip('private_car', 'Car', FluentIcons.car),
              const SizedBox(width: 6),
              _transportChip('bus_commute', 'Bus', FluentIcons.bus_solid),
              const SizedBox(width: 6),
              _transportChip('taxi', 'Taxi', FluentIcons.taxi),
              const SizedBox(width: 6),
              _transportChip('ferry', 'Ferry', FluentIcons.airplane),
              const SizedBox(width: 6),
              _transportChip('walk', 'Walk', FluentIcons.location),
            ],
          ),
        ),
        const SizedBox(height: 10),

        // Optimize toggle (private car only)
        if (_transportMode == 'private_car') ...[
          Row(
            children: [
              _optimizeChip('distance', 'Shortest'),
              const SizedBox(width: 8),
              _optimizeChip('time', 'Fastest'),
            ],
          ),
          const SizedBox(height: 12),
        ],

        // Destination picker
        if (_routeStart != null && _destinations.isNotEmpty) ...[
          Text('Add to itinerary:', style: TextStyle(fontSize: 11, color: c.textFaint)),
          const SizedBox(height: 6),
          SizedBox(
            height: 36,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: _destinations.take(15).map((d) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: GestureDetector(
                  onTap: () => _addDestinationStop(d),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: c.surfaceElevated,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: c.borderSubtle),
                    ),
                    child: Text(d.name,
                        style: TextStyle(fontSize: 11, color: c.text)),
                  ),
                ),
              )).toList(),
            ),
          ),
          const SizedBox(height: 10),
        ],

        // Stops list
        if (_routeStops.isNotEmpty) ...[
          Text('Stops:', style: TextStyle(fontSize: 11, color: c.textFaint)),
          const SizedBox(height: 4),
          ...List.generate(_routeStops.length, (i) {
            final stop = _routeStops[i];
            final isLast = i == _routeStops.length - 1;
            return Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  if (_routeStops.length > 1 && !_isNavigating)
                    Column(
                      children: [
                        if (i > 0)
                          GestureDetector(
                            onTap: () => _reorderStop(i, i - 1),
                            child: Icon(FluentIcons.chevron_up_small,
                                size: 12, color: c.textFaint),
                          ),
                        if (i < _routeStops.length - 1)
                          GestureDetector(
                            onTap: () => _reorderStop(i, i + 2),
                            child: Icon(FluentIcons.chevron_down_small,
                                size: 12, color: c.textFaint),
                          ),
                      ],
                    ),
                  const SizedBox(width: 6),
                  Container(
                    width: 20, height: 20,
                    decoration: BoxDecoration(
                      color: isLast ? const Color(0xFFDC2626) : AppColors.purple,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text('${i + 1}',
                          style: const TextStyle(
                              fontSize: 10,
                              color: Colors.white,
                              fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                      child: Text(stop.name,
                          style: TextStyle(fontSize: 12, color: c.text),
                          overflow: TextOverflow.ellipsis)),
                  if (i < _routeLegs.length)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: Text(
                        '${_routeLegs[i].totalDistance.toStringAsFixed(1)}km',
                        style: TextStyle(fontSize: 10, color: c.textFaint),
                      ),
                    ),
                  if (!_isNavigating)
                    GestureDetector(
                      onTap: () => _removeStop(i),
                      child: const Icon(FluentIcons.chrome_close,
                          size: 12, color: Color(0xFFDC2626)),
                    ),
                ],
              ),
            );
          }),
          const SizedBox(height: 6),
        ],

        // Status / info area
        if (_routeStart == null)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                color: AppColors.blue.withAlpha(20),
                borderRadius: BorderRadius.circular(10)),
            child: Row(
              children: [
                Icon(FluentIcons.touch_pointer, size: 16, color: AppColors.blue),
                const SizedBox(width: 8),
                Text('Tap the map to set your start point',
                    style: TextStyle(fontSize: 12, color: AppColors.blue)),
              ],
            ),
          )
        else if (_routeStops.isEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                color: AppColors.blue.withAlpha(20),
                borderRadius: BorderRadius.circular(10)),
            child: Row(
              children: [
                Icon(FluentIcons.add, size: 16, color: AppColors.blue),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Tap map or pick a destination above',
                      style: TextStyle(fontSize: 12, color: AppColors.blue)),
                ),
              ],
            ),
          )
        else if (_routeLoading)
          const Padding(
            padding: EdgeInsets.all(12),
            child: Center(child: ProgressRing(strokeWidth: 2)),
          )
        else if (hasRoute) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                color: AppColors.green.withAlpha(20),
                borderRadius: BorderRadius.circular(10)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                Column(children: [
                  Text('${totalDist.toStringAsFixed(2)} km',
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: c.textStrong)),
                  Text('Distance', style: TextStyle(fontSize: 10, color: c.textFaint)),
                ]),
                Container(width: 1, height: 28, color: c.borderSubtle),
                Column(children: [
                  Text('$totalTime min',
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: c.textStrong)),
                  Text('Time', style: TextStyle(fontSize: 10, color: c.textFaint)),
                ]),
                Container(width: 1, height: 28, color: c.borderSubtle),
                if (isMultiModal && totalFare > 0) ...[
                  Column(children: [
                    Text('₱${totalFare.toStringAsFixed(0)}',
                        style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: AppColors.amber)),
                    Text('Fare', style: TextStyle(fontSize: 10, color: c.textFaint)),
                  ]),
                  Container(width: 1, height: 28, color: c.borderSubtle),
                ],
                Column(children: [
                  Text('${_routeStops.length}',
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: c.textStrong)),
                  Text(_routeStops.length == 1 ? 'Stop' : 'Stops',
                      style: TextStyle(fontSize: 10, color: c.textFaint)),
                ]),
              ],
            ),
          ),
          // Multi-modal leg detail
          if (isMultiModal) ...[
            const SizedBox(height: 8),
            ..._multiModalLegs.expand((mm) => mm.legs).map((leg) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  Container(
                    width: 8, height: 8,
                    decoration: BoxDecoration(
                        color: _modeColor(leg.mode), shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                      child: Text(leg.instruction,
                          style: TextStyle(fontSize: 11, color: c.text),
                          overflow: TextOverflow.ellipsis)),
                  const SizedBox(width: 8),
                  Text('${leg.duration}m',
                      style: TextStyle(fontSize: 10, color: c.textFaint)),
                  if (leg.fare > 0) ...[
                    const SizedBox(width: 6),
                    Text('₱${leg.fare.toStringAsFixed(0)}',
                        style: TextStyle(
                            fontSize: 10,
                            color: AppColors.amber,
                            fontWeight: FontWeight.w600)),
                  ],
                ],
              ),
            )),
          ],
          const SizedBox(height: 10),

          // Navigate / Stop button
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _isNavigating ? _stopNavigation : _startNavigation,
              style: ButtonStyle(
                backgroundColor: WidgetStateProperty.all(
                  _isNavigating ? const Color(0xFFDC2626) : AppColors.green,
                ),
                shape: WidgetStateProperty.all(
                    RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                padding: WidgetStateProperty.all(
                    const EdgeInsets.symmetric(vertical: 12)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    _isNavigating ? FluentIcons.stop : FluentIcons.location,
                    size: 16, color: Colors.white,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _isNavigating ? 'Stop Navigation' : 'Start Navigation',
                    style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.white),
                  ),
                ],
              ),
            ),
          ),
          if (_isAiItinerary) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: Button(
                onPressed: _saveItinerary,
                style: ButtonStyle(
                  backgroundColor:
                      WidgetStateProperty.all(AppColors.purple.withAlpha(30)),
                  shape: WidgetStateProperty.all(RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(color: AppColors.purple.withAlpha(80)),
                  )),
                  padding: WidgetStateProperty.all(
                      const EdgeInsets.symmetric(vertical: 11)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(FluentIcons.save, size: 14, color: AppColors.purple),
                    const SizedBox(width: 8),
                    Text('Save Itinerary',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.purple)),
                  ],
                ),
              ),
            ),
          ],
        ],

        if (!isOnline && _routeStops.isNotEmpty && _routeLegs.isEmpty) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: AppColors.amber.withAlpha(20),
                borderRadius: BorderRadius.circular(10)),
            child: Row(
              children: [
                Icon(FluentIcons.cloud_not_synced, size: 14, color: AppColors.amber),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Route calculation requires internet',
                      style: TextStyle(fontSize: 11, color: AppColors.amber)),
                ),
              ],
            ),
          ),
        ],

        if (_routeError != null) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: const Color(0xFFDC2626).withAlpha(20),
                borderRadius: BorderRadius.circular(10)),
            child: Row(
              children: [
                const Icon(FluentIcons.error_badge, size: 14, color: Color(0xFFDC2626)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(_routeError!,
                      style: const TextStyle(fontSize: 11, color: Color(0xFFFCA5A5))),
                ),
              ],
            ),
          ),
        ],

        SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
      ],
    );
  }

  // ── Chip builders ─────────────────────────────────────────────────────────

  Widget _transportChip(String value, String label, IconData icon) {
    final c = context.appColors;
    final selected = _transportMode == value;
    return GestureDetector(
      onTap: () {
        setState(() => _transportMode = value);
        if (_routeStops.isNotEmpty) _calculateRoute(_routeStops);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AppColors.red500 : c.surfaceElevated,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
              color: selected ? AppColors.red500 : c.borderSubtle),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 12,
                color: selected ? Colors.white : c.textMuted),
            const SizedBox(width: 4),
            Text(label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  color: selected ? Colors.white : c.textMuted,
                )),
          ],
        ),
      ),
    );
  }

  Widget _optimizeChip(String value, String label) {
    final c = context.appColors;
    final isSelected = _optimizeFor == value;
    return GestureDetector(
      onTap: () {
        setState(() => _optimizeFor = value);
        if (_routeStops.isNotEmpty) _calculateRoute(_routeStops);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.red500 : c.surfaceElevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: isSelected ? AppColors.red500 : c.borderSubtle),
        ),
        child: Text(label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
              color: isSelected ? Colors.white : c.textMuted,
            )),
      ),
    );
  }
}

// ── Route stop model ──────────────────────────────────────────────────────────

class _RouteStop {
  final LatLng position;
  final String name;
  final String? destId;
  _RouteStop({required this.position, required this.name, this.destId});
}

// ── Navigation arrow painter ──────────────────────────────────────────────────
//
// Draws an upward-pointing navigation chevron (tip at top).
// The map is rotated by -heading so the user's direction always faces "up",
// meaning this arrow always visually points in the direction of travel.

class _NavArrowPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final path = Path()
      ..moveTo(w * 0.50, h * 0.04)  // tip
      ..lineTo(w * 0.92, h * 0.88)  // bottom-right
      ..lineTo(w * 0.50, h * 0.64)  // inner notch
      ..lineTo(w * 0.08, h * 0.88)  // bottom-left
      ..close();

    // Drop shadow
    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.black.withAlpha(60)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
    );
    // Blue fill
    canvas.drawPath(path, Paint()..color = const Color(0xFF2563EB));
    // White border
    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
