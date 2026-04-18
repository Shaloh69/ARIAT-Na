import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../services/location_service.dart';
import '../../models/itinerary.dart';
import '../../models/trip_params.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';
import 'trip_setup_screen.dart';
import '../map/map_screen.dart';

class TripsScreen extends StatefulWidget {
  const TripsScreen({super.key});
  @override
  State<TripsScreen> createState() => _TripsScreenState();
}

class _TripsScreenState extends State<TripsScreen> {
  bool _generating = false;

  Future<void> _startPlan() async {
    final params = await Navigator.of(context).push<TripSetupParams>(
      FluentPageRoute(builder: (_) => const TripSetupScreen()),
    );
    if (params == null || !mounted) return;

    final loc = context.read<LocationService>().currentPosition;
    final startLat = loc?.latitude ?? 10.3157;
    final startLon = loc?.longitude ?? 123.8854;

    setState(() => _generating = true);
    try {
      final api = context.read<ApiService>();
      final body = params.toGenerateBody(startLat, startLon);
      final res = await api.post('/ai/itinerary/generate', body: body, auth: true);
      if (!mounted) return;
      setState(() => _generating = false);

      if (res['success'] == true) {
        final data = res['data'] as Map<String, dynamic>;
        MultiDayItinerary multiDay;
        if (data.containsKey('days') && data['days'] is List) {
          multiDay = MultiDayItinerary.fromJson(data);
        } else {
          // Single day result — wrap
          final single = DayItinerary.fromJson({'dayNumber': 1, 'itinerary': data, 'stops': data['stops']});
          multiDay = MultiDayItinerary(
            days: [single],
            totalDays: 1,
            totalStops: single.stops.length,
            totalDistance: (data['totalDistance'] as num?)?.toDouble() ?? 0,
            estimatedTravelTime: data['estimatedTravelTime'] ?? 0,
            estimatedVisitTime: data['estimatedVisitTime'] ?? 0,
            estimatedTotalTime: data['estimatedTotalTime'] ?? 0,
            estimatedCost: (data['estimatedCost'] as num?)?.toDouble() ?? 0,
          );
        }

        if (multiDay.totalStops == 0) {
          AppToast.warning(context, 'No destinations found for your criteria. Try adjusting filters.');
          return;
        }

        final destinations = multiDay.days
            .expand((day) => day.stops)
            .map((stop) => stop.destination)
            .toList();
        await Navigator.of(context).push(FluentPageRoute(
          builder: (_) => MapScreen(
            initialDestinations: destinations,
            initialTransportMode: params.transportMode,
            isAiItinerary: true,
          ),
        ));
      } else {
        AppToast.error(context, res['message'] ?? 'Generation failed');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _generating = false);
      AppToast.error(context, 'Could not generate itinerary. Check your connection.');
    }
  }

  Future<void> _runQuickStart(TripSetupParams p) async {
    final loc = context.read<LocationService>().currentPosition;
    final api = context.read<ApiService>();
    setState(() => _generating = true);
    try {
      final res = await api.post('/ai/itinerary/generate',
          body: p.toGenerateBody(loc?.latitude ?? 10.3157, loc?.longitude ?? 123.8854),
          auth: true);
      if (!mounted) return;
      setState(() => _generating = false);
      if (res['success'] == true) {
        final data = res['data'] as Map<String, dynamic>;
        final multiDay = data.containsKey('days') && data['days'] is List
            ? MultiDayItinerary.fromJson(data)
            : MultiDayItinerary(
                days: [DayItinerary.fromJson({'dayNumber': 1, 'stops': data['stops'] ?? []})],
                totalDays: 1,
                totalStops: (data['stops'] as List?)?.length ?? 0,
                totalDistance: (data['totalDistance'] as num?)?.toDouble() ?? 0,
                estimatedTravelTime: data['estimatedTravelTime'] ?? 0,
                estimatedVisitTime: data['estimatedVisitTime'] ?? 0,
                estimatedTotalTime: data['estimatedTotalTime'] ?? 0,
                estimatedCost: (data['estimatedCost'] as num?)?.toDouble() ?? 0,
              );
        if (multiDay.totalStops == 0) {
          AppToast.warning(context, 'No destinations matched. Try a custom plan.');
          return;
        }
        final destinations = multiDay.days
            .expand((day) => day.stops)
            .map((stop) => stop.destination)
            .toList();
        await Navigator.of(context).push(FluentPageRoute(
          builder: (_) => MapScreen(
            initialDestinations: destinations,
            initialTransportMode: p.transportMode,
            isAiItinerary: true,
          ),
        ));
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _generating = false);
      AppToast.error(context, 'Generation failed');
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;

    return GradientBackground(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Plan a Trip',
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: c.textStrong))
                  .animate().fadeIn(duration: 400.ms),
              const SizedBox(height: 6),
              Text('AI-powered Cebu itinerary generator',
                  style: TextStyle(fontSize: 14, color: c.textMuted))
                  .animate().fadeIn(delay: 100.ms, duration: 400.ms),
              const SizedBox(height: 32),

              // Hero card
              GlassCard(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Container(
                      width: 72, height: 72,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [AppColors.red500, AppColors.purple],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Icon(FluentIcons.lightbulb, size: 32, color: Colors.white),
                    ),
                    const SizedBox(height: 16),
                    Text('AI Itinerary Generator',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.textStrong)),
                    const SizedBox(height: 8),
                    Text(
                      'Tell us where you want to go, your interests, and how long you have. '
                      'Our AI will build the perfect Cebu trip for you — day by day.',
                      style: TextStyle(fontSize: 13, color: c.textMuted, height: 1.5),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      child: _generating
                          ? const Center(child: ProgressRing())
                          : FilledButton(
                              onPressed: _startPlan,
                              style: ButtonStyle(
                                backgroundColor: WidgetStateProperty.all(AppColors.red500),
                                shape: WidgetStateProperty.all(
                                    RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                                padding: WidgetStateProperty.all(
                                    const EdgeInsets.symmetric(vertical: 14)),
                              ),
                              child: const Text('Start Planning',
                                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                            ),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 200.ms, duration: 500.ms).slideY(begin: 0.05, end: 0, duration: 500.ms),

              const SizedBox(height: 16),

              // Manual route planner card
              GestureDetector(
                onTap: () => Navigator.of(context).push(
                  FluentPageRoute(builder: (_) => const MapScreen()),
                ),
                child: GlassCard(
                  padding: const EdgeInsets.all(18),
                  child: Row(
                    children: [
                      Container(
                        width: 52, height: 52,
                        decoration: BoxDecoration(
                          color: AppColors.blue.withAlpha(25),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(FluentIcons.map_directions, size: 24, color: AppColors.blue),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Build Your Own Route',
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.textStrong)),
                            const SizedBox(height: 3),
                            Text('Pick stops on the map manually — no AI needed',
                                style: TextStyle(fontSize: 12, color: c.textMuted)),
                          ],
                        ),
                      ),
                      Icon(FluentIcons.chevron_right, size: 14, color: c.textFaint),
                    ],
                  ),
                ),
              ).animate().fadeIn(delay: 280.ms, duration: 400.ms),

              const SizedBox(height: 24),

              // Quick-start chips
              Text('Quick Start', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.textStrong))
                  .animate().fadeIn(delay: 300.ms, duration: 400.ms),
              const SizedBox(height: 10),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: _quickStarts.map((q) => _QuickChip(
                  icon: q['icon'] as IconData,
                  label: q['label'] as String,
                  params: q['params'] as TripSetupParams,
                  onTap: _runQuickStart,
                )).toList(),
              ).animate().fadeIn(delay: 400.ms, duration: 400.ms),
            ],
          ),
        ),
      ),
    );
  }
}

const _quickStarts = [
  {
    'icon': FluentIcons.sunny,
    'label': 'South Cebu Day',
    'params': TripSetupParams(
      clusterIds: ['cls-south-001'],
      interests: ['beach', 'nature', 'waterfalls'],
      days: 1,
      hoursPerDay: 10,
      maxStopsPerDay: 5,
      tripType: 'nature',
    ),
  },
  {
    'icon': FluentIcons.city_next,
    'label': 'Metro Food Crawl',
    'params': TripSetupParams(
      clusterIds: ['cls-metro-001'],
      interests: ['food', 'cafes', 'shopping'],
      days: 1,
      hoursPerDay: 8,
      maxStopsPerDay: 5,
      tripType: 'food',
    ),
  },
  {
    'icon': FluentIcons.globe,
    'label': 'Island Escape',
    'params': TripSetupParams(
      clusterIds: ['cls-isl-001'],
      interests: ['beach', 'island hopping'],
      days: 2,
      hoursPerDay: 9,
      maxStopsPerDay: 4,
      tripType: 'beach',
    ),
  },
  {
    'icon': FluentIcons.history,
    'label': 'Heritage Route',
    'params': TripSetupParams(
      clusterIds: ['cls-south-001', 'cls-metro-001'],
      interests: ['heritage', 'churches', 'history'],
      days: 2,
      hoursPerDay: 8,
      maxStopsPerDay: 4,
      tripType: 'heritage',
    ),
  },
];

class _QuickChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final TripSetupParams params;
  final void Function(TripSetupParams) onTap;

  const _QuickChip({
    required this.icon,
    required this.label,
    required this.params,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return GestureDetector(
      onTap: () => onTap(params),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: c.surfaceElevated,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: c.borderMedium),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: AppColors.red400),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: c.text)),
          ],
        ),
      ),
    );
  }
}
