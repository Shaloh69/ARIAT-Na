import 'dart:ui';
import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../services/api_service.dart';
import '../../models/destination.dart';
import '../../models/route_result.dart';
import '../../theme/app_theme.dart';
import '../../widgets/toast_overlay.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});
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
  bool _showRoutePanel = false;

  // Default center — Philippines
  static const _defaultCenter = LatLng(14.5995, 120.9842);

  @override
  void initState() {
    super.initState();
    _loadDestinations();
  }

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

  void _onMapTap(LatLng point) {
    if (!_showRoutePanel) return;
    if (_routeStart == null) {
      setState(() {
        _routeStart = point;
        _routeStops = [];
        _routeLegs = [];
        _routeError = null;
      });
      AppToast.info(context, 'Start set. Tap map or select destination to add stop.');
    } else {
      _addStop(_RouteStop(
        position: point,
        name: 'Stop ${_routeStops.length + 1}',
      ));
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

  Future<void> _calculateRoute(List<_RouteStop> stops) async {
    if (_routeStart == null || stops.isEmpty) return;

    setState(() {
      _routeLoading = true;
      _routeError = null;
    });

    try {
      final api = context.read<ApiService>();
      final legs = <RouteResult>[];
      final waypoints = [_routeStart!, ...stops.map((s) => s.position)];

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
        _routeLoading = false;
      });
      if (mounted) AppToast.success(context, '${totalDist.toStringAsFixed(2)} km, ~$totalTime min');
    } catch (e) {
      setState(() {
        _routeError = e.toString().replaceFirst('Exception: ', '');
        _routeLoading = false;
      });
      if (mounted) AppToast.error(context, 'Route calculation failed');
    }
  }

  void _clearRoute() {
    setState(() {
      _routeStart = null;
      _routeStops = [];
      _routeLegs = [];
      _routeError = null;
    });
  }

  List<LatLng> _routePolyline(RouteResult leg) {
    if (leg.routeGeometry != null && leg.routeGeometry!.length >= 2) {
      return leg.routeGeometry!.map((c) => LatLng(c[0], c[1])).toList();
    }
    return leg.path.map((p) => LatLng(p.latitude, p.longitude)).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Map
        FlutterMap(
          mapController: _mapController,
          options: MapOptions(
            initialCenter: _defaultCenter,
            initialZoom: 13,
            onTap: (_, point) => _onMapTap(point),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.ariatna.mobile',
            ),
            // Destination markers
            MarkerLayer(
              markers: _destinations.map((d) => Marker(
                point: LatLng(d.latitude, d.longitude),
                width: 36,
                height: 36,
                child: GestureDetector(
                  onTap: () {
                    if (_showRoutePanel) {
                      _addDestinationStop(d);
                    }
                  },
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.red500,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                      boxShadow: [BoxShadow(color: AppColors.red500.withAlpha(100), blurRadius: 8)],
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
                  width: 28,
                  height: 28,
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
                    width: 28,
                    height: 28,
                    child: Container(
                      decoration: BoxDecoration(
                        color: isLast ? const Color(0xFFDC2626) : AppColors.purple,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: Center(
                        child: Text('${idx + 1}', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
                      ),
                    ),
                  );
                }).toList(),
              ),
            // Route polylines
            if (_routeLegs.isNotEmpty)
              PolylineLayer(
                polylines: _routeLegs.map((leg) => Polyline(
                  points: _routePolyline(leg),
                  strokeWidth: 5,
                  color: AppColors.purple.withAlpha(200),
                )).toList(),
              ),
          ],
        ),

        // Route toggle button
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
                    color: _showRoutePanel ? AppColors.red500 : AppColors.surfaceCard.withAlpha(220),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withAlpha(20)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(FluentIcons.map_directions, size: 16, color: _showRoutePanel ? Colors.white : AppColors.text),
                      const SizedBox(width: 6),
                      Text('Route', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _showRoutePanel ? Colors.white : AppColors.text)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),

        // Route panel
        if (_showRoutePanel)
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                child: Container(
                  constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.45),
                  padding: const EdgeInsets.fromLTRB(20, 14, 20, 10),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceCard.withAlpha(230),
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                    border: Border(top: BorderSide(color: Colors.white.withAlpha(20))),
                  ),
                  child: SingleChildScrollView(
                    child: _buildRoutePanel(),
                  ),
                ),
              ),
            ).animate().slideY(begin: 1, end: 0, duration: 300.ms, curve: Curves.easeOut),
          ),
      ],
    );
  }

  Widget _buildRoutePanel() {
    final totalDist = _routeLegs.fold<double>(0, (s, l) => s + l.totalDistance);
    final totalTime = _routeLegs.fold<int>(0, (s, l) => s + l.estimatedTime);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Handle bar
        Center(
          child: Container(
            width: 36, height: 4,
            decoration: BoxDecoration(color: Colors.white.withAlpha(40), borderRadius: BorderRadius.circular(2)),
          ),
        ),
        const SizedBox(height: 12),

        Row(
          children: [
            const Text('Route Planner', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.textStrong)),
            const Spacer(),
            if (_routeStart != null)
              GestureDetector(
                onTap: _clearRoute,
                child: const Text('Clear', style: TextStyle(fontSize: 12, color: Color(0xFFDC2626), fontWeight: FontWeight.w500)),
              ),
          ],
        ),
        const SizedBox(height: 12),

        // Optimize toggle
        Row(
          children: [
            _optimizeChip('distance', 'Shortest'),
            const SizedBox(width: 8),
            _optimizeChip('time', 'Fastest'),
          ],
        ),
        const SizedBox(height: 12),

        // Destination picker
        if (_routeStart != null && _destinations.isNotEmpty) ...[
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
                      color: AppColors.surfaceElevated,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: Colors.white.withAlpha(15)),
                    ),
                    child: Text(d.name, style: const TextStyle(fontSize: 11, color: AppColors.text)),
                  ),
                ),
              )).toList(),
            ),
          ),
          const SizedBox(height: 10),
        ],

        // Stops list
        if (_routeStops.isNotEmpty) ...[
          ...List.generate(_routeStops.length, (i) {
            final stop = _routeStops[i];
            return Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  Container(
                    width: 20, height: 20,
                    decoration: BoxDecoration(
                      color: i == _routeStops.length - 1 ? const Color(0xFFDC2626) : AppColors.purple,
                      shape: BoxShape.circle,
                    ),
                    child: Center(child: Text('${i + 1}', style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w700))),
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: Text(stop.name, style: const TextStyle(fontSize: 12, color: AppColors.text), overflow: TextOverflow.ellipsis)),
                  GestureDetector(
                    onTap: () => _removeStop(i),
                    child: const Icon(FluentIcons.chrome_close, size: 12, color: Color(0xFFDC2626)),
                  ),
                ],
              ),
            );
          }),
          const SizedBox(height: 6),
        ],

        // Status
        if (_routeStart == null)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.blue.withAlpha(20), borderRadius: BorderRadius.circular(10)),
            child: const Row(
              children: [
                Icon(FluentIcons.touch_pointer, size: 16, color: AppColors.blue),
                SizedBox(width: 8),
                Text('Tap the map to set your start point', style: TextStyle(fontSize: 12, color: AppColors.blue)),
              ],
            ),
          )
        else if (_routeStops.isEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.blue.withAlpha(20), borderRadius: BorderRadius.circular(10)),
            child: const Row(
              children: [
                Icon(FluentIcons.add, size: 16, color: AppColors.blue),
                SizedBox(width: 8),
                Expanded(child: Text('Tap map or pick a destination above', style: TextStyle(fontSize: 12, color: AppColors.blue))),
              ],
            ),
          )
        else if (_routeLoading)
          const Padding(
            padding: EdgeInsets.all(12),
            child: Center(child: ProgressRing(strokeWidth: 2)),
          )
        else if (_routeLegs.isNotEmpty) ...[
          // Results summary
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.green.withAlpha(20), borderRadius: BorderRadius.circular(10)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                Column(children: [
                  Text('${totalDist.toStringAsFixed(2)} km', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textStrong)),
                  const Text('Distance', style: TextStyle(fontSize: 10, color: AppColors.textFaint)),
                ]),
                Container(width: 1, height: 28, color: Colors.white.withAlpha(15)),
                Column(children: [
                  Text('$totalTime min', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textStrong)),
                  const Text('Time', style: TextStyle(fontSize: 10, color: AppColors.textFaint)),
                ]),
                Container(width: 1, height: 28, color: Colors.white.withAlpha(15)),
                Column(children: [
                  Text('${_routeLegs.length}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textStrong)),
                  Text(_routeLegs.length == 1 ? 'Leg' : 'Legs', style: const TextStyle(fontSize: 10, color: AppColors.textFaint)),
                ]),
              ],
            ),
          ),
        ],

        if (_routeError != null) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: const Color(0xFFDC2626).withAlpha(20), borderRadius: BorderRadius.circular(10)),
            child: Row(
              children: [
                const Icon(FluentIcons.error_badge, size: 14, color: Color(0xFFDC2626)),
                const SizedBox(width: 8),
                Expanded(child: Text(_routeError!, style: const TextStyle(fontSize: 11, color: Color(0xFFFCA5A5)))),
              ],
            ),
          ),
        ],

        SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
      ],
    );
  }

  Widget _optimizeChip(String value, String label) {
    final isSelected = _optimizeFor == value;
    return GestureDetector(
      onTap: () {
        setState(() => _optimizeFor = value);
        if (_routeStops.isNotEmpty) _calculateRoute(_routeStops);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.red500 : AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: isSelected ? AppColors.red500 : Colors.white.withAlpha(15)),
        ),
        child: Text(label, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400, color: isSelected ? Colors.white : AppColors.textMuted)),
      ),
    );
  }
}

class _RouteStop {
  final LatLng position;
  final String name;
  final String? destId;
  _RouteStop({required this.position, required this.name, this.destId});
}
