import 'dart:async';
import 'dart:math';
import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter/material.dart'
    show
        DraggableScrollableController,
        DraggableScrollableNotification,
        DraggableScrollableSheet,
        Scaffold;
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../models/destination.dart';
import '../../models/itinerary.dart';
import '../../models/route_result.dart';
import '../../services/api_service.dart';
import '../../services/connectivity_service.dart';
import '../../services/location_service.dart';
import '../../services/navigation_ws_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/toast_overlay.dart';
import 'nearby_recommendations_sheet.dart';

class DayDetailScreen extends StatefulWidget {
  final DayItinerary day;
  final List<DayItinerary> allDays;
  const DayDetailScreen({super.key, required this.day, this.allDays = const []});

  @override
  State<DayDetailScreen> createState() => _DayDetailScreenState();
}

class _DayDetailScreenState extends State<DayDetailScreen> {
  late int _currentIndex;
  late Map<int, List<ItineraryStop>> _dayStops;

  // Arrival / recs
  int _activeStopIdx = -1;
  bool _showArrivedBanner = false;
  String _arrivedName = '';
  Timer? _bannerTimer;
  StreamSubscription<String>? _arrivalSub;
  bool _loadingRecs = false;

  // Road geometry loading
  bool _routeLoading = false;

  // On-device navigation state
  LocationService? _locationService;
  LatLng? _snappedPosition;     // user dot snapped onto road
  bool _isOffRoute = false;
  bool _rerouting = false;
  int _offRouteCount = 0;
  DateTime? _lastRerouteTime;
  DateTime? _lastHandledPositionTime;
  String? _currentInstruction;  // current turn-by-turn step text

  // WebSocket + TTS
  StreamSubscription<NavRouteUpdate>? _wsSub;
  StreamSubscription<NavProgressUpdate>? _progressSub;
  late final FlutterTts _tts;
  String? _navSessionId;
  int _etaMinutes = 0;
  Timer? _wsLocationTimer;

  // Camera follow mode — disabled while user is pinching/panning
  bool _followMode = false;
  Timer? _followResumeTimer;

  final MapController _mapController = MapController();
  final DraggableScrollableController _sheetController = DraggableScrollableController();
  bool _sheetExpanded = false;

  static const double _sheetMinExtent = 0.13;
  static const double _sheetSnapLow   = 0.38;
  static const double _sheetSnapHigh  = 0.62;

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.allDays.indexWhere((d) => d.dayNumber == widget.day.dayNumber);
    if (_currentIndex < 0) _currentIndex = 0;
    _dayStops = {
      for (final d in widget.allDays.isNotEmpty ? widget.allDays : [widget.day])
        d.dayNumber: List<ItineraryStop>.from(d.stops),
    };
    _tts = FlutterTts();
    _tts.setLanguage('en-US');
    _tts.setSpeechRate(0.9);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initTracking();
      _fitMapToStops();
      _fetchRoadGeometry();   // draws actual roads on map
      _initNavWs();
    });
  }

  @override
  void dispose() {
    _locationService?.removeListener(_handleLocationUpdate);
    _arrivalSub?.cancel();
    _bannerTimer?.cancel();
    _wsSub?.cancel();
    _progressSub?.cancel();
    _wsLocationTimer?.cancel();
    _followResumeTimer?.cancel();
    _tts.stop();
    if (mounted) context.read<NavigationWsService>().endNavigation();
    _sheetController.dispose();
    super.dispose();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TTS
  // ─────────────────────────────────────────────────────────────────────────────

  Future<void> _speak(String text) async {
    await _tts.stop();
    await _tts.speak(text);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Road geometry — fetch real roads for every leg
  // ─────────────────────────────────────────────────────────────────────────────

  Future<void> _fetchRoadGeometry() async {
    if (!mounted) return;
    final stops = _currentDayStops;
    if (stops.isEmpty) return;

    final loc  = context.read<LocationService>();
    final api  = context.read<ApiService>();
    final pos  = loc.currentPosition;

    setState(() => _routeLoading = true);

    try {
      // Chain from user position → stop[0] → stop[1] → …
      LatLng from = pos != null
          ? LatLng(pos.latitude, pos.longitude)
          : LatLng(stops.first.destination.latitude, stops.first.destination.longitude);

      final dayNum  = _day.dayNumber;
      final updated = List<ItineraryStop>.from(_dayStops[dayNum] ?? stops);

      for (int i = 0; i < stops.length; i++) {
        final to = LatLng(stops[i].destination.latitude, stops[i].destination.longitude);
        try {
          final res = await api.post('/routes/calculate-gps', body: {
            'start_lat': from.latitude,
            'start_lon': from.longitude,
            'end_lat':   to.latitude,
            'end_lon':   to.longitude,
            'optimize_for': 'distance',
          }, auth: true);

          if (!mounted) return;

          if (res['success'] == true && res['data'] != null) {
            final leg = RouteResult.fromJson(res['data'] as Map<String, dynamic>);
            final geo = leg.routeGeometry;
            if (geo != null && geo.length >= 2) {
              updated[i] = ItineraryStop(
                destination: stops[i].destination,
                visitDuration: stops[i].visitDuration,
                cumulativeTime: stops[i].cumulativeTime,
                dayNumber: stops[i].dayNumber,
                legDistance: leg.totalDistance,
                legTravelTime: leg.estimatedTime,
                routeGeometry: geo,
              );
              // Use the road-snapped last point as start of next leg
              from = LatLng(geo.last[0], geo.last[1]);

              // Update current instruction for the first (active) leg
              if (i == (_activeStopIdx < 0 ? 0 : _activeStopIdx + 1) &&
                  leg.steps.isNotEmpty) {
                setState(() => _currentInstruction = leg.steps.first.instruction);
              }
            } else {
              from = to;
            }
          } else {
            from = to;
          }
        } catch (_) {
          from = to; // non-fatal: just use straight line for this leg
        }

        if (mounted) setState(() => _dayStops[dayNum] = List.from(updated));
      }
    } finally {
      if (mounted) setState(() => _routeLoading = false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Location listener — camera follow + off-route detection + auto-reroute
  // ─────────────────────────────────────────────────────────────────────────────

  void _handleLocationUpdate() {
    final ls = _locationService;
    if (ls == null || !mounted) return;

    final pos = ls.currentPosition;
    if (pos == null) return;

    final userLatLng = LatLng(pos.latitude, pos.longitude);

    // ── Camera: follow user + rotate map to heading (only if follow mode on) ─
    if (_followMode) {
      final display = _snappedPosition ?? userLatLng;
      try {
        _mapController.moveAndRotate(display, _mapController.camera.zoom, -ls.heading);
      } catch (_) {}
    }

    // ── Snapping + off-route: only process new GPS positions ─────────────────
    final posTime = ls.lastPositionUpdate;
    if (posTime == null || posTime == _lastHandledPositionTime) return;
    _lastHandledPositionTime = posTime;

    final polyline = _flatRoutePolyline();
    if (polyline.length < 2) {
      setState(() => _snappedPosition = userLatLng);
      return;
    }

    final snapped = _snapToPolyline(userLatLng, polyline);
    final distOff  = _distMeters(userLatLng, snapped);
    setState(() => _snappedPosition = snapped);

    if (distOff > 60) {
      _offRouteCount++;
      if (_offRouteCount >= 2 && !_rerouting) {
        final now = DateTime.now();
        final canReroute = _lastRerouteTime == null ||
            now.difference(_lastRerouteTime!).inSeconds >= 15;
        if (canReroute) {
          _lastRerouteTime = now;
          _offRouteCount   = 0;
          setState(() { _isOffRoute = true; _rerouting = true; });
          AppToast.warning(context, 'Off route — recalculating…');
          _rerouteFromHere(userLatLng).whenComplete(() {
            if (mounted) setState(() => _rerouting = false);
          });
        }
      }
    } else {
      _offRouteCount = 0;
      if (_isOffRoute) setState(() => _isOffRoute = false);
    }

    // ── Send location to WebSocket server ────────────────────────────────────
    if (_navSessionId != null) {
      context.read<NavigationWsService>().sendLocationUpdate(
        latitude: pos.latitude, longitude: pos.longitude,
        heading: pos.heading, speed: pos.speed,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Reroute from current position to remaining stops
  // ─────────────────────────────────────────────────────────────────────────────

  Future<void> _rerouteFromHere(LatLng userLatLng) async {
    if (!mounted) return;
    _speak('Rerouting.');

    final api     = context.read<ApiService>();
    final dayNum  = _day.dayNumber;
    final stops   = _currentDayStops;
    // Reroute only remaining (unvisited) stops
    final firstRemaining = (_activeStopIdx + 1).clamp(0, stops.length);
    if (firstRemaining >= stops.length) return;

    final updated = List<ItineraryStop>.from(stops);
    LatLng from = userLatLng;

    for (int i = firstRemaining; i < stops.length; i++) {
      final to = LatLng(stops[i].destination.latitude, stops[i].destination.longitude);
      try {
        final res = await api.post('/routes/calculate-gps', body: {
          'start_lat': from.latitude,
          'start_lon': from.longitude,
          'end_lat':   to.latitude,
          'end_lon':   to.longitude,
          'optimize_for': 'distance',
        }, auth: true);

        if (!mounted) return;

        if (res['success'] == true && res['data'] != null) {
          final leg = RouteResult.fromJson(res['data'] as Map<String, dynamic>);
          final geo = leg.routeGeometry;
          if (geo != null && geo.length >= 2) {
            updated[i] = ItineraryStop(
              destination: stops[i].destination,
              visitDuration: stops[i].visitDuration,
              cumulativeTime: stops[i].cumulativeTime,
              dayNumber: stops[i].dayNumber,
              legDistance: leg.totalDistance,
              legTravelTime: leg.estimatedTime,
              routeGeometry: geo,
            );
            from = LatLng(geo.last[0], geo.last[1]);
            if (i == firstRemaining && leg.steps.isNotEmpty) {
              setState(() => _currentInstruction = leg.steps.first.instruction);
            }
          } else {
            from = to;
          }
        } else {
          from = to;
        }
      } catch (_) {
        from = to;
      }
    }

    if (mounted) {
      setState(() {
        _dayStops[dayNum] = updated;
        _isOffRoute = false;
      });
      _speak('Route updated. Continue to ${stops[firstRemaining].destination.name}.');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Route geometry helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /// Concatenates all stop leg geometries into one flat polyline.
  List<LatLng> _flatRoutePolyline() {
    final stops = _currentDayStops;
    final pts = <LatLng>[];
    for (final s in stops) {
      if (s.routeGeometry != null) {
        pts.addAll(s.routeGeometry!.map((c) => LatLng(c[0], c[1])));
      }
    }
    return pts;
  }

  LatLng _snapToPolyline(LatLng point, List<LatLng> polyline) {
    if (polyline.length < 2) return point;
    var minDist = double.infinity;
    var snapped = polyline.first;
    for (int i = 0; i < polyline.length - 1; i++) {
      final candidate = _nearestOnSegment(point, polyline[i], polyline[i + 1]);
      final d = _distMeters(point, candidate);
      if (d < minDist) { minDist = d; snapped = candidate; }
    }
    return snapped;
  }

  LatLng _nearestOnSegment(LatLng p, LatLng a, LatLng b) {
    final dx = b.latitude  - a.latitude;
    final dy = b.longitude - a.longitude;
    if (dx == 0 && dy == 0) return a;
    final t = ((p.latitude  - a.latitude)  * dx +
               (p.longitude - a.longitude) * dy) / (dx * dx + dy * dy);
    final tc = t.clamp(0.0, 1.0);
    return LatLng(a.latitude + tc * dx, a.longitude + tc * dy);
  }

  double _distMeters(LatLng a, LatLng b) {
    const R = 6371000.0;
    final dLat = (b.latitude  - a.latitude)  * pi / 180;
    final dLon = (b.longitude - a.longitude) * pi / 180;
    final sl = sin(dLat / 2), sln = sin(dLon / 2);
    final x  = sl * sl + cos(a.latitude * pi / 180) * cos(b.latitude * pi / 180) * sln * sln;
    return R * 2 * atan2(sqrt(x), sqrt(1 - x));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WebSocket navigation
  // ─────────────────────────────────────────────────────────────────────────────

  void _initNavWs() {
    if (!mounted) return;
    final nav = context.read<NavigationWsService>();
    nav.connect();

    _navSessionId = Random().nextInt(0x7fffffff).toRadixString(16) +
        Random().nextInt(0x7fffffff).toRadixString(16);

    final stops = _currentDayStops;
    nav.announceItinerary(
      title: _day.clusterName ?? 'Day ${_day.dayNumber} Trip',
      stopCount: stops.length,
    );

    if (stops.isNotEmpty) {
      final dest = stops.last.destination;
      nav.startNavigation(
        sessionId: _navSessionId!,
        route: {'path': [], 'roads': [], 'steps': []},
        destLat: dest.latitude,
        destLon: dest.longitude,
      );
      setState(() => _followMode = true);
      _speak('Navigation started. Day ${_day.dayNumber}, ${stops.length} stops.');
    }

    // Server-side reroute update (backup to on-device detection)
    _wsSub = nav.routeUpdates.listen((update) {
      if (!mounted || !_rerouting) return; // only apply if on-device hasn't already handled it
      setState(() {
        if (_activeStopIdx >= 0 && _activeStopIdx < _currentDayStops.length) {
          final dayNum = _day.dayNumber;
          final list   = List<ItineraryStop>.from(_dayStops[dayNum] ?? []);
          final idx    = _activeStopIdx;
          list[idx] = ItineraryStop(
            destination: list[idx].destination,
            visitDuration: list[idx].visitDuration,
            cumulativeTime: list[idx].cumulativeTime,
            dayNumber: list[idx].dayNumber,
            legDistance: update.totalDistance,
            routeGeometry: update.path,
          );
          _dayStops[dayNum] = list;
        }
      });
    });

    // ETA from server progress events
    _progressSub = nav.progressUpdates.listen((p) {
      if (!mounted) return;
      final eta = (p.distanceToNext / 40.0 * 60).round();
      if (eta != _etaMinutes) setState(() => _etaMinutes = eta);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Arrival tracking
  // ─────────────────────────────────────────────────────────────────────────────

  Future<void> _initTracking() async {
    if (!mounted) return;
    final loc = context.read<LocationService>();

    final granted = await loc.checkPermission();
    if (!granted) {
      if (!mounted) return;
      await showDialog(
        context: context,
        builder: (ctx) => ContentDialog(
          title: const Text('Location Required'),
          content: const Text(
            'AIRAT-NA needs your location to show your position on the map, '
            'detect arrivals, and auto-reroute if you go off track.\n\n'
            'Please enable location permission in your device settings.',
          ),
          actions: [
            Button(
              child: const Text('Dismiss'),
              onPressed: () => Navigator.pop(ctx),
            ),
          ],
        ),
      );
      return;
    }

    loc.startTracking();
    for (final s in _currentDayStops) {
      loc.monitorDestination(s.destination.id, s.destination.name,
          s.destination.latitude, s.destination.longitude);
    }
    _arrivalSub = loc.arrivedStream.listen(_onArrived);

    // Register location listener for camera follow + off-route detection
    _locationService = loc;
    loc.addListener(_handleLocationUpdate);
    setState(() => _followMode = true);
  }

  void _onArrived(String destId) {
    final stops = _currentDayStops;
    final idx = stops.indexWhere((s) => s.destination.id == destId);
    if (idx < 0) return;
    setState(() {
      _activeStopIdx       = idx;
      _arrivedName         = stops[idx].destination.name;
      _showArrivedBanner   = true;
      _etaMinutes          = 0;
      _currentInstruction  = null;
      _isOffRoute          = false;
    });
    _bannerTimer?.cancel();
    _bannerTimer = Timer(const Duration(seconds: 5),
        () { if (mounted) setState(() => _showArrivedBanner = false); });
    _speak("You've arrived at ${stops[idx].destination.name}.");
    _fetchNearbyRecs(stops[idx]);
    _animateTo(LatLng(stops[idx].destination.latitude, stops[idx].destination.longitude));
  }

  Future<void> _fetchNearbyRecs(ItineraryStop stop) async {
    final isOnline = context.read<ConnectivityService>().isOnline;
    if (!isOnline) return;
    setState(() => _loadingRecs = true);
    try {
      final api = context.read<ApiService>();
      final res = await api.post('/ai/recommend/nearby', body: {
        'lat': stop.destination.latitude,
        'lon': stop.destination.longitude,
        'visited_ids': _currentDayStops.map((s) => s.destination.id).toList(),
        if (stop.destination.clusterId != null) 'cluster_id': stop.destination.clusterId,
      }, auth: true);
      if (!mounted) return;
      if (res['success'] == true && res['data'] != null) {
        final recs = NearbyRecommendations.fromJson(
            Map<String, dynamic>.from(res['data'] as Map));
        if (!recs.isEmpty) {
          await NearbyRecommendationsSheet.show(context, recs, _insertDestination);
        }
      }
    } catch (_) {
      // non-critical
    } finally {
      if (mounted) setState(() => _loadingRecs = false);
    }
  }

  void _manuallyAdvance(int idx) {
    final stops = _currentDayStops;
    if (idx < 0 || idx >= stops.length) return;
    _onArrived(stops[idx].destination.id);
  }

  void _insertDestination(Destination dest) {
    final dayNum = _day.dayNumber;
    final stops  = List<ItineraryStop>.from(_dayStops[dayNum] ?? []);
    final insertAt = (_activeStopIdx >= 0 ? _activeStopIdx + 1 : stops.length)
        .clamp(0, stops.length);
    stops.insert(insertAt, ItineraryStop(
      destination: dest,
      visitDuration: dest.averageVisitDuration > 0 ? dest.averageVisitDuration : 60,
      cumulativeTime: insertAt > 0
          ? stops[insertAt - 1].cumulativeTime + stops[insertAt - 1].visitDuration
          : 0,
      dayNumber: dayNum,
    ));
    context.read<LocationService>()
        .monitorDestination(dest.id, dest.name, dest.latitude, dest.longitude);
    setState(() {
      _dayStops[dayNum] = stops;
      if (insertAt <= _activeStopIdx) _activeStopIdx++;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Map helpers
  // ─────────────────────────────────────────────────────────────────────────────

  void _fitMapToStops() {
    // Exit follow mode so user can freely pan/zoom
    if (_followMode) setState(() => _followMode = false);
    final stops = _currentDayStops;
    if (stops.isEmpty) return;
    try {
      if (stops.length == 1) {
        _mapController.move(
            LatLng(stops.first.destination.latitude, stops.first.destination.longitude), 14);
        return;
      }
      final lats = stops.map((s) => s.destination.latitude);
      final lons = stops.map((s) => s.destination.longitude);
      final bounds = LatLngBounds(
        LatLng(lats.reduce((a, b) => a < b ? a : b), lons.reduce((a, b) => a < b ? a : b)),
        LatLng(lats.reduce((a, b) => a > b ? a : b), lons.reduce((a, b) => a > b ? a : b)),
      );
      _mapController.fitCamera(
        CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(72)),
      );
    } catch (_) {}
  }

  void _toggleFollow() {
    setState(() => _followMode = !_followMode);
    if (_followMode) {
      // Snap camera to user immediately
      final ls = _locationService;
      if (ls != null) {
        final pos = ls.currentPosition;
        if (pos != null) {
          try {
            _mapController.moveAndRotate(
              _snappedPosition ?? LatLng(pos.latitude, pos.longitude),
              15,
              -ls.heading,
            );
          } catch (_) {}
        }
      }
    }
  }

  void _animateTo(LatLng pos) {
    try { _mapController.move(pos, 15); } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Derived getters
  // ─────────────────────────────────────────────────────────────────────────────

  List<ItineraryStop> get _currentDayStops => _dayStops[_day.dayNumber] ?? [];

  DayItinerary get _day {
    if (widget.allDays.isNotEmpty && _currentIndex < widget.allDays.length) {
      final orig = widget.allDays[_currentIndex];
      return DayItinerary(
        dayNumber: orig.dayNumber, clusterName: orig.clusterName,
        stops: _dayStops[orig.dayNumber] ?? orig.stops,
        estimatedTravelTime: orig.estimatedTravelTime,
        estimatedVisitTime: orig.estimatedVisitTime,
        estimatedTotalTime: orig.estimatedTotalTime,
        estimatedCost: orig.estimatedCost,
      );
    }
    final orig = widget.day;
    return DayItinerary(
      dayNumber: orig.dayNumber, clusterName: orig.clusterName,
      stops: _dayStops[orig.dayNumber] ?? orig.stops,
      estimatedTravelTime: orig.estimatedTravelTime,
      estimatedVisitTime: orig.estimatedVisitTime,
      estimatedTotalTime: orig.estimatedTotalTime,
      estimatedCost: orig.estimatedCost,
    );
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final day = _day;
    final stops = _currentDayStops;
    final loc = context.watch<LocationService>();
    final userPos = loc.currentPosition;
    final multiDay = widget.allDays.length > 1;

    // Build polyline layers — color-coded by status
    // completed legs = green, active next leg = bright red, future = muted
    final nextLegIdx = _activeStopIdx + 1;
    final polylines = <Polyline>[];
    for (int i = 0; i < stops.length; i++) {
      final stop = stops[i];
      List<LatLng> pts;
      if (stop.routeGeometry != null && stop.routeGeometry!.length >= 2) {
        pts = stop.routeGeometry!.map((c) => LatLng(c[0], c[1])).toList();
      } else if (i == 0 && userPos != null) {
        pts = [LatLng(userPos.latitude, userPos.longitude),
               LatLng(stop.destination.latitude, stop.destination.longitude)];
      } else if (i > 0) {
        pts = [LatLng(stops[i-1].destination.latitude, stops[i-1].destination.longitude),
               LatLng(stop.destination.latitude, stop.destination.longitude)];
      } else {
        continue;
      }
      final isDone   = _activeStopIdx >= 0 && i <= _activeStopIdx;
      final isNext   = i == nextLegIdx;
      final Color color;
      final double width;
      if (isDone) {
        color = AppColors.green.withAlpha(180);
        width = 4;
      } else if (isNext) {
        color = _isOffRoute ? AppColors.amber : AppColors.red500;
        width = 5;
      } else {
        color = AppColors.red500.withAlpha(80);
        width = 3;
      }
      polylines.add(Polyline(points: pts, strokeWidth: width, color: color));
    }

    // Markers
    final markers = <Marker>[];
    for (int i = 0; i < stops.length; i++) {
      final s = stops[i];
      final isActive = i == _activeStopIdx;
      final isDone = _activeStopIdx >= 0 && i < _activeStopIdx;
      markers.add(Marker(
        point: LatLng(s.destination.latitude, s.destination.longitude),
        width: isActive ? 48 : 38,
        height: isActive ? 58 : 46,
        alignment: Alignment.bottomCenter,
        child: GestureDetector(
          onTap: () => _animateTo(LatLng(s.destination.latitude, s.destination.longitude)),
          child: _StopPin(
            index: i + 1,
            isActive: isActive,
            isDone: isDone,
          ),
        ),
      ));
    }

    // User location marker — prefer road-snapped position
    final displayPos = _snappedPosition ??
        (userPos != null ? LatLng(userPos.latitude, userPos.longitude) : null);
    if (displayPos != null) {
      markers.add(Marker(
        point: displayPos,
        width: 20, height: 20,
        child: _UserDot(),
      ));
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // ── Full-screen map ────────────────────────────────────────────────
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: stops.isNotEmpty
                  ? LatLng(stops.first.destination.latitude, stops.first.destination.longitude)
                  : const LatLng(10.3157, 123.8854),
              initialZoom: 12,
              maxZoom: 18,
              minZoom: 8,
              onMapEvent: (event) {
                // Pause follow mode when user starts a drag or pinch gesture
                final src = event.source;
                final isUserGesture = src == MapEventSource.dragStart ||
                    src == MapEventSource.multiFingerGestureStart ||
                    src == MapEventSource.scrollWheel;
                if (isUserGesture) {
                  if (_followMode) setState(() => _followMode = false);
                  _followResumeTimer?.cancel();
                  // Auto-resume follow after 5 s of inactivity
                  _followResumeTimer = Timer(const Duration(seconds: 5), () {
                    if (mounted && _locationService?.currentPosition != null) {
                      setState(() => _followMode = true);
                    }
                  });
                }
              },
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.airatna.app',
                errorTileCallback: (tile, error, stackTrace) {},
              ),
              PolylineLayer(polylines: polylines),
              MarkerLayer(markers: markers, rotate: false),
            ],
          ),

          // ── Top gradient overlay ───────────────────────────────────────────
          Positioned(
            top: 0, left: 0, right: 0,
            height: 160,
            child: IgnorePointer(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.black.withAlpha(180), Colors.transparent],
                  ),
                ),
              ),
            ),
          ),

          // ── Top bar ───────────────────────────────────────────────────────
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                  child: Row(
                    children: [
                      // Back
                      _MapButton(
                        icon: FluentIcons.chevron_left,
                        onTap: () => Navigator.pop(context),
                      ),
                      const SizedBox(width: 10),
                      // Title
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: Colors.black.withAlpha(160),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text('Day ${day.dayNumber}',
                                  style: const TextStyle(
                                      fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
                              if (day.clusterName != null)
                                Text(day.clusterName!,
                                    style: const TextStyle(fontSize: 11, color: Color(0xB3FFFFFF))),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      // Fit map / follow toggle
                      _MapButton(
                        icon: FluentIcons.full_screen,
                        onTap: _fitMapToStops,
                      ),
                      const SizedBox(width: 8),
                      _MapButton(
                        icon: _followMode
                            ? FluentIcons.location_fill
                            : FluentIcons.location,
                        onTap: _toggleFollow,
                        active: _followMode,
                      ),
                      if (_loadingRecs) ...[
                        const SizedBox(width: 8),
                        SizedBox(
                          width: 18, height: 18,
                          child: ProgressRing(strokeWidth: 2, activeColor: AppColors.red400),
                        ),
                      ],
                    ],
                  ),
                ),
                // Day tabs
                if (multiDay) ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 34,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: widget.allDays.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 6),
                      itemBuilder: (context, i) {
                        final sel = i == _currentIndex;
                        return GestureDetector(
                          onTap: () {
                            setState(() { _currentIndex = i; _activeStopIdx = -1; });
                            final loc = context.read<LocationService>();
                            for (final s in _currentDayStops) {
                              loc.monitorDestination(s.destination.id, s.destination.name,
                                  s.destination.latitude, s.destination.longitude);
                            }
                            WidgetsBinding.instance
                                .addPostFrameCallback((_) => _fitMapToStops());
                          },
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                            decoration: BoxDecoration(
                              color: sel ? AppColors.red500 : Colors.black.withAlpha(160),
                              borderRadius: BorderRadius.circular(17),
                              border: Border.all(
                                color: sel ? AppColors.red500 : Colors.white.withAlpha(60),
                              ),
                            ),
                            child: Text('Day ${widget.allDays[i].dayNumber}',
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: sel ? Colors.white : const Color(0xB3FFFFFF))),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ],
            ),
          ),

          // ── Arrived banner ─────────────────────────────────────────────────
          if (_showArrivedBanner)
            Positioned(
              top: MediaQuery.of(context).padding.top + 70,
              left: 16, right: 16,
              child: _ArrivedBanner(
                destinationName: _arrivedName,
                onDismiss: () => setState(() => _showArrivedBanner = false),
              ).animate()
                .slideY(begin: -0.5, end: 0, duration: 350.ms, curve: Curves.easeOutBack)
                .fadeIn(duration: 250.ms),
            ),

          // ── Rerouting banner ───────────────────────────────────────────────
          if (_rerouting)
            Positioned(
              top: MediaQuery.of(context).padding.top + 70,
              left: 16, right: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.black.withAlpha(200),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.amber.withAlpha(120)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(width: 14, height: 14, child: ProgressRing(strokeWidth: 2, activeColor: AppColors.amber)),
                    const SizedBox(width: 10),
                    const Text('Recalculating route…',
                        style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                  ],
                ),
              ).animate().fadeIn(duration: 200.ms),
            ),

          // ── Off-route chip ─────────────────────────────────────────────────
          if (_isOffRoute && !_rerouting)
            Positioned(
              top: MediaQuery.of(context).padding.top + 70,
              left: 16, right: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.amber.withAlpha(220),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(FluentIcons.warning, size: 14, color: Colors.white),
                    const SizedBox(width: 8),
                    const Text('Off route', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                  ],
                ),
              ).animate().fadeIn(duration: 200.ms),
            ),

          // ── Route loading indicator ────────────────────────────────────────
          if (_routeLoading)
            Positioned(
              bottom: MediaQuery.of(context).size.height * _sheetSnapLow + 12,
              left: 0, right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.black.withAlpha(180),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(width: 12, height: 12, child: ProgressRing(strokeWidth: 2, activeColor: AppColors.red400)),
                      const SizedBox(width: 8),
                      const Text('Loading road data…',
                          style: TextStyle(color: Colors.white, fontSize: 12)),
                    ],
                  ),
                ),
              ).animate().fadeIn(duration: 300.ms),
            ),

          // ── Current instruction chip ───────────────────────────────────────
          if (_currentInstruction != null && !_rerouting && !_showArrivedBanner)
            Positioned(
              bottom: MediaQuery.of(context).size.height * _sheetSnapLow + 12,
              left: 16, right: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.black.withAlpha(200),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.red500.withAlpha(100)),
                ),
                child: Row(
                  children: [
                    const Icon(FluentIcons.map_directions, size: 16, color: Colors.white),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _currentInstruction!,
                        style: const TextStyle(color: Colors.white, fontSize: 13),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn(duration: 250.ms),
            ),

          // ── Draggable bottom sheet ─────────────────────────────────────────
          DraggableScrollableSheet(
            controller: _sheetController,
            initialChildSize: _sheetSnapLow,
            minChildSize: _sheetMinExtent,
            maxChildSize: _sheetSnapHigh,
            snap: true,
            snapSizes: const [_sheetMinExtent, _sheetSnapLow, _sheetSnapHigh],
            builder: (context, scrollCtrl) {
              return NotificationListener<DraggableScrollableNotification>(
                onNotification: (n) {
                  final expanded = n.extent >= _sheetSnapHigh - 0.04;
                  if (expanded != _sheetExpanded) {
                    setState(() => _sheetExpanded = expanded);
                  }
                  return false;
                },
                child: Container(
                  decoration: BoxDecoration(
                    color: c.surface,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withAlpha(80), blurRadius: 20, offset: const Offset(0, -4)),
                    ],
                  ),
                  child: Column(
                    children: [
                      // Handle + summary bar
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () {
                          final target = _sheetExpanded ? _sheetSnapLow : _sheetSnapHigh;
                          _sheetController.animateTo(target,
                              duration: const Duration(milliseconds: 300),
                              curve: Curves.easeInOut);
                        },
                        child: _SheetHandle(day: day, c: c, etaMinutes: _etaMinutes),
                      ),
                      // Stop list
                      Expanded(
                        child: stops.isEmpty
                            ? Center(child: Text('No stops for this day',
                                style: TextStyle(color: c.textMuted, fontSize: 14)))
                            : ListView.builder(
                                controller: scrollCtrl,
                                padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                                itemCount: stops.length,
                                itemBuilder: (context, i) {
                                  final isActive = i == _activeStopIdx;
                                  final isNext = _activeStopIdx >= 0 ? i == _activeStopIdx + 1 : i == 0;
                                  return _StopTimelineItem(
                                    stop: stops[i],
                                    index: i,
                                    isLast: i == stops.length - 1,
                                    isActive: isActive,
                                    isNext: isNext,
                                    onTapPin: () {
                                      _animateTo(LatLng(
                                        stops[i].destination.latitude,
                                        stops[i].destination.longitude,
                                      ));
                                      _sheetController.animateTo(_sheetSnapLow,
                                          duration: const Duration(milliseconds: 250),
                                          curve: Curves.easeOut);
                                    },
                                    onMarkDone: isActive && i < stops.length - 1
                                        ? () => _manuallyAdvance(i + 1)
                                        : null,
                                    onStartHere: !isActive && isNext
                                        ? () => _manuallyAdvance(i)
                                        : null,
                                  ).animate()
                                      .fadeIn(delay: (60 * i).ms, duration: 300.ms);
                                },
                              ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

}

// ─── Map FAB-style button ─────────────────────────────────────────────────────

class _MapButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool active;
  const _MapButton({required this.icon, required this.onTap, this.active = false});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 40, height: 40,
      decoration: BoxDecoration(
        color: active ? AppColors.red500.withAlpha(200) : Colors.black.withAlpha(170),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: active ? AppColors.red400 : Colors.white.withAlpha(50)),
      ),
      child: Icon(icon, size: 16, color: Colors.white),
    ),
  );
}

// ─── User dot ─────────────────────────────────────────────────────────────────

class _UserDot extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
    width: 16, height: 16,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: const Color(0xFF3B82F6),
      border: Border.all(color: Colors.white, width: 2),
      boxShadow: [BoxShadow(color: const Color(0xFF3B82F6).withAlpha(120), blurRadius: 8)],
    ),
  );
}

// ─── Stop map pin ─────────────────────────────────────────────────────────────

class _StopPin extends StatelessWidget {
  final int index;
  final bool isActive;
  final bool isDone;
  const _StopPin({required this.index, this.isActive = false, this.isDone = false});

  @override
  Widget build(BuildContext context) {
    final bg = isActive
        ? AppColors.red500
        : isDone
            ? AppColors.green
            : const Color(0xFF1E293B);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: isActive ? 40 : 32,
          height: isActive ? 40 : 32,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: bg,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: [BoxShadow(color: bg.withAlpha(150), blurRadius: 8, offset: const Offset(0, 3))],
          ),
          child: Center(
            child: isDone
                ? Icon(FluentIcons.check_mark, size: isActive ? 16 : 13, color: Colors.white)
                : Text('$index',
                    style: TextStyle(
                        fontSize: isActive ? 15 : 12,
                        fontWeight: FontWeight.w800,
                        color: Colors.white)),
          ),
        ),
        // Pointer tip — border trick, no Path/CustomPainter needed
        Container(
          width: 0,
          height: 0,
          decoration: BoxDecoration(
            border: Border(
              left: const BorderSide(width: 5, color: Colors.transparent),
              right: const BorderSide(width: 5, color: Colors.transparent),
              top: BorderSide(width: 6, color: bg),
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Sheet handle + summary ───────────────────────────────────────────────────

class _SheetHandle extends StatelessWidget {
  final DayItinerary day;
  final AppColorScheme c;
  final int etaMinutes;
  const _SheetHandle({required this.day, required this.c, this.etaMinutes = 0});

  String _fmtMin(int m) {
    if (m < 60) return '${m}m';
    return '${m ~/ 60}h${m % 60 > 0 ? " ${m % 60}m" : ""}';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36, height: 4,
            decoration: BoxDecoration(
              color: c.borderMedium,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Day ${day.dayNumber}${day.clusterName != null ? " — ${day.clusterName}" : ""}',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.textStrong)),
                    Text('${day.stops.length} stop${day.stops.length != 1 ? "s" : ""}',
                        style: TextStyle(fontSize: 12, color: c.textFaint)),
                  ],
                ),
              ),
              _SumStat(icon: FluentIcons.car, label: _fmtMin(day.estimatedTravelTime),
                  color: AppColors.blue, c: c),
              const SizedBox(width: 10),
              _SumStat(icon: FluentIcons.clock, label: _fmtMin(day.estimatedTotalTime),
                  color: AppColors.green, c: c),
              const SizedBox(width: 10),
              _SumStat(icon: FluentIcons.money, label: '₱${day.estimatedCost.toStringAsFixed(0)}',
                  color: AppColors.amber, c: c),
              if (etaMinutes > 0) ...[
                const SizedBox(width: 10),
                _SumStat(icon: FluentIcons.location_fill, label: 'ETA ${_fmtMin(etaMinutes)}',
                    color: AppColors.red400, c: c),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _SumStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final AppColorScheme c;
  const _SumStat({required this.icon, required this.label, required this.color, required this.c});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
    decoration: BoxDecoration(
      color: color.withAlpha(20),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 11, color: color),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
      ],
    ),
  );
}

// ─── Arrived Banner ───────────────────────────────────────────────────────────

class _ArrivedBanner extends StatelessWidget {
  final String destinationName;
  final VoidCallback onDismiss;
  const _ArrivedBanner({required this.destinationName, required this.onDismiss});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    decoration: BoxDecoration(
      gradient: LinearGradient(
        colors: [AppColors.green.withAlpha(230), AppColors.green.withAlpha(180)],
      ),
      borderRadius: BorderRadius.circular(16),
      boxShadow: [BoxShadow(color: AppColors.green.withAlpha(80), blurRadius: 16, offset: const Offset(0, 4))],
    ),
    child: Row(
      children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(color: Colors.white.withAlpha(50), shape: BoxShape.circle),
          child: const Icon(FluentIcons.accept, size: 18, color: Colors.white),
        ).animate(onPlay: (c) => c.repeat(reverse: true))
            .scale(begin: const Offset(1, 1), end: const Offset(1.15, 1.15), duration: 600.ms),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text("You've arrived!",
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
              Text(destinationName,
                  style: const TextStyle(fontSize: 11, color: Color(0xB3FFFFFF)),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
        GestureDetector(
          onTap: onDismiss,
          child: const Icon(FluentIcons.cancel, size: 14, color: Color(0xB3FFFFFF)),
        ),
      ],
    ),
  );
}

// ─── Stop Timeline Item (in bottom sheet) ────────────────────────────────────

class _StopTimelineItem extends StatelessWidget {
  final ItineraryStop stop;
  final int index;
  final bool isLast;
  final bool isActive;
  final bool isNext;
  final VoidCallback? onMarkDone;
  final VoidCallback? onStartHere;
  final VoidCallback? onTapPin;

  const _StopTimelineItem({
    required this.stop,
    required this.index,
    required this.isLast,
    this.isActive = false,
    this.isNext = false,
    this.onMarkDone,
    this.onStartHere,
    this.onTapPin,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final dotColor = isActive
        ? AppColors.red500
        : isNext
            ? AppColors.blue
            : c.borderMedium;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Timeline column
          SizedBox(
            width: 32,
            child: Column(
              children: [
                const SizedBox(height: 4),
                GestureDetector(
                  onTap: onTapPin,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    width: isActive ? 28 : 24,
                    height: isActive ? 28 : 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isActive ? AppColors.red500 : c.surfaceElevated,
                      border: Border.all(color: dotColor, width: isActive ? 0 : 2),
                      boxShadow: isActive
                          ? [BoxShadow(color: AppColors.red500.withAlpha(80), blurRadius: 8)]
                          : [],
                    ),
                    child: Center(
                      child: Text(
                        '${index + 1}',
                        style: TextStyle(
                          fontSize: 11, fontWeight: FontWeight.w700,
                          color: isActive ? Colors.white : dotColor,
                        ),
                      ),
                    ),
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      decoration: BoxDecoration(
                        color: isActive ? AppColors.red500.withAlpha(60) : c.borderLight,
                        borderRadius: BorderRadius.circular(1),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          // Content
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isActive
                      ? AppColors.red500.withAlpha(15)
                      : c.surfaceElevated,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isActive
                        ? AppColors.red500.withAlpha(80)
                        : isNext
                            ? AppColors.blue.withAlpha(60)
                            : c.borderLight,
                    width: isActive ? 1.5 : 1,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            stop.destination.name,
                            style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w700,
                              color: isActive ? AppColors.red500 : c.textStrong,
                            ),
                          ),
                        ),
                        if (isActive)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppColors.red500,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text('Here',
                                style: TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w700)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 6,
                      children: [
                        if (stop.destination.categoryName != null)
                          _tag(stop.destination.categoryName!, c.textFaint, c),
                        _tag('${stop.visitDuration}min', AppColors.blue.withAlpha(180), c),
                        if (stop.legDistance > 0)
                          _tag('${stop.legDistance.toStringAsFixed(1)}km', c.textFaint, c),
                        if (stop.destination.entranceFeeLocal > 0)
                          _tag('₱${stop.destination.entranceFeeLocal.toStringAsFixed(0)}',
                              AppColors.amber.withAlpha(200), c),
                      ],
                    ),
                    if (onMarkDone != null || onStartHere != null) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          if (onMarkDone != null)
                            Expanded(
                              child: GestureDetector(
                                onTap: onMarkDone,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      colors: [AppColors.green, AppColors.green.withAlpha(200)],
                                    ),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: const Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(FluentIcons.check_mark, size: 12, color: Colors.white),
                                      SizedBox(width: 5),
                                      Text('Done here', style: TextStyle(
                                          fontSize: 12, color: Colors.white, fontWeight: FontWeight.w700)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          if (onStartHere != null)
                            Expanded(
                              child: GestureDetector(
                                onTap: onStartHere,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                  decoration: BoxDecoration(
                                    border: Border.all(color: AppColors.blue.withAlpha(180)),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(FluentIcons.location, size: 12,
                                          color: AppColors.blue.withAlpha(200)),
                                      const SizedBox(width: 5),
                                      Text(index == 0 ? "Start trip" : "I'm here",
                                          style: TextStyle(fontSize: 12,
                                              color: AppColors.blue.withAlpha(200),
                                              fontWeight: FontWeight.w600)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tag(String label, Color color, AppColorScheme c) => Text(
    label,
    style: TextStyle(fontSize: 11, color: color),
  );
}
