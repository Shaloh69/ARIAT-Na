import 'dart:async';
import 'dart:math';
import 'dart:ui';
import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:latlong2/latlong.dart' hide Path; // dart:ui also exports Path — prefer the canvas one
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../services/connectivity_service.dart';
import '../../services/location_service.dart';
import '../trips/nearby_recommendations_sheet.dart';
import '../../models/destination.dart';
import '../../models/route_result.dart';
import '../../models/transport_leg.dart';
import '../../theme/app_theme.dart';
import '../../widgets/toast_overlay.dart';
import '../../widgets/guest_wall.dart';
import 'itinerary_bottom_sheet.dart';

/// Safe numeric parse — handles both num and String values from JSON.
double _parseDouble(dynamic v, [double fallback = 0.0]) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? fallback;
  return fallback;
}

class MapScreen extends StatefulWidget {
  /// Single destination pre-loaded as the first stop.
  final Destination? destination;
  /// Multiple destinations pre-loaded (e.g. from AI generation).
  final List<Destination>? initialDestinations;
  /// Transport mode to pre-select (e.g. from AI setup params).
  final String? initialTransportMode;
  /// Show save-itinerary button (true when loaded from AI generation).
  final bool isAiItinerary;

  const MapScreen({
    super.key,
    this.destination,
    this.initialDestinations,
    this.initialTransportMode,
    this.isAiItinerary = false,
  });
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
  bool _showRoutePanel = true;
  bool _panelCollapsed = false; // true = peek bar, false = full panel
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

  // ── Arrival overlay ───────────────────────────────────────────────────────
  /// Destination currently being shown in the arrival card (null = hidden).
  Destination? _arrivedDestination;
  /// Stop index of the arrived destination (for "Stop N of M" label).
  int _arrivedStopIndex = 0;
  /// Subscription to LocationService.arrivedStream.
  StreamSubscription<String>? _arrivedSubscription;

  // ── GPS timeout fallback ──────────────────────────────────────────────────
  Timer? _gpsTimeoutTimer;

  // ── Commute navigation ────────────────────────────────────────────────────
  String _transportCategory = 'private'; // 'private' | 'commute'
  String _commuteSubMode = 'saver';       // 'saver' | 'grab_taxi'
  List<TransportLeg> _commuteLegs = [];
  int _currentLegIndex = 0;
  /// True once the 200m approaching announcement has fired for the current leg.
  bool _commuteApproachSpoken = false;

  // ── Turn-by-turn navigation (private car) ────────────────────────────────
  late final FlutterTts _tts;
  String? _currentInstruction;
  String? _currentRoadName;
  double _distanceToNextTurnKm = 0;
  int _etaMinutes = 0;
  int _currentStepIndex = -1;

  // ── On-the-fly nearby recommendations ────────────────────────────────────
  /// Pending recommendations ready to show (null = chip hidden).
  NearbyRecommendations? _nearbyRecs;
  /// True while the server call is in-flight.
  bool _checkingRecs = false;
  /// Last GPS position where a rec check was triggered.
  LatLng? _lastRecCheckPos;
  /// Time the last rec chip was dismissed — enforces 5-min cooldown.
  DateTime? _lastRecDismissed;

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

    // Apply initial transport mode if provided
    if (widget.initialTransportMode != null) {
      _transportMode = widget.initialTransportMode!;
      if (widget.initialTransportMode == 'grab_taxi') {
        _transportCategory = 'commute';
        _commuteSubMode = 'grab_taxi';
      } else if (widget.initialTransportMode != 'private_car') {
        _transportCategory = 'commute';
        _commuteSubMode = 'saver';
      }
    }
    // Apply AI itinerary flag
    _isAiItinerary = widget.isAiItinerary;

    // Pre-populate stops from initialDestinations (multi) or destination (single)
    if (widget.initialDestinations != null && widget.initialDestinations!.isNotEmpty) {
      _routeStops = widget.initialDestinations!.map((d) => _RouteStop(
        position: LatLng(d.latitude, d.longitude),
        name: d.name,
        destId: d.id,
      )).toList();
    } else if (widget.destination != null) {
      final dest = widget.destination!;
      _routeStops = [
        _RouteStop(
          position: LatLng(dest.latitude, dest.longitude),
          name: dest.name,
          destId: dest.id,
        ),
      ];
    }

    // TTS
    _tts = FlutterTts();
    _tts.setLanguage('en-US');
    _tts.setSpeechRate(0.9);

    // Register location listener and set GPS start after first frame
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _locationService = context.read<LocationService>();
      _locationService!.addListener(_handleLocationUpdate);
      // Begin acquiring GPS immediately (don't wait for navigation start)
      _locationService!.startTracking();
      // Set start immediately if GPS is already available
      final pos = _locationService!.currentPosition;
      if (pos != null) {
        _applyGpsStart(pos);
      } else {
        // Fallback: if GPS doesn't arrive within 8 s, use default Cebu center
        _gpsTimeoutTimer = Timer(const Duration(seconds: 8), () {
          if (!mounted || _routeStart != null) return;
          setState(() => _routeStart = _defaultCenter);
          try { _mapController.move(_defaultCenter, 12); } catch (_) {}
          if (_routeStops.isNotEmpty) _calculateRoute(_routeStops);
          if (mounted) AppToast.warning(context, 'GPS unavailable — using approximate location');
        });
      }
    });
  }

  /// Sets route start to the user's current GPS position and triggers
  /// route calculation if stops are already loaded.
  void _applyGpsStart(dynamic pos) {
    _gpsTimeoutTimer?.cancel();
    _gpsTimeoutTimer = null;
    final gps = LatLng(pos.latitude, pos.longitude);
    setState(() => _routeStart = gps);
    try { _mapController.move(gps, 14); } catch (_) {}
    if (_routeStops.isNotEmpty) _calculateRoute(_routeStops);
  }

  @override
  void dispose() {
    _gpsTimeoutTimer?.cancel();
    _locationService?.removeListener(_handleLocationUpdate);
    _arrivedSubscription?.cancel();
    _tts.stop();
    super.dispose();
  }

  Future<void> _speak(String text) async {
    await _tts.stop();
    await _tts.speak(text);
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
    if (context.read<AuthService>().isGuest) return;
    _addStop(_RouteStop(position: point, name: 'Stop ${_routeStops.length + 1}'));
  }

  void _addDestinationStop(Destination dest) {
    if (context.read<AuthService>().isGuest) {
      showGuestWall(context, featureName: 'Building a route');
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

  Future<void> _calculateRoute(List<_RouteStop> stops, {LatLng? fromOverride}) async {
    if (_routeStart == null || stops.isEmpty) return;

    setState(() {
      _routeLoading = true;
      _routeError = null;
    });

    if (_transportCategory == 'commute') {
      await _calculateCommuteRoute(stops, fromOverride: fromOverride);
      return;
    }

    final useMultiModal = _multiModalModes.contains(_transportMode);

    try {
      final api = context.read<ApiService>();
      final waypoints = [fromOverride ?? _routeStart!, ...stops.map((s) => s.position)];

      if (useMultiModal) {
        final mmLegs = <MultiModalRoute>[];
        LatLng mmSnappedFrom = waypoints[0];
        for (int i = 0; i < waypoints.length - 1; i++) {
          final from = mmSnappedFrom;
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
            final mm = MultiModalRoute.fromJson(res['data'] as Map<String, dynamic>);
            mmLegs.add(mm);
            final allGeo = mm.legs.expand((l) => l.geometry).toList();
            if (allGeo.isNotEmpty) {
              final last = allGeo.last;
              mmSnappedFrom = LatLng(last[0], last[1]);
            } else {
              mmSnappedFrom = waypoints[i + 1];
            }
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
        LatLng snappedFrom = waypoints[0];
        for (int i = 0; i < waypoints.length - 1; i++) {
          final from = snappedFrom;
          final to = waypoints[i + 1];
          final res = await api.post('/routes/calculate-gps', body: {
            'start_lat': from.latitude,
            'start_lon': from.longitude,
            'end_lat': to.latitude,
            'end_lon': to.longitude,
            'optimize_for': _optimizeFor,
          }, auth: true);

          if (res['success'] == true && res['data'] != null) {
            final leg = RouteResult.fromJson(res['data']);
            legs.add(leg);
            final geo = leg.routeGeometry;
            if (geo != null && geo.length >= 2) {
              snappedFrom = LatLng(geo.last[0], geo.last[1]);
            } else {
              snappedFrom = waypoints[i + 1];
            }
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

  // ── Commute route calculation ─────────────────────────────────────────────

  static const _transitModes = {
    'bus', 'bus_ac', 'bus_commute', 'jeepney', 'odutco', 'ferry',
  };

  /// Merge consecutive same-mode feeder legs produced at waypoint segment
  /// boundaries (e.g. feeder_C of segment 1 + feeder_A of segment 2).
  /// Result is always: feeder → transit → feeder → transit → feeder …
  List<TransportLeg> _mergeFeeders(List<TransportLeg> legs) {
    if (legs.length < 2) return legs;
    final result = <TransportLeg>[];
    for (final leg in legs) {
      if (result.isNotEmpty &&
          !_transitModes.contains(result.last.mode) &&
          !_transitModes.contains(leg.mode) &&
          result.last.mode == leg.mode) {
        final prev = result.removeLast();
        final geo = List<List<double>>.from(prev.geometry);
        if (leg.geometry.length > 1) geo.addAll(leg.geometry.sublist(1));
        result.add(TransportLeg(
          mode: prev.mode,
          from: prev.from,
          to: leg.to,
          distance: prev.distance + leg.distance,
          duration: prev.duration + leg.duration,
          fare: prev.fare + leg.fare,
          instruction: prev.instruction,
          geometry: geo,
        ));
      } else {
        result.add(leg);
      }
    }
    return result;
  }

  Future<void> _calculateCommuteRoute(List<_RouteStop> stops, {LatLng? fromOverride}) async {
    try {
      final api = context.read<ApiService>();
      final waypoints = [fromOverride ?? _routeStart!, ...stops.map((s) => s.position)];
      final allLegs = <TransportLeg>[];

      LatLng from = waypoints[0];
      for (int i = 0; i < waypoints.length - 1; i++) {
        final to = waypoints[i + 1];
        final res = await api.post('/routes/calculate-commute', body: {
          'start_lat': from.latitude,
          'start_lon': from.longitude,
          'end_lat': to.latitude,
          'end_lon': to.longitude,
          'sub_mode': _commuteSubMode,
        }, auth: true);

        if (res['success'] == true && res['data'] != null) {
          final mm = MultiModalRoute.fromJson(res['data'] as Map<String, dynamic>);
          allLegs.addAll(mm.legs);
          final lastGeo = mm.legs.isNotEmpty ? mm.legs.last.geometry : null;
          if (lastGeo != null && lastGeo.isNotEmpty) {
            from = LatLng(lastGeo.last[0], lastGeo.last[1]);
          } else {
            from = waypoints[i + 1];
          }
        } else {
          setState(() {
            _routeError = 'No commute route found for leg ${i + 1}';
            _routeLoading = false;
          });
          return;
        }
      }

      final merged = _mergeFeeders(allLegs);
      final totalDist = merged.fold<double>(0, (s, l) => s + l.distance);
      final totalTime = merged.fold<int>(0, (s, l) => s + l.duration);
      final totalFare = merged.fold<double>(0, (s, l) => s + l.fare);

      setState(() {
        _commuteLegs = merged;
        _currentLegIndex = 0;
        _routeLegs = [];
        _multiModalLegs = [];
        _routeLoading = false;
      });
      if (mounted) {
        final modeLabel = _commuteSubMode == 'grab_taxi' ? 'Grab/Taxi' : 'Bus';
        AppToast.success(context,
            '$modeLabel · ${totalDist.toStringAsFixed(2)} km · ~$totalTime min · ₱${totalFare.toStringAsFixed(0)}');
      }
    } catch (e) {
      setState(() {
        _routeError = e.toString().replaceFirst('Exception: ', '');
        _routeLoading = false;
      });
      if (mounted) AppToast.error(context, 'Commute route calculation failed');
    }
  }

  // ── Navigation control ────────────────────────────────────────────────────

  Future<void> _startNavigation() async {
    final hasRoute = _routeLegs.isNotEmpty || _multiModalLegs.isNotEmpty || _commuteLegs.isNotEmpty;
    if (!hasRoute || _routeStops.isEmpty) return;

    final locationService = context.read<LocationService>();
    final granted = await locationService.checkPermission();
    if (!mounted) return;
    if (!granted) {
      await showDialog(
        context: context,
        builder: (ctx) => ContentDialog(
          title: const Text('Location Required'),
          content: const Text(
            'Navigation needs your location to track your position and '
            'reroute when you go off track.\n\n'
            'Please enable location permission in your device settings.',
          ),
          actions: [
            Button(child: const Text('Dismiss'), onPressed: () => Navigator.pop(ctx)),
          ],
        ),
      );
      return;
    }
    // Travel time disclaimer
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => ContentDialog(
        title: const Row(
          children: [
            Icon(FluentIcons.warning, size: 20, color: Color(0xFFF59E0B)),
            SizedBox(width: 8),
            Text('Before You Go'),
          ],
        ),
        content: const Text(
          'Estimated travel times and fares are based on typical conditions '
          'and may vary due to traffic congestion, road closures, weather, '
          'or other unforeseen circumstances.\n\n'
          'Always allow extra time, stay alert, and follow local traffic rules.',
        ),
        actions: [
          Button(
            child: const Text('Cancel'),
            onPressed: () => Navigator.pop(ctx, false),
          ),
          FilledButton(
            child: const Text('Got it, Start'),
            onPressed: () => Navigator.pop(ctx, true),
          ),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;

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

    // Subscribe to arrival events
    await _arrivedSubscription?.cancel();
    _arrivedSubscription = locationService.arrivedStream.listen(_onArrivedAtDestination);

    setState(() {
      _isNavigating = true;
      _arrivedDestination = null;
      _snappedPosition = null;
      _isOffRoute = false;
      _rerouting = false;
      _offRouteCount = 0;
      _lastRerouteTime = null;
      _lastHandledPositionTime = null;
    });
    _currentStepIndex = -1;
    _commuteApproachSpoken = false;
    final stopCount = _routeStops.length;
    _speak('Navigation started. $stopCount stop${stopCount == 1 ? '' : 's'} ahead.');
    // Announce first commute leg after the opening message
    if (_commuteLegs.isNotEmpty) {
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted && _isNavigating) _speak(_commuteLegs[0].instruction);
      });
    }
    if (mounted) AppToast.success(context, 'Navigation started! You will be notified when you arrive.');
  }

  void _onArrivedAtDestination(String destId) {
    if (!mounted) return;
    final idx = _routeStops.indexWhere((s) => s.destId == destId);
    if (idx == -1) return;
    // Find full destination object from loaded list
    final full = _destinations.firstWhere(
      (d) => d.id == destId,
      orElse: () => Destination(
        id: destId,
        name: _routeStops[idx].name,
        latitude: _routeStops[idx].position.latitude,
        longitude: _routeStops[idx].position.longitude,
      ),
    );
    setState(() {
      _arrivedDestination = full;
      _arrivedStopIndex = idx;
      _currentInstruction = null;
      _currentStepIndex = -1;
    });
    _speak("You've arrived at ${full.name}.");
  }

  /// Called when user taps "Next Stop" on the arrival card.
  /// Drops completed stops, updates GPS start, and recalculates route.
  void _advanceToNextStop() {
    final nextIdx = _arrivedStopIndex + 1;
    final remaining = _routeStops.sublist(nextIdx);
    final pos = _locationService?.currentPosition;
    setState(() {
      _arrivedDestination = null;
      _routeStops = remaining;
      _routeLegs = [];
      _multiModalLegs = [];
      _routeError = null;
      if (pos != null) _routeStart = LatLng(pos.latitude, pos.longitude);
    });
    if (remaining.isNotEmpty) _calculateRoute(remaining);
  }

  /// Checks for nearby recommended destinations while navigating.
  /// Triggered automatically after moving 500 m; 5-min cooldown after dismissal.
  Future<void> _checkNearbyRecs(LatLng pos) async {
    if (_checkingRecs || !_isNavigating || !mounted) return;
    // Cooldown: 5 minutes after last dismissal
    if (_lastRecDismissed != null &&
        DateTime.now().difference(_lastRecDismissed!).inMinutes < 5) {
      return;
    }
    // Gate: only run if at least one destination in the loaded list is within
    // 600 m and not already a planned stop.
    final plannedIds = _routeStops.map((s) => s.destId).toSet();
    final hasCandidate = _destinations.any((d) {
      if (plannedIds.contains(d.id)) return false;
      return _distMeters(pos, LatLng(d.latitude, d.longitude)) <= 600;
    });
    if (!hasCandidate) return;

    setState(() => _checkingRecs = true);
    try {
      final api = context.read<ApiService>();
      final res = await api.post('/ai/recommend/nearby', body: {
        'lat': pos.latitude,
        'lon': pos.longitude,
        'visited_ids': plannedIds.whereType<String>().toList(),
      }, auth: true);
      if (!mounted) return;
      if (res['success'] == true && res['data'] != null) {
        final recs = NearbyRecommendations.fromJson(
            Map<String, dynamic>.from(res['data'] as Map));
        if (!recs.isEmpty) {
          setState(() => _nearbyRecs = recs);
        }
      }
    } catch (_) {
      // Non-critical — silent fail
    } finally {
      if (mounted) setState(() => _checkingRecs = false);
    }
  }

  void _stopNavigation() {
    context.read<LocationService>().stopTracking();
    _arrivedSubscription?.cancel();
    _arrivedSubscription = null;
    _tts.stop();
    setState(() {
      _isNavigating = false;
      _arrivedDestination = null;
      _nearbyRecs = null;
      _checkingRecs = false;
      _lastRecCheckPos = null;
      _snappedPosition = null;
      _isOffRoute = false;
      _rerouting = false;
      _offRouteCount = 0;
      _currentInstruction = null;
      _currentRoadName = null;
      _distanceToNextTurnKm = 0;
      _etaMinutes = 0;
      _currentStepIndex = -1;
      _currentLegIndex = 0;
      _commuteApproachSpoken = false;
    });
    // Reset map to north-up
    try { _mapController.rotate(0); } catch (_) {}
    AppToast.info(context, 'Navigation stopped');
  }

  void _clearRoute() {
    if (_isNavigating) _stopNavigation();
    // Keep _routeStart as GPS — only clear stops and route geometry
    setState(() {
      _routeStops = [];
      _routeLegs = [];
      _multiModalLegs = [];
      _commuteLegs = [];
      _currentLegIndex = 0;
      _routeError = null;
      _isAiItinerary = false;
    });
  }

  // ── Location update handler ───────────────────────────────────────────────

  /// Fires on every LocationService notify (GPS + compass updates).
  void _handleLocationUpdate() {
    final ls = _locationService;
    if (ls == null || !mounted) return;

    // Set GPS start on first available position
    if (_routeStart == null) {
      final pos = ls.currentPosition;
      if (pos != null) _applyGpsStart(pos);
    }

    if (!_isNavigating) return;

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
                _currentStepIndex = -1;
              });
              _speak('Off route. Recalculating.');
              AppToast.warning(context, 'Off route — recalculating...');
              _calculateRoute(_routeStops, fromOverride: userLatLng).whenComplete(() {
                if (mounted) setState(() => _rerouting = false);
                _speak('Route updated.');
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

    // ── Commute leg auto-advance + TTS ───────────────────────────────────
    if (_isNavigating && _commuteLegs.isNotEmpty && _currentLegIndex < _commuteLegs.length) {
      final leg = _commuteLegs[_currentLegIndex];
      final toPoint = LatLng(leg.to.lat, leg.to.lon);
      final distToTransition = _distMeters(userLatLng, toPoint);
      final isLastLeg = _currentLegIndex == _commuteLegs.length - 1;

      // 200 m approaching announcement (fires once per leg, non-last legs only)
      if (!isLastLeg && distToTransition < 200 && !_commuteApproachSpoken) {
        _commuteApproachSpoken = true;
        final next = _commuteLegs[_currentLegIndex + 1];
        final distLabel = distToTransition < 1000
            ? '${distToTransition.round()} meters'
            : '${(distToTransition / 1000).toStringAsFixed(1)} kilometers';
        _speak('In $distLabel, ${next.instruction}');
      }

      // 50 m auto-advance (non-last legs — last leg arrival handled by LocationService)
      if (!isLastLeg && distToTransition < 50) {
        final next = _commuteLegs[_currentLegIndex + 1];
        setState(() {
          _currentLegIndex++;
          _commuteApproachSpoken = false;
        });
        _speak(next.instruction);
      }
    }

    // ── Turn-by-turn step tracking (private car) ─────────────────────────
    if (_routeLegs.isNotEmpty) _updateNavigationStep(userLatLng);

    // ── On-the-fly nearby recs: trigger every 500 m of travel ────────────
    if (_nearbyRecs == null && !_checkingRecs) {
      final lastCheck = _lastRecCheckPos;
      if (lastCheck == null || _distMeters(userLatLng, lastCheck) >= 500) {
        _lastRecCheckPos = userLatLng;
        _checkNearbyRecs(userLatLng);
      }
    }
  }

  /// Finds which RouteStep the user is currently on and updates the HUD.
  void _updateNavigationStep(LatLng userLatLng) {
    final polyline = _flatRoutePolyline();
    if (polyline.length < 2) return;

    final allSteps = _routeLegs.expand((l) => l.steps).toList();
    if (allSteps.isEmpty) return;

    // Progress along flat polyline in km
    double minDist = double.infinity;
    int nearestIdx = 0;
    for (int i = 0; i < polyline.length - 1; i++) {
      final c = _nearestOnSegment(userLatLng, polyline[i], polyline[i + 1]);
      final d = _distMeters(userLatLng, c);
      if (d < minDist) { minDist = d; nearestIdx = i; }
    }
    double progress = 0;
    for (int i = 0; i < nearestIdx; i++) {
      progress += _distMeters(polyline[i], polyline[i + 1]);
    }
    progress += _distMeters(polyline[nearestIdx],
        _nearestOnSegment(userLatLng, polyline[nearestIdx],
            nearestIdx + 1 < polyline.length ? polyline[nearestIdx + 1] : polyline[nearestIdx]));
    progress /= 1000; // → km

    // Total remaining distance for ETA
    double totalKm = 0;
    for (int i = 0; i < polyline.length - 1; i++) {
      totalKm += _distMeters(polyline[i], polyline[i + 1]);
    }
    totalKm /= 1000;
    final remainingKm = (totalKm - progress).clamp(0.0, double.infinity);
    final eta = (remainingKm / 40.0 * 60).round(); // 40 km/h avg car

    // Find current step
    double cumDist = 0;
    for (int i = 0; i < allSteps.length; i++) {
      cumDist += allSteps[i].distance;
      if (progress <= cumDist) {
        final distToTurn = (cumDist - progress).clamp(0.0, double.infinity);
        final isNewStep = i != _currentStepIndex;
        if (isNewStep) {
          _currentStepIndex = i;
          // Announce the upcoming maneuver
          final distLabel = distToTurn < 0.1
              ? 'now'
              : distToTurn < 1
                  ? 'in ${(distToTurn * 1000).round()} meters'
                  : 'in ${distToTurn.toStringAsFixed(1)} kilometers';
          _speak('${allSteps[i].instruction} $distLabel');
        }
        setState(() {
          _currentInstruction = allSteps[i].instruction;
          _currentRoadName = allSteps[i].roadName;
          _distanceToNextTurnKm = distToTurn;
          _etaMinutes = eta;
        });
        return;
      }
    }
    // Past all steps — show last instruction
    setState(() {
      _currentInstruction = allSteps.last.instruction;
      _currentRoadName = allSteps.last.roadName;
      _distanceToNextTurnKm = 0;
      _etaMinutes = eta;
    });
  }

  // ── Route geometry helpers ────────────────────────────────────────────────

  /// Concatenates all leg geometries into a single flat polyline.
  List<LatLng> _flatRoutePolyline() {
    if (_commuteLegs.isNotEmpty) {
      // For off-route detection, only use current leg's geometry
      final leg = _currentLegIndex < _commuteLegs.length
          ? _commuteLegs[_currentLegIndex]
          : _commuteLegs.last;
      return leg.geometry.map((c) => LatLng(c[0], c[1])).toList();
    }
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
    // Guests cannot save itineraries — show login wall
    final allowed = await showGuestWall(context, featureName: 'Saving itineraries');
    if (!allowed || !mounted) return;

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
      case 'taxi':                return const Color(0xFFea580c); // orange-600 — visible on OSM yellow roads
      default:                    return const Color(0xFFdc2626);
    }
  }

  IconData _modeIcon(String mode) {
    switch (mode) {
      case 'walk':        return FluentIcons.location;
      case 'bus':
      case 'jeepney':     return FluentIcons.bus_solid;
      case 'tricycle':
      case 'habal_habal': return FluentIcons.cycling;
      case 'ferry':       return FluentIcons.airplane;
      case 'taxi':        return FluentIcons.taxi;
      default:            return FluentIcons.car;
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
            // During navigation: disable pinchMove so pinch-zoom centres on the
            // GPS position instead of the finger midpoint.
            interactionOptions: InteractionOptions(
              flags: _isNavigating
                  ? InteractiveFlag.all & ~InteractiveFlag.pinchMove
                  : InteractiveFlag.all,
            ),
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

            // Walk fallback / walk-tail polylines (dashed blue)
            if (_routeLegs.isNotEmpty)
              PolylineLayer(
                polylines: _routeLegs.expand((leg) {
                  final List<Polyline> polys = [];
                  if (leg.isWalkFallback && leg.routeGeometry != null && leg.routeGeometry!.length >= 2) {
                    // Use only first + last point — full geometry causes scribble/hatching
                    final geo = leg.routeGeometry!;
                    polys.add(Polyline(
                      points: [
                        LatLng(geo.first[0], geo.first[1]),
                        LatLng(geo.last[0], geo.last[1]),
                      ],
                      strokeWidth: 4,
                      color: const Color(0xFF3B82F6).withAlpha(230),
                      pattern: StrokePattern.dashed(segments: const [8, 6]),
                    ));
                  } else if (leg.walkTail != null) {
                    polys.add(Polyline(
                      points: [
                        LatLng(leg.walkTail!.from[0], leg.walkTail!.from[1]),
                        LatLng(leg.walkTail!.to[0], leg.walkTail!.to[1]),
                      ],
                      strokeWidth: 3,
                      color: const Color(0xFF3B82F6).withAlpha(200),
                      pattern: StrokePattern.dashed(segments: const [8, 6]),
                    ));
                  }
                  return polys;
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

            // Commute polylines: faint for all, bright for current leg
            if (_commuteLegs.isNotEmpty)
              PolylineLayer(
                polylines: _commuteLegs.asMap().entries.map((e) {
                  final idx = e.key;
                  final leg = e.value;
                  final pts = leg.geometry.map((c) => LatLng(c[0], c[1])).toList();
                  if (pts.length < 2) return null;
                  final isCurrent = idx == _currentLegIndex;
                  return Polyline(
                    points: pts,
                    strokeWidth: isCurrent ? 5.5 : 2.5,
                    color: isCurrent
                        ? _modeColor(leg.mode).withAlpha(220)
                        : _modeColor(leg.mode).withAlpha(80),
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
                  rotate: true,
                  child: CustomPaint(
                    size: const Size(44, 44),
                    painter: _NavArrowPainter(),
                  ),
                ),
              ]),
          ],
        ),

        // ── Back button (only when pushed as a route) ─────────────────────
        if (Navigator.canPop(context))
          Positioned(
            top: MediaQuery.of(context).padding.top + 10,
            left: 14,
            child: GestureDetector(
              onTap: () => Navigator.pop(context),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                  child: Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      color: c.surfaceCard.withAlpha(220),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: c.borderLight),
                    ),
                    child: Icon(FluentIcons.chevron_left, size: 16, color: c.text),
                  ),
                ),
              ),
            ),
          ),

        // ── AI Plan button (hidden while navigating) ──────────────────────
        if (!_isNavigating)
          Positioned(
            top: MediaQuery.of(context).padding.top + 10,
            left: Navigator.canPop(context) ? 62 : 14,
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

        // ── Turn-by-turn HUD (private car) ───────────────────────────────
        if (_isNavigating && _routeLegs.isNotEmpty && _currentInstruction != null)
          Positioned(
            top: MediaQuery.of(context).padding.top + 58,
            left: 14, right: 14,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                  decoration: BoxDecoration(
                    color: c.surfaceCard.withAlpha(235),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: c.borderLight),
                  ),
                  child: Row(
                    children: [
                      // Turn icon
                      Container(
                        width: 38, height: 38,
                        decoration: BoxDecoration(
                          color: AppColors.blue.withAlpha(25),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(FluentIcons.map_directions, size: 20, color: AppColors.blue),
                      ),
                      const SizedBox(width: 12),
                      // Instruction + road name
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _currentInstruction!,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: c.textStrong,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (_currentRoadName != null &&
                                _currentRoadName!.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                _currentRoadName!,
                                style: TextStyle(
                                    fontSize: 11, color: c.textFaint),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      // Distance to turn + ETA
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (_distanceToNextTurnKm > 0)
                            Text(
                              _distanceToNextTurnKm < 1
                                  ? '${(_distanceToNextTurnKm * 1000).round()}m'
                                  : '${_distanceToNextTurnKm.toStringAsFixed(1)}km',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: AppColors.blue,
                              ),
                            ),
                          if (_etaMinutes > 0)
                            Text(
                              '~$_etaMinutes min',
                              style: TextStyle(
                                  fontSize: 10, color: c.textFaint),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ).animate().slideY(begin: -0.3, end: 0, duration: 250.ms),
          ),

        // ── Commute leg HUD ───────────────────────────────────────────────
        if (_isNavigating && _commuteLegs.isNotEmpty && _currentLegIndex < _commuteLegs.length)
          Positioned(
            top: MediaQuery.of(context).padding.top + 58,
            left: 14, right: 14,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                  decoration: BoxDecoration(
                    color: c.surfaceCard.withAlpha(235),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: c.borderLight),
                  ),
                  child: Builder(builder: (_) {
                    final leg = _commuteLegs[_currentLegIndex];
                    final hasNext = _currentLegIndex < _commuteLegs.length - 1;
                    final nextLeg = hasNext ? _commuteLegs[_currentLegIndex + 1] : null;
                    final toPoint = LatLng(leg.to.lat, leg.to.lon);
                    final userLatLng = userPos != null ? LatLng(userPos.latitude, userPos.longitude) : null;
                    final distM = userLatLng != null ? _distMeters(userLatLng, toPoint) : 0.0;
                    final distLabel = distM < 1000
                        ? '${distM.round()}m'
                        : '${(distM / 1000).toStringAsFixed(1)}km';
                    final isApproaching = distM < 500 && hasNext;
                    return Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 38, height: 38,
                              decoration: BoxDecoration(
                                color: _modeColor(leg.mode).withAlpha(25),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Icon(_modeIcon(leg.mode), size: 20, color: _modeColor(leg.mode)),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    leg.instruction,
                                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.textStrong),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 2),
                                  Text('To: ${leg.to.name}',
                                      style: TextStyle(fontSize: 11, color: c.textFaint),
                                      overflow: TextOverflow.ellipsis),
                                ],
                              ),
                            ),
                            const SizedBox(width: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(distLabel,
                                    style: TextStyle(
                                      fontSize: 15, fontWeight: FontWeight.w800,
                                      color: isApproaching ? AppColors.amber : _modeColor(leg.mode),
                                    )),
                                if (leg.fare > 0)
                                  Text('₱${leg.fare.toStringAsFixed(0)}',
                                      style: TextStyle(fontSize: 11, color: AppColors.amber,
                                          fontWeight: FontWeight.w600)),
                                Text('${_currentLegIndex + 1}/${_commuteLegs.length}',
                                    style: TextStyle(fontSize: 10, color: c.textFaint)),
                              ],
                            ),
                          ],
                        ),
                        // Action strip for walk / book-a-ride legs
                        if (leg.mode == 'walk' ||
                            (!_transitModes.contains(leg.mode) && leg.mode != 'ferry')) ...[
                          const SizedBox(height: 6),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: leg.mode == 'walk'
                                  ? const Color(0xFF9ca3af).withAlpha(25)
                                  : AppColors.amber.withAlpha(25),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  leg.mode == 'walk' ? FluentIcons.location : FluentIcons.taxi,
                                  size: 12,
                                  color: leg.mode == 'walk'
                                      ? const Color(0xFF9ca3af)
                                      : AppColors.amber,
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    leg.mode == 'walk'
                                        ? 'Follow walking route to ${leg.to.name}'
                                        : 'Hail or book a ride to ${leg.to.name}',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w500,
                                      color: leg.mode == 'walk'
                                          ? const Color(0xFF9ca3af)
                                          : AppColors.amber,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        // "Next:" preview row — shown within 500 m of a leg transition
                        if (isApproaching && nextLeg != null) ...[
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: AppColors.amber.withAlpha(20),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                Icon(_modeIcon(nextLeg.mode), size: 13, color: AppColors.amber),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    'Next: ${nextLeg.instruction}',
                                    style: TextStyle(fontSize: 10, color: AppColors.amber,
                                        fontWeight: FontWeight.w600),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    );
                  }),
                ),
              ),
            ).animate().slideY(begin: -0.3, end: 0, duration: 250.ms),
          ),

        // ── Nearby-recs chip ──────────────────────────────────────────────
        if (_isNavigating && (_nearbyRecs != null || _checkingRecs))
          Positioned(
            top: MediaQuery.of(context).padding.top + 60,
            left: 14, right: 14,
            child: GestureDetector(
              onTap: _nearbyRecs != null ? () async {
                final recs = _nearbyRecs!;
                setState(() => _nearbyRecs = null);
                setState(() => _lastRecDismissed = DateTime.now());
                await NearbyRecommendationsSheet.show(
                  context, recs,
                  (dest) {
                    _addDestinationStop(dest);
                    AppToast.success(context, '${dest.name} added to your route!');
                  },
                );
              } : null,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: AppColors.purple.withAlpha(220),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_checkingRecs)
                          const SizedBox(
                            width: 14, height: 14,
                            child: ProgressRing(strokeWidth: 2),
                          )
                        else
                          const Text('✨', style: TextStyle(fontSize: 14)),
                        const SizedBox(width: 8),
                        Text(
                          _checkingRecs ? 'Checking nearby...' : 'Spots near you — tap to explore',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                        if (_nearbyRecs != null) ...[
                          const SizedBox(width: 8),
                          GestureDetector(
                            onTap: () => setState(() {
                              _nearbyRecs = null;
                              _lastRecDismissed = DateTime.now();
                            }),
                            child: const Icon(FluentIcons.chrome_close,
                                size: 12, color: Colors.white),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ).animate().slideY(begin: -0.5, end: 0, duration: 300.ms),
          ),

        // ── Route panel ───────────────────────────────────────────────────
        if (_showRoutePanel && _arrivedDestination == null)
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: GestureDetector(
              onTap: _panelCollapsed
                  ? () => setState(() => _panelCollapsed = false)
                  : null,
              onVerticalDragEnd: (d) {
                // Swipe down → collapse, swipe up → expand
                if (d.primaryVelocity != null) {
                  if (d.primaryVelocity! > 300) {
                    setState(() => _panelCollapsed = true);
                  } else if (d.primaryVelocity! < -300) {
                    setState(() => _panelCollapsed = false);
                  }
                }
              },
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 280),
                    curve: Curves.easeInOut,
                    height: _panelCollapsed
                        ? 52
                        : (MediaQuery.of(context).size.height * 0.5),
                    decoration: BoxDecoration(
                      color: c.surfaceCard.withAlpha(230),
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                      border: Border(top: BorderSide(color: c.borderLight)),
                    ),
                    child: _panelCollapsed
                        ? _buildPanelPeek(c)
                        : SingleChildScrollView(
                            padding: const EdgeInsets.fromLTRB(20, 14, 20, 10),
                            child: _buildRoutePanel(),
                          ),
                  ),
                ),
              ),
            ).animate().slideY(begin: 1, end: 0, duration: 300.ms, curve: Curves.easeOut),
          ),

        // ── Arrival overlay ───────────────────────────────────────────────
        if (_arrivedDestination != null)
          _buildArrivalOverlay(_arrivedDestination!),
      ],
    );
  }

  // ── Arrival overlay ───────────────────────────────────────────────────────

  Widget _buildArrivalOverlay(Destination dest) {
    final c = context.appColors;
    final stopNum = _arrivedStopIndex + 1;
    final totalStops = _routeStops.length;
    final hasNext = _arrivedStopIndex < totalStops - 1;
    final nextStop = hasNext ? _routeStops[_arrivedStopIndex + 1] : null;
    final imageUrl = dest.images.isNotEmpty ? dest.images.first : null;

    return Positioned(
      bottom: 0, left: 0, right: 0,
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
          child: Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.72,
            ),
            decoration: BoxDecoration(
              color: c.surfaceCard.withAlpha(245),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
              border: Border(top: BorderSide(color: AppColors.green.withAlpha(120), width: 1.5)),
            ),
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(20, 14, 20, MediaQuery.of(context).padding.bottom + 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Drag handle
                  Center(
                    child: Container(
                      width: 36, height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.green.withAlpha(120),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // "Stop N of M" badge
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.green,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          'Stop $stopNum of $totalStops',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (dest.categoryName != null)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.blue.withAlpha(25),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            dest.categoryName!,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.blue,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // "Welcome to" header
                  Text(
                    'Welcome to',
                    style: TextStyle(fontSize: 14, color: c.textMuted),
                  ),
                  Text(
                    dest.name,
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: c.textStrong,
                      height: 1.1,
                    ),
                  ),
                  if (dest.municipality != null) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(FluentIcons.location, size: 12, color: c.textFaint),
                        const SizedBox(width: 4),
                        Text(dest.municipality!,
                            style: TextStyle(fontSize: 12, color: c.textFaint)),
                      ],
                    ),
                  ],
                  const SizedBox(height: 14),

                  // Cover photo
                  if (imageUrl != null)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Image.network(
                        imageUrl,
                        height: 160,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    ),
                  if (imageUrl != null) const SizedBox(height: 14),

                  // Stats row
                  Row(
                    children: [
                      if (dest.rating > 0) ...[
                        Icon(FluentIcons.favorite_star, size: 14, color: AppColors.amber),
                        const SizedBox(width: 4),
                        Text(
                          dest.rating.toStringAsFixed(1),
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: c.textStrong,
                          ),
                        ),
                        Text(
                          ' (${dest.reviewCount})',
                          style: TextStyle(fontSize: 12, color: c.textFaint),
                        ),
                        const SizedBox(width: 16),
                      ],
                      if (dest.entranceFeeLocal > 0) ...[
                        Icon(FluentIcons.money, size: 14, color: AppColors.green),
                        const SizedBox(width: 4),
                        Text(
                          '₱${dest.entranceFeeLocal.toStringAsFixed(0)} entry',
                          style: TextStyle(fontSize: 13, color: c.text),
                        ),
                        const SizedBox(width: 16),
                      ],
                      if (dest.averageVisitDuration > 0) ...[
                        Icon(FluentIcons.clock, size: 14, color: c.textFaint),
                        const SizedBox(width: 4),
                        Text(
                          '~${dest.averageVisitDuration} min visit',
                          style: TextStyle(fontSize: 13, color: c.text),
                        ),
                      ],
                    ],
                  ),

                  // Description
                  if (dest.description != null && dest.description!.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      dest.description!,
                      style: TextStyle(fontSize: 13, color: c.textMuted, height: 1.5),
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],

                  // Tags
                  if (dest.tags.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: dest.tags.take(6).map((tag) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: c.surfaceElevated,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: c.borderSubtle),
                        ),
                        child: Text(tag,
                            style: TextStyle(fontSize: 11, color: c.textMuted)),
                      )).toList(),
                    ),
                  ],

                  // Best time / tips
                  if (dest.bestTimeToVisit != null) ...[
                    const SizedBox(height: 12),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(FluentIcons.sunny, size: 14, color: AppColors.amber),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Best time: ${dest.bestTimeToVisit!}',
                            style: TextStyle(fontSize: 12, color: c.textMuted),
                          ),
                        ),
                      ],
                    ),
                  ],

                  const SizedBox(height: 20),

                  // Next stop preview
                  if (hasNext && nextStop != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.blue.withAlpha(18),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.blue.withAlpha(50)),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 28, height: 28,
                            decoration: BoxDecoration(
                              color: AppColors.blue,
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: Text(
                                '${_arrivedStopIndex + 2}',
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Next stop',
                                    style: TextStyle(fontSize: 10, color: AppColors.blue)),
                                Text(nextStop.name,
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: c.textStrong,
                                    ),
                                    overflow: TextOverflow.ellipsis),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  // Action buttons
                  Row(
                    children: [
                      Expanded(
                        child: Button(
                          onPressed: () => setState(() => _arrivedDestination = null),
                          style: ButtonStyle(
                            backgroundColor: WidgetStateProperty.all(c.surfaceElevated),
                            shape: WidgetStateProperty.all(RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                              side: BorderSide(color: c.borderMedium),
                            )),
                            padding: WidgetStateProperty.all(
                                const EdgeInsets.symmetric(vertical: 13)),
                          ),
                          child: Text('Dismiss',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: c.text,
                              )),
                        ),
                      ),
                      if (hasNext) ...[
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton(
                            onPressed: _advanceToNextStop,
                            style: ButtonStyle(
                              backgroundColor: WidgetStateProperty.all(AppColors.green),
                              shape: WidgetStateProperty.all(RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12))),
                              padding: WidgetStateProperty.all(
                                  const EdgeInsets.symmetric(vertical: 13)),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Text('Next Stop',
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.white,
                                    )),
                                const SizedBox(width: 6),
                                const Icon(FluentIcons.chevron_right,
                                    size: 14, color: Colors.white),
                              ],
                            ),
                          ),
                        ),
                      ] else ...[
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton(
                            onPressed: _stopNavigation,
                            style: ButtonStyle(
                              backgroundColor: WidgetStateProperty.all(AppColors.red500),
                              shape: WidgetStateProperty.all(RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12))),
                              padding: WidgetStateProperty.all(
                                  const EdgeInsets.symmetric(vertical: 13)),
                            ),
                            child: const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text('Finish Trip',
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.white,
                                    )),
                                SizedBox(width: 6),
                                Icon(FluentIcons.flag, size: 14, color: Colors.white),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ).animate().slideY(begin: 1, end: 0, duration: 350.ms, curve: Curves.easeOut),
    );
  }

  // ── Route panel widget ────────────────────────────────────────────────────

  /// Compact peek bar shown when panel is collapsed — tap or swipe up to expand.
  Widget _buildPanelPeek(AppColorScheme c) {
    final stopCount = _routeStops.length;
    final isCommute = _commuteLegs.isNotEmpty;
    final isMultiModal = _multiModalLegs.isNotEmpty;
    final totalDist = isCommute
        ? _commuteLegs.fold<double>(0, (s, l) => s + l.distance)
        : isMultiModal
            ? _multiModalLegs.fold<double>(0, (s, l) => s + l.totalDistance)
            : _routeLegs.fold<double>(0, (s, l) => s + l.totalDistance);
    final totalTime = isCommute
        ? _commuteLegs.fold<int>(0, (s, l) => s + l.duration)
        : isMultiModal
            ? _multiModalLegs.fold<int>(0, (s, l) => s + l.totalDuration)
            : _routeLegs.fold<int>(0, (s, l) => s + l.estimatedTime);
    final totalFare = isCommute
        ? _commuteLegs.fold<double>(0, (s, l) => s + l.fare)
        : isMultiModal
            ? _multiModalLegs.fold<double>(0, (s, l) => s + l.totalFare)
            : 0.0;
    final hasRoute = totalDist > 0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          // Drag handle pill
          GestureDetector(
            onTap: () => setState(() => _panelCollapsed = false),
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: c.borderStrong,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Icon(FluentIcons.map_directions, size: 14, color: c.textMuted),
          const SizedBox(width: 6),
          Text(
            '$stopCount stop${stopCount != 1 ? 's' : ''}',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.text),
          ),
          if (hasRoute) ...[
            const SizedBox(width: 10),
            Text('·', style: TextStyle(color: c.textFaint)),
            const SizedBox(width: 10),
            Text(
              '${totalDist.toStringAsFixed(1)} km  ·  ~$totalTime min',
              style: TextStyle(fontSize: 12, color: c.textMuted),
            ),
            if ((isCommute || isMultiModal) && totalFare > 0) ...[
              const SizedBox(width: 6),
              Text('·', style: TextStyle(color: c.textFaint)),
              const SizedBox(width: 6),
              Text(
                '₱${totalFare.toStringAsFixed(0)}',
                style: TextStyle(fontSize: 12, color: AppColors.amber, fontWeight: FontWeight.w600),
              ),
            ],
          ],
          const Spacer(),
          GestureDetector(
            onTap: () => setState(() => _panelCollapsed = false),
            child: Icon(FluentIcons.chevron_up, size: 16, color: c.textMuted),
          ),
        ],
      ),
    );
  }

  Widget _buildRoutePanel() {
    final c = context.appColors;
    final isCommute = _commuteLegs.isNotEmpty;
    final isMultiModal = _multiModalLegs.isNotEmpty;
    final totalDist = isCommute
        ? _commuteLegs.fold<double>(0, (s, l) => s + l.distance)
        : isMultiModal
            ? _multiModalLegs.fold<double>(0, (s, l) => s + l.totalDistance)
            : _routeLegs.fold<double>(0, (s, l) => s + l.totalDistance);
    final totalTime = isCommute
        ? _commuteLegs.fold<int>(0, (s, l) => s + l.duration)
        : isMultiModal
            ? _multiModalLegs.fold<int>(0, (s, l) => s + l.totalDuration)
            : _routeLegs.fold<int>(0, (s, l) => s + l.estimatedTime);
    final totalFare = isCommute
        ? _commuteLegs.fold<double>(0, (s, l) => s + l.fare)
        : isMultiModal
            ? _multiModalLegs.fold<double>(0, (s, l) => s + l.totalFare)
            : 0.0;
    final hasRoute = _routeLegs.isNotEmpty || _multiModalLegs.isNotEmpty || _commuteLegs.isNotEmpty;
    final isOnline = context.watch<ConnectivityService>().isOnline;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Drag handle — tap to collapse
        GestureDetector(
          onTap: () => setState(() => _panelCollapsed = true),
          child: Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                  color: c.borderStrong, borderRadius: BorderRadius.circular(2)),
            ),
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
            if (_routeStops.isNotEmpty)
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
        const SizedBox(height: 8),

        // GPS start indicator
        Row(
          children: [
            Container(
              width: 8, height: 8,
              decoration: BoxDecoration(
                color: _routeStart != null ? AppColors.green : c.borderStrong,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              _routeStart != null ? 'Starting from your GPS location' : 'Waiting for GPS...',
              style: TextStyle(
                fontSize: 12,
                color: _routeStart != null ? AppColors.green : c.textFaint,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),

        // Transport chips — Private | Bus | Grab/Taxi/Maxim
        Row(
          children: [
            Expanded(child: _transportChip('private', 'Private', FluentIcons.car, c)),
            const SizedBox(width: 8),
            Expanded(child: _transportChip('bus', 'Bus', FluentIcons.bus_solid, c)),
            const SizedBox(width: 8),
            Expanded(child: _transportChip('grab_taxi', 'Grab/Taxi', FluentIcons.taxi, c)),
          ],
        ),
        const SizedBox(height: 10),

        // Optimize toggle (private only)
        if (_transportCategory == 'private') ...[
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
        if (_destinations.isNotEmpty) ...[
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
                  if (i < _routeLegs.length) ...[
                    if (_routeLegs[i].isWalkFallback)
                      const Padding(
                        padding: EdgeInsets.only(right: 4),
                        child: Text('🚶',
                            style: TextStyle(fontSize: 11)),
                      ),
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: Text(
                        '${_routeLegs[i].totalDistance.toStringAsFixed(1)}km',
                        style: TextStyle(
                            fontSize: 10,
                            color: _routeLegs[i].isWalkFallback
                                ? const Color(0xFF3B82F6)
                                : c.textFaint),
                      ),
                    ),
                  ],
                  if (!_isNavigating && !context.read<AuthService>().isGuest)
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
        if (_routeStops.isEmpty)
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
                  child: Text('Tap map or pick a destination above to add stops',
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
                if ((isMultiModal || isCommute) && totalFare > 0) ...[
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
          // Walk fallback warnings
          if (!isMultiModal && _routeLegs.any((l) => l.isWalkFallback)) ...[
            const SizedBox(height: 8),
            if (_routeLegs.any((l) => l.isWalkFallback && l.totalDistance > 3))
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF59E0B).withAlpha(25),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFF59E0B).withAlpha(80)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('⚠️', style: TextStyle(fontSize: 14)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Long walk detected',
                              style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFFB45309))),
                          const SizedBox(height: 2),
                          ..._routeLegs
                              .where((l) => l.isWalkFallback && l.totalDistance > 3)
                              .map((l) => Text(
                                    '${l.totalDistance.toStringAsFixed(2)} km walk — no road route in this area',
                                    style: const TextStyle(
                                        fontSize: 11, color: Color(0xFF92400E)),
                                  )),
                        ],
                      ),
                    ),
                  ],
                ),
              )
            else
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFF3B82F6).withAlpha(20),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF3B82F6).withAlpha(60)),
                ),
                child: Row(
                  children: [
                    const Text('🚶', style: TextStyle(fontSize: 14)),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'One or more legs use a walking path — no road route available in that area.',
                        style: TextStyle(fontSize: 11, color: Color(0xFF1D4ED8)),
                      ),
                    ),
                  ],
                ),
              ),
          ],

          // Multi-modal leg detail
          if (isMultiModal) ...[
            const SizedBox(height: 8),
            ..._multiModalLegs.expand((mm) => mm.legs).map((leg) {
              final isWalkLeg = leg.mode == 'walk';
              final isPrivateCar = leg.mode == 'private_car';
              final isFerryLeg = leg.mode == 'ferry';
              final legColor = _modeColor(leg.mode);
              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: legColor.withAlpha(12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: legColor.withAlpha(45)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 30, height: 30,
                        decoration: BoxDecoration(
                          color: legColor.withAlpha(30),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(_modeIcon(leg.mode), size: 15, color: legColor),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(leg.instruction,
                            style: TextStyle(fontSize: 11, color: c.text),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis),
                      ),
                      const SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('${leg.duration}m',
                              style: TextStyle(fontSize: 10, color: c.textFaint)),
                          Text('${leg.distance.toStringAsFixed(1)} km',
                              style: TextStyle(fontSize: 10, color: c.textFaint)),
                          const SizedBox(height: 3),
                          if (!isPrivateCar)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                              decoration: BoxDecoration(
                                color: (isWalkLeg || isFerryLeg)
                                    ? c.borderSubtle.withAlpha(40)
                                    : AppColors.amber.withAlpha(22),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: (isWalkLeg || isFerryLeg)
                                      ? c.borderSubtle
                                      : AppColors.amber.withAlpha(70),
                                ),
                              ),
                              child: Column(
                                children: [
                                  Text(
                                    isWalkLeg ? 'Free' : isFerryLeg ? 'Varies' : '₱${leg.fare.toStringAsFixed(0)}',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: (isWalkLeg || isFerryLeg) ? c.textFaint : AppColors.amber,
                                    ),
                                  ),
                                  Text('Fare',
                                      style: TextStyle(fontSize: 8, color: c.textFaint)),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
          ],

          // Commute-only-taxi warning
          if (isCommute &&
              _commuteSubMode == 'saver' &&
              _commuteLegs.length == 1 &&
              (_commuteLegs.first.mode == 'taxi' || _commuteLegs.first.mode == 'maxim')) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.amber.withAlpha(25),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.amber.withAlpha(80)),
              ),
              child: Row(
                children: [
                  const Text('ℹ️', style: TextStyle(fontSize: 14)),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'No bus or tricycle routes found for this trip — falling back to ride-hailing.',
                      style: TextStyle(fontSize: 11, color: Color(0xFF92400E)),
                    ),
                  ),
                ],
              ),
            ),
          ],

          // Commute leg detail
          if (isCommute) ...[
            const SizedBox(height: 8),
            ..._commuteLegs.map((leg) {
              final isWalkLeg = leg.mode == 'walk';
              final isPrivateCar = leg.mode == 'private_car';
              final isFerryLeg = leg.mode == 'ferry';
              final isTransitLeg = _transitModes.contains(leg.mode);
              final legColor = _modeColor(leg.mode);
              final typeLabel = isWalkLeg ? 'Walk' : isTransitLeg ? 'Ride' : 'Book';
              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: legColor.withAlpha(12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: legColor.withAlpha(45)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Mode icon badge
                      Container(
                        width: 30, height: 30,
                        decoration: BoxDecoration(
                          color: legColor.withAlpha(30),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(_modeIcon(leg.mode), size: 15, color: legColor),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(leg.instruction,
                                style: TextStyle(fontSize: 11, color: c.text),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis),
                            const SizedBox(height: 3),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: legColor.withAlpha(30),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(typeLabel,
                                  style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: legColor)),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('${leg.duration}m',
                              style: TextStyle(fontSize: 10, color: c.textFaint)),
                          Text('${leg.distance.toStringAsFixed(1)} km',
                              style: TextStyle(fontSize: 10, color: c.textFaint)),
                          const SizedBox(height: 3),
                          if (!isPrivateCar)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                              decoration: BoxDecoration(
                                color: (isWalkLeg || isFerryLeg)
                                    ? c.borderSubtle.withAlpha(40)
                                    : AppColors.amber.withAlpha(22),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: (isWalkLeg || isFerryLeg)
                                      ? c.borderSubtle
                                      : AppColors.amber.withAlpha(70),
                                ),
                              ),
                              child: Column(
                                children: [
                                  Text(
                                    isWalkLeg ? 'Free' : isFerryLeg ? 'Varies' : '₱${leg.fare.toStringAsFixed(0)}',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: (isWalkLeg || isFerryLeg) ? c.textFaint : AppColors.amber,
                                    ),
                                  ),
                                  Text('Fare',
                                      style: TextStyle(fontSize: 8, color: c.textFaint)),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
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
          if (_routeStops.isNotEmpty) ...[
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

  Widget _transportChip(String value, String label, IconData icon, AppColorScheme c) {
    final activeChip = _transportCategory == 'private'
        ? 'private'
        : _commuteSubMode == 'grab_taxi'
            ? 'grab_taxi'
            : 'bus';
    final selected = activeChip == value;
    return GestureDetector(
      onTap: () {
        setState(() {
          if (value == 'private') {
            _transportCategory = 'private';
          } else {
            _transportCategory = 'commute';
            _commuteSubMode = value == 'grab_taxi' ? 'grab_taxi' : 'saver';
          }
          _commuteLegs = [];
          _currentLegIndex = 0;
        });
        if (_routeStops.isNotEmpty) _calculateRoute(_routeStops);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.red500 : c.surfaceElevated,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? AppColors.red500 : c.borderSubtle),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 13, color: selected ? Colors.white : c.textMuted),
            const SizedBox(width: 4),
            Text(label,
                style: TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w600,
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
