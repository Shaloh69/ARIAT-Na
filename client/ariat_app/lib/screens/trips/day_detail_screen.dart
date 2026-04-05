import 'dart:async';
import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../models/destination.dart';
import '../../models/itinerary.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../map/map_screen.dart';
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

  // Mutable stops per day — key = dayNumber
  late Map<int, List<ItineraryStop>> _dayStops;

  // Which stop is "active" (most recently arrived at)
  int _activeStopIdx = -1;

  // Arrival banner state
  bool _showArrivedBanner = false;
  String _arrivedName = '';
  Timer? _bannerTimer;

  // Arrival stream subscription
  StreamSubscription<String>? _arrivalSub;

  // Rec loading state
  bool _loadingRecs = false;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.allDays.indexWhere((d) => d.dayNumber == widget.day.dayNumber);
    if (_currentIndex < 0) _currentIndex = 0;

    // Build mutable copy of stops for all days
    _dayStops = {
      for (final d in widget.allDays.isNotEmpty ? widget.allDays : [widget.day])
        d.dayNumber: List<ItineraryStop>.from(d.stops),
    };

    // Start location tracking and register monitored destinations
    WidgetsBinding.instance.addPostFrameCallback((_) => _initTracking());
  }

  void _initTracking() {
    final locationService = context.read<LocationService>();
    locationService.startTracking();

    // Register current day's stops for proximity monitoring
    for (final stop in _currentDayStops) {
      locationService.monitorDestination(
        stop.destination.id,
        stop.destination.name,
        stop.destination.latitude,
        stop.destination.longitude,
      );
    }

    // Subscribe to arrival events
    _arrivalSub = locationService.arrivedStream.listen(_onArrived);
  }

  void _onArrived(String destId) {
    final stops = _currentDayStops;
    final idx = stops.indexWhere((s) => s.destination.id == destId);
    if (idx < 0) return;

    setState(() {
      _activeStopIdx = idx;
      _arrivedName = stops[idx].destination.name;
      _showArrivedBanner = true;
    });

    // Auto-dismiss banner after 5 seconds
    _bannerTimer?.cancel();
    _bannerTimer = Timer(const Duration(seconds: 5), () {
      if (mounted) setState(() => _showArrivedBanner = false);
    });

    // Fetch nearby recommendations
    _fetchNearbyRecs(stops[idx]);
  }

  Future<void> _fetchNearbyRecs(ItineraryStop stop) async {
    setState(() => _loadingRecs = true);
    try {
      final api = context.read<ApiService>();
      final visitedIds = _currentDayStops.map((s) => s.destination.id).toList();
      final result = await api.post('/ai/recommend/nearby', body: {
        'lat': stop.destination.latitude,
        'lon': stop.destination.longitude,
        'visited_ids': visitedIds,
        if (stop.destination.clusterId != null)
          'cluster_id': stop.destination.clusterId,
      }, auth: true);

      if (!mounted) return;
      if (result['success'] == true && result['data'] != null) {
        final recs = NearbyRecommendations.fromJson(
            Map<String, dynamic>.from(result['data'] as Map));
        if (!recs.isEmpty) {
          await NearbyRecommendationsSheet.show(context, recs, _insertDestination);
        }
      }
    } catch (_) {
      // Silently ignore — recs are non-critical
    } finally {
      if (mounted) setState(() => _loadingRecs = false);
    }
  }

  /// Insert a pinned/recommended destination right after the current active stop
  void _insertDestination(Destination dest) {
    final dayNum = _day.dayNumber;
    final stops = List<ItineraryStop>.from(_dayStops[dayNum] ?? []);
    final insertAt = (_activeStopIdx >= 0 ? _activeStopIdx + 1 : stops.length)
        .clamp(0, stops.length);

    final newStop = ItineraryStop(
      destination: dest,
      score: 0,
      reason: 'Added from nearby recommendations',
      visitDuration: dest.averageVisitDuration > 0 ? dest.averageVisitDuration : 60,
      legDistance: 0,
      legTravelTime: 0,
      cumulativeTime: insertAt > 0 ? (stops[insertAt - 1].cumulativeTime + stops[insertAt - 1].visitDuration) : 0,
      dayNumber: dayNum,
    );

    stops.insert(insertAt, newStop);

    // Register new destination for proximity monitoring
    context.read<LocationService>().monitorDestination(
      dest.id, dest.name, dest.latitude, dest.longitude,
    );

    setState(() {
      _dayStops[dayNum] = stops;
      // If we inserted after active, bump active index only if needed
      if (insertAt <= _activeStopIdx) _activeStopIdx++;
    });
  }

  List<ItineraryStop> get _currentDayStops =>
      _dayStops[_day.dayNumber] ?? [];

  DayItinerary get _day {
    if (widget.allDays.isNotEmpty && _currentIndex < widget.allDays.length) {
      final orig = widget.allDays[_currentIndex];
      return DayItinerary(
        dayNumber: orig.dayNumber,
        clusterName: orig.clusterName,
        stops: _dayStops[orig.dayNumber] ?? orig.stops,
        estimatedTravelTime: orig.estimatedTravelTime,
        estimatedVisitTime: orig.estimatedVisitTime,
        estimatedTotalTime: orig.estimatedTotalTime,
        estimatedCost: orig.estimatedCost,
      );
    }
    final orig = widget.day;
    return DayItinerary(
      dayNumber: orig.dayNumber,
      clusterName: orig.clusterName,
      stops: _dayStops[orig.dayNumber] ?? orig.stops,
      estimatedTravelTime: orig.estimatedTravelTime,
      estimatedVisitTime: orig.estimatedVisitTime,
      estimatedTotalTime: orig.estimatedTotalTime,
      estimatedCost: orig.estimatedCost,
    );
  }

  @override
  void dispose() {
    _arrivalSub?.cancel();
    _bannerTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final day = _day;
    final multiDay = widget.allDays.length > 1;

    return GradientBackground(
      child: SafeArea(
        child: Stack(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: () => Navigator.pop(context),
                        child: Container(
                          width: 36, height: 36,
                          decoration: BoxDecoration(
                            color: c.surfaceElevated,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: c.borderMedium),
                          ),
                          child: Icon(FluentIcons.chevron_left, size: 16, color: c.textMuted),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Day ${day.dayNumber}',
                              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: c.textStrong)),
                          if (day.clusterName != null)
                            Text(day.clusterName!,
                                style: TextStyle(fontSize: 12, color: c.textMuted)),
                        ],
                      ),
                      const Spacer(),
                      // Loading indicator for recs
                      if (_loadingRecs)
                        SizedBox(
                          width: 18, height: 18,
                          child: ProgressRing(strokeWidth: 2, activeColor: AppColors.red400),
                        ),
                    ],
                  ).animate().fadeIn(duration: 400.ms),
                ),

                // Day switcher tabs (multi-day only)
                if (multiDay) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 36,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      itemCount: widget.allDays.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (context, i) {
                        final selected = i == _currentIndex;
                        return GestureDetector(
                          onTap: () {
                            setState(() => _currentIndex = i);
                            // Re-register stops for new day
                            final locationService = context.read<LocationService>();
                            for (final stop in _currentDayStops) {
                              locationService.monitorDestination(
                                stop.destination.id,
                                stop.destination.name,
                                stop.destination.latitude,
                                stop.destination.longitude,
                              );
                            }
                          },
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                            decoration: BoxDecoration(
                              color: selected ? AppColors.red500 : c.surfaceElevated,
                              borderRadius: BorderRadius.circular(18),
                              border: Border.all(color: selected ? AppColors.red500 : c.borderMedium),
                            ),
                            child: Text(
                              'Day ${widget.allDays[i].dayNumber}',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: selected ? Colors.white : c.textMuted,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],

                // Summary bar
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                  child: GlassCard(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _summaryItem(FluentIcons.poi, '${day.stops.length}', 'Stops', AppColors.red400, c),
                        _divider(c),
                        _summaryItem(FluentIcons.car, _fmtMin(day.estimatedTravelTime), 'Drive', AppColors.blue, c),
                        _divider(c),
                        _summaryItem(FluentIcons.clock, _fmtMin(day.estimatedTotalTime), 'Total', AppColors.green, c),
                        _divider(c),
                        _summaryItem(FluentIcons.money, '₱${day.estimatedCost.toStringAsFixed(0)}', 'Cost', AppColors.amber, c),
                      ],
                    ),
                  ).animate().fadeIn(delay: 100.ms, duration: 400.ms),
                ),

                const SizedBox(height: 16),

                // Timeline
                Expanded(
                  child: day.stops.isEmpty
                      ? Center(child: Text('No stops for this day', style: TextStyle(color: c.textMuted)))
                      : ListView.builder(
                          key: ValueKey(_currentIndex),
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                          itemCount: day.stops.length,
                          itemBuilder: (context, i) {
                            return _StopTimelineItem(
                              stop: day.stops[i],
                              index: i,
                              isLast: i == day.stops.length - 1,
                              isActive: i == _activeStopIdx && _day.dayNumber == day.dayNumber,
                            ).animate().fadeIn(delay: (100 + i * 80).ms, duration: 400.ms);
                          },
                        ),
                ),
              ],
            ),

            // Arrived banner — slides down from top
            if (_showArrivedBanner)
              Positioned(
                top: 0, left: 0, right: 0,
                child: _ArrivedBanner(
                  destinationName: _arrivedName,
                  onDismiss: () => setState(() => _showArrivedBanner = false),
                ).animate()
                    .slideY(begin: -1, end: 0, duration: 400.ms, curve: Curves.easeOutBack)
                    .fadeIn(duration: 300.ms),
              ),
          ],
        ),
      ),
    );
  }

  Widget _summaryItem(IconData icon, String value, String label, Color color, AppColorScheme c) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.textStrong)),
        Text(label, style: TextStyle(fontSize: 10, color: c.textFaint)),
      ],
    );
  }

  Widget _divider(AppColorScheme c) =>
      Container(width: 1, height: 32, color: c.borderLight);

  String _fmtMin(int minutes) {
    if (minutes < 60) return '${minutes}m';
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return m > 0 ? '${h}h ${m}m' : '${h}h';
  }
}

// ---------------------------------------------------------------------------
// Arrived Banner
// ---------------------------------------------------------------------------
class _ArrivedBanner extends StatelessWidget {
  final String destinationName;
  final VoidCallback onDismiss;

  const _ArrivedBanner({required this.destinationName, required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.green.withAlpha(230), AppColors.green.withAlpha(180)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: AppColors.green.withAlpha(80),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: Colors.white.withAlpha(50),
              shape: BoxShape.circle,
            ),
            child: const Icon(FluentIcons.accept, size: 18, color: Colors.white),
          ).animate(onPlay: (c) => c.repeat(reverse: true))
              .scale(begin: const Offset(1, 1), end: const Offset(1.15, 1.15), duration: 600.ms),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('You\'ve arrived!',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
                Text(destinationName,
                    style: const TextStyle(fontSize: 11, color: Color(0xB3FFFFFF)),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: onDismiss,
            child: const Icon(FluentIcons.cancel, size: 14, color: Color(0xB3FFFFFF)),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Stop Timeline Item
// ---------------------------------------------------------------------------
class _StopTimelineItem extends StatelessWidget {
  final ItineraryStop stop;
  final int index;
  final bool isLast;
  final bool isActive;

  const _StopTimelineItem({
    required this.stop,
    required this.index,
    required this.isLast,
    this.isActive = false,
  });

  String _arrivalWindow() {
    final startMin = 8 * 60 + stop.cumulativeTime;
    final endMin = startMin + stop.visitDuration;
    return '${_fmt(startMin)} – ${_fmt(endMin)}';
  }

  String _fmt(int totalMin) {
    final h = (totalMin ~/ 60) % 24;
    final m = totalMin % 60;
    final suffix = h < 12 ? 'AM' : 'PM';
    final h12 = h == 0 ? 12 : (h > 12 ? h - 12 : h);
    return '$h12:${m.toString().padLeft(2, '0')} $suffix';
  }

  void _openDirections(BuildContext context) {
    Navigator.of(context).push(
      FluentPageRoute(builder: (_) => MapScreen(destination: stop.destination)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final dotColor = isActive ? AppColors.green : AppColors.red500;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Timeline line + circle
          SizedBox(
            width: 40,
            child: Column(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 400),
                  width: 28, height: 28,
                  decoration: BoxDecoration(
                    color: dotColor,
                    shape: BoxShape.circle,
                    boxShadow: isActive
                        ? [BoxShadow(color: AppColors.green.withAlpha(80), blurRadius: 10, spreadRadius: 2)]
                        : null,
                  ),
                  child: isActive
                      ? const Icon(FluentIcons.location_fill, size: 14, color: Colors.white)
                      : Center(
                          child: Text('${index + 1}',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
                        ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: dotColor.withAlpha(40),
                      margin: const EdgeInsets.symmetric(vertical: 4),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),

          // Card
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 12),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 400),
                decoration: isActive
                    ? BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.green.withAlpha(120), width: 1.5),
                        boxShadow: [
                          BoxShadow(color: AppColors.green.withAlpha(30), blurRadius: 12, spreadRadius: 0),
                        ],
                      )
                    : null,
                child: GlassCard(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(stop.destination.name,
                                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.textStrong)),
                                if (isActive)
                                  Container(
                                    margin: const EdgeInsets.only(top: 3),
                                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: AppColors.green.withAlpha(25),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                                      Icon(FluentIcons.location_fill, size: 9, color: AppColors.green),
                                      const SizedBox(width: 4),
                                      Text('You are here',
                                          style: TextStyle(fontSize: 9, color: AppColors.green, fontWeight: FontWeight.w600)),
                                    ]),
                                  ),
                              ],
                            ),
                          ),
                          GestureDetector(
                            onTap: () => _openDirections(context),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: AppColors.blue.withAlpha(20),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(FluentIcons.map_directions, size: 10, color: AppColors.blue),
                                  const SizedBox(width: 4),
                                  Text('Directions',
                                      style: TextStyle(fontSize: 10, color: AppColors.blue, fontWeight: FontWeight.w500)),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(children: [
                        Icon(FluentIcons.clock, size: 11, color: AppColors.green),
                        const SizedBox(width: 3),
                        Text(_arrivalWindow(),
                            style: TextStyle(fontSize: 11, color: AppColors.green, fontWeight: FontWeight.w600)),
                      ]),
                      if (stop.destination.areaLabel.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Row(children: [
                          Icon(FluentIcons.poi, size: 11, color: c.textFaint),
                          const SizedBox(width: 3),
                          Text(stop.destination.areaLabel,
                              style: TextStyle(fontSize: 11, color: c.textMuted)),
                        ]),
                      ],
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        children: [
                          if (stop.multiModalLegs != null && stop.multiModalLegs!.isNotEmpty) ...[
                            for (final leg in stop.multiModalLegs!)
                              _badge(_iconForMode(leg.mode), '${leg.duration}m ${_labelForMode(leg.mode)}', _colorForMode(leg.mode), c),
                            if (stop.legFare > 0)
                              _badge(FluentIcons.money, '₱${stop.legFare.toStringAsFixed(0)}', AppColors.amber, c),
                          ] else if (stop.legTravelTime > 0)
                            _badge(FluentIcons.car, '${stop.legTravelTime}m drive', AppColors.blue, c),
                          _badge(FluentIcons.clock, '${stop.visitDuration}m visit', AppColors.green, c),
                          if (stop.destination.entranceFeeLocal > 0)
                            _badge(FluentIcons.money, '₱${stop.destination.entranceFeeLocal.toStringAsFixed(0)}', AppColors.amber, c),
                        ],
                      ),
                      if (stop.reason.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(stop.reason,
                            style: TextStyle(fontSize: 11, color: c.textFaint, fontStyle: FontStyle.italic),
                            maxLines: 2, overflow: TextOverflow.ellipsis),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  IconData _iconForMode(String mode) {
    switch (mode) {
      case 'bus':
      case 'jeepney': return FluentIcons.bus_solid;
      case 'ferry': return FluentIcons.airplane;
      case 'taxi': return FluentIcons.taxi;
      case 'walk': return FluentIcons.location;
      case 'tricycle':
      case 'habal_habal': return FluentIcons.more;
      default: return FluentIcons.car;
    }
  }

  String _labelForMode(String mode) {
    switch (mode) {
      case 'bus': return 'bus';
      case 'jeepney': return 'jeepney';
      case 'ferry': return 'ferry';
      case 'taxi': return 'taxi';
      case 'walk': return 'walk';
      case 'tricycle': return 'tricycle';
      case 'habal_habal': return 'habal-habal';
      default: return 'drive';
    }
  }

  Color _colorForMode(String mode) {
    switch (mode) {
      case 'walk': return const Color(0xFF9ca3af);
      case 'bus':
      case 'jeepney': return const Color(0xFF2563eb);
      case 'tricycle':
      case 'habal_habal': return const Color(0xFF16a34a);
      case 'ferry': return const Color(0xFF7c3aed);
      case 'taxi': return const Color(0xFFf59e0b);
      default: return AppColors.blue;
    }
  }

  Widget _badge(IconData icon, String label, Color color, AppColorScheme c) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(20),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 10, color: color),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
