import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../models/itinerary.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';
import '../trips/trip_overview_screen.dart';

class SavedScreen extends StatefulWidget {
  const SavedScreen({super.key});
  @override
  State<SavedScreen> createState() => _SavedScreenState();
}

class _SavedScreenState extends State<SavedScreen> {
  List<SavedItinerary> _trips = [];
  bool _loading = true;
  String _search = '';
  String? _filterType; // null = All
  final TextEditingController _searchCtrl = TextEditingController();

  static const _tripTypes = ['Adventure', 'Cultural', 'Beach', 'Nature', 'Family', 'Budget'];

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(() => setState(() => _search = _searchCtrl.text.toLowerCase()));
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<SavedItinerary> get _filtered {
    return _trips.where((t) {
      final matchSearch = _search.isEmpty || t.title.toLowerCase().contains(_search);
      final matchType = _filterType == null ||
          (t.tripType?.toLowerCase() == _filterType!.toLowerCase());
      return matchSearch && matchType;
    }).toList();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = context.read<ApiService>();
      final res = await api.get('/ai/itinerary/saved', auth: true);
      setState(() {
        _trips = (res['data'] as List? ?? [])
            .map((e) => SavedItinerary.fromJson(e as Map<String, dynamic>))
            .toList();
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _delete(String id) async {
    try {
      final api = context.read<ApiService>();
      await api.delete('/ai/itinerary/$id', auth: true);
      setState(() => _trips.removeWhere((t) => t.id == id));
      if (mounted) AppToast.success(context, 'Trip deleted');
    } catch (_) {
      if (mounted) AppToast.error(context, 'Could not delete trip');
    }
  }

  Future<void> _duplicate(SavedItinerary trip) async {
    try {
      final api = context.read<ApiService>();
      await api.post('/ai/itinerary/save', body: {
        'title': '${trip.title} (copy)',
        'days': trip.days,
        'cluster_ids': trip.clusterIds,
        'trip_type': trip.tripType,
        'transport_mode': trip.transportMode,
        'group_type': trip.groupType,
        'total_distance': trip.totalDistance,
        'estimated_time': trip.estimatedTime,
        'estimated_cost': trip.estimatedCost,
        'days_data': trip.daysData.map((d) => {
          'dayNumber': d.dayNumber,
          'stops': d.stops.map((s) => {
            'destination': {'id': s.destination.id},
            'visit_duration': s.visitDuration,
          }).toList(),
        }).toList(),
      }, auth: true);
      if (mounted) AppToast.success(context, 'Trip duplicated');
      _load();
    } catch (_) {
      if (mounted) AppToast.error(context, 'Could not duplicate trip');
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final filtered = _filtered;

    return GradientBackground(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Row(
                children: [
                  Text('Saved Trips',
                      style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: c.textStrong))
                      .animate().fadeIn(duration: 400.ms),
                  const Spacer(),
                  IconButton(
                    icon: Icon(FluentIcons.refresh, size: 18, color: c.textMuted),
                    onPressed: _load,
                  ),
                ],
              ),
            ),
            // Search bar
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: TextBox(
                controller: _searchCtrl,
                placeholder: 'Search trips...',
                prefix: Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: Icon(FluentIcons.search, size: 14, color: c.textFaint),
                ),
                suffix: _search.isNotEmpty
                    ? GestureDetector(
                        onTap: () { _searchCtrl.clear(); setState(() => _search = ''); },
                        child: Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: Icon(FluentIcons.clear, size: 12, color: c.textFaint),
                        ),
                      )
                    : null,
              ),
            ),
            // Filter chips
            const SizedBox(height: 10),
            SizedBox(
              height: 32,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                children: [
                  _filterChip('All', null, c),
                  ..._tripTypes.map((t) => _filterChip(t, t, c)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (_loading)
              const Expanded(child: Center(child: ProgressRing()))
            else if (_trips.isEmpty)
              Expanded(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(FluentIcons.save, size: 56, color: c.textFaint),
                      const SizedBox(height: 16),
                      Text('No saved trips yet',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.textMuted)),
                      const SizedBox(height: 8),
                      Text('Generate an AI itinerary and save it here.',
                          style: TextStyle(fontSize: 13, color: c.textFaint)),
                    ],
                  ),
                ),
              )
            else if (filtered.isEmpty)
              Expanded(
                child: Center(
                  child: Text('No trips match your search',
                      style: TextStyle(fontSize: 14, color: c.textFaint)),
                ),
              )
            else
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, i) {
                    final trip = filtered[i];
                    return _TripCard(
                      trip: trip,
                      onTap: () async {
                        await Navigator.of(context).push(FluentPageRoute(
                          builder: (_) => TripOverviewScreen(itineraryId: trip.id),
                        ));
                        _load();
                      },
                      onDelete: () => _delete(trip.id),
                      onDuplicate: () => _duplicate(trip),
                    ).animate().fadeIn(delay: (i * 60).ms, duration: 400.ms);
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _filterChip(String label, String? type, AppColorScheme c) {
    final selected = _filterType == type;
    return GestureDetector(
      onTap: () => setState(() => _filterType = type),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AppColors.red500 : c.surfaceElevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: selected ? AppColors.red500 : c.borderMedium),
        ),
        child: Text(label,
            style: TextStyle(
              fontSize: 12, fontWeight: FontWeight.w600,
              color: selected ? Colors.white : c.textMuted,
            )),
      ),
    );
  }
}

class _TripCard extends StatelessWidget {
  final SavedItinerary trip;
  final VoidCallback onTap;
  final VoidCallback onDelete;
  final VoidCallback onDuplicate;

  const _TripCard({
    required this.trip,
    required this.onTap,
    required this.onDelete,
    required this.onDuplicate,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return GestureDetector(
      onTap: onTap,
      child: GlassCard(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: AppColors.red500.withAlpha(20),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('${trip.days}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.red400)),
                  Text(trip.days == 1 ? 'day' : 'days', style: TextStyle(fontSize: 9, color: AppColors.red400)),
                ],
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(trip.title,
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.textStrong),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Row(children: [
                    Icon(FluentIcons.poi, size: 11, color: c.textFaint),
                    const SizedBox(width: 3),
                    Text('${trip.stopCount} stops',
                        style: TextStyle(fontSize: 12, color: c.textMuted)),
                    if (trip.tripType != null) ...[
                      const SizedBox(width: 10),
                      Text('·', style: TextStyle(color: c.textFaint)),
                      const SizedBox(width: 10),
                      Text(trip.tripType!,
                          style: TextStyle(fontSize: 12, color: c.textMuted)),
                    ],
                  ]),
                  const SizedBox(height: 4),
                  Text(
                    _formatDate(trip.createdAt),
                    style: TextStyle(fontSize: 11, color: c.textFaint),
                  ),
                ],
              ),
            ),
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(FluentIcons.chevron_right, size: 14, color: c.textFaint),
                const SizedBox(height: 8),
                GestureDetector(
                  onTap: onDuplicate,
                  child: Icon(FluentIcons.copy, size: 15, color: c.textMuted),
                ),
                const SizedBox(height: 8),
                GestureDetector(
                  onTap: onDelete,
                  child: Icon(FluentIcons.delete, size: 16, color: AppColors.red400.withAlpha(180)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime d) {
    final months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${months[d.month - 1]} ${d.day}, ${d.year}';
  }
}
