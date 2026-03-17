import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../models/itinerary.dart';
import '../../models/transport_leg.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../map/map_screen.dart';

class DayDetailScreen extends StatefulWidget {
  final DayItinerary day;
  final List<DayItinerary> allDays;
  const DayDetailScreen({super.key, required this.day, this.allDays = const []});

  @override
  State<DayDetailScreen> createState() => _DayDetailScreenState();
}

class _DayDetailScreenState extends State<DayDetailScreen> {
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.allDays.indexWhere((d) => d.dayNumber == widget.day.dayNumber);
    if (_currentIndex < 0) _currentIndex = 0;
  }

  DayItinerary get _day =>
      widget.allDays.isNotEmpty ? widget.allDays[_currentIndex] : widget.day;

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final day = _day;
    final multiDay = widget.allDays.length > 1;

    return GradientBackground(
      child: SafeArea(
        child: Column(
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
                      onTap: () => setState(() => _currentIndex = i),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                        decoration: BoxDecoration(
                          color: selected ? AppColors.red500 : c.surfaceElevated,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                              color: selected ? AppColors.red500 : c.borderMedium),
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
                        ).animate().fadeIn(delay: (100 + i * 80).ms, duration: 400.ms);
                      },
                    ),
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

class _StopTimelineItem extends StatelessWidget {
  final ItineraryStop stop;
  final int index;
  final bool isLast;

  const _StopTimelineItem({required this.stop, required this.index, required this.isLast});

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

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Timeline line + circle
          SizedBox(
            width: 40,
            child: Column(
              children: [
                Container(
                  width: 28, height: 28,
                  decoration: BoxDecoration(
                    color: AppColors.red500,
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text('${index + 1}',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: AppColors.red500.withAlpha(40),
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
              child: GlassCard(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(stop.destination.name,
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.textStrong)),
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
