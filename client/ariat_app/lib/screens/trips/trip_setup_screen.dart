import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../models/destination.dart';
import '../../models/trip_params.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/toast_overlay.dart';

/// Multi-step trip planning wizard.
/// Returns a [TripSetupParams] when the user completes all steps.
class TripSetupScreen extends StatefulWidget {
  const TripSetupScreen({super.key});

  @override
  State<TripSetupScreen> createState() => _TripSetupScreenState();
}

class _TripSetupScreenState extends State<TripSetupScreen> {
  int _step = 0; // 0=Area 1=Preferences 2=Duration
  bool _loadingClusters = true;
  List<Cluster> _clusters = [];

  // Accumulated params
  List<String> _clusterIds = [];
  String? _tripType;
  String? _groupType;
  String? _transportMode;
  final List<String> _interests = [];
  int _days = 1;
  double _hoursPerDay = 8;
  int _maxStops = 4;
  double _budget = 0;

  @override
  void initState() {
    super.initState();
    _loadClusters();
  }

  Future<void> _loadClusters() async {
    try {
      final api = context.read<ApiService>();
      final res = await api.get('/clusters');
      if (!mounted) return;
      setState(() {
        _clusters = (res['data'] as List? ?? [])
            .map((e) => Cluster.fromJson(e as Map<String, dynamic>))
            .toList();
        _loadingClusters = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingClusters = false);
      AppToast.error(context, 'Could not load areas');
    }
  }

  void _next() {
    if (_step < 2) {
      setState(() => _step++);
    } else {
      _finish();
    }
  }

  void _finish() {
    Navigator.pop(
      context,
      TripSetupParams(
        clusterIds: _clusterIds,
        tripType: _tripType,
        groupType: _groupType,
        transportMode: _transportMode,
        budget: _budget,
        days: _days,
        hoursPerDay: _hoursPerDay,
        maxStopsPerDay: _maxStops,
        interests: List.from(_interests),
        optimizeFor: 'time',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;

    return GradientBackground(
      child: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () {
                      if (_step > 0) {
                        setState(() => _step--);
                      } else {
                        Navigator.pop(context);
                      }
                    },
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
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          ['Choose Area', 'Preferences', 'Duration & Budget'][_step],
                          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: c.textStrong),
                        ),
                        Text('Step ${_step + 1} of 3',
                            style: TextStyle(fontSize: 12, color: c.textMuted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Progress bar
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Row(
                children: List.generate(3, (i) => Expanded(
                  child: Container(
                    height: 4,
                    margin: EdgeInsets.only(right: i < 2 ? 4 : 0),
                    decoration: BoxDecoration(
                      color: i <= _step ? AppColors.red500 : c.surfaceElevated,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                )),
              ),
            ),

            const SizedBox(height: 16),

            Expanded(
              child: IndexedStack(
                index: _step,
                children: [
                  _AreaStep(
                    clusters: _clusters,
                    loading: _loadingClusters,
                    selected: _clusterIds,
                    onChanged: (ids) => setState(() => _clusterIds = ids),
                  ),
                  _PreferencesStep(
                    tripType: _tripType,
                    groupType: _groupType,
                    transportMode: _transportMode,
                    interests: _interests,
                    onTripType: (v) => setState(() => _tripType = v),
                    onGroupType: (v) => setState(() => _groupType = v),
                    onTransport: (v) => setState(() => _transportMode = v),
                    onInterest: (v, add) {
                      setState(() {
                        if (add) {
                          if (!_interests.contains(v)) _interests.add(v);
                        } else {
                          _interests.remove(v);
                        }
                      });
                    },
                  ),
                  _DurationStep(
                    days: _days,
                    hoursPerDay: _hoursPerDay,
                    maxStops: _maxStops,
                    budget: _budget,
                    onDays: (v) => setState(() => _days = v),
                    onHours: (v) => setState(() => _hoursPerDay = v),
                    onStops: (v) => setState(() => _maxStops = v),
                    onBudget: (v) => setState(() => _budget = v),
                  ),
                ],
              ),
            ),

            // CTA
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _next,
                  style: ButtonStyle(
                    backgroundColor: WidgetStateProperty.all(AppColors.red500),
                    shape: WidgetStateProperty.all(RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                    padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 14)),
                  ),
                  child: Text(
                    _step < 2 ? 'Continue' : 'Generate Itinerary',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Step 1: Area ─────────────────────────────────────────────────────────────

class _AreaStep extends StatelessWidget {
  final List<Cluster> clusters;
  final bool loading;
  final List<String> selected;
  final ValueChanged<List<String>> onChanged;

  const _AreaStep({
    required this.clusters,
    required this.loading,
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    if (loading) return const Center(child: ProgressRing());

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Which part of Cebu?',
              style: TextStyle(fontSize: 14, color: c.textMuted)),
          Text('Select one or more areas', style: TextStyle(fontSize: 12, color: c.textFaint)),
          const SizedBox(height: 16),
          // "All Cebu" option
          _areaRow(
            context, c,
            id: '',
            name: 'All Cebu',
            desc: 'Let AI pick the best spots island-wide',
            icon: FluentIcons.globe,
            color: AppColors.red400,
          ),
          const SizedBox(height: 10),
          ...clusters.asMap().entries.map((e) {
            final cl = e.value;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _areaRow(context, c,
                id: cl.id,
                name: cl.name,
                desc: cl.recommendedTripLength != null ? '${cl.recommendedTripLength} · ${cl.destinationCount} spots' : '${cl.destinationCount} spots',
                icon: _iconFor(cl.regionType),
                color: _colorFor(cl.regionType),
              ).animate().fadeIn(delay: (e.key * 60).ms, duration: 350.ms),
            );
          }),
        ],
      ),
    );
  }

  Widget _areaRow(BuildContext context, AppColorScheme c, {
    required String id,
    required String name,
    required String desc,
    required IconData icon,
    required Color color,
  }) {
    final isSelected = id.isEmpty ? selected.isEmpty : selected.contains(id);
    return GestureDetector(
      onTap: () {
        if (id.isEmpty) {
          onChanged([]);
        } else {
          final next = List<String>.from(selected);
          if (next.contains(id)) { next.remove(id); } else { next.add(id); }
          onChanged(next);
        }
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSelected ? color.withAlpha(20) : c.surfaceCard.withAlpha(200),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: isSelected ? color : c.borderMedium, width: isSelected ? 1.5 : 1),
        ),
        child: Row(
          children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(color: color.withAlpha(25), borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.textStrong)),
                  Text(desc, style: TextStyle(fontSize: 11, color: c.textMuted), maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            if (isSelected)
              Icon(FluentIcons.check_mark, size: 16, color: color),
          ],
        ),
      ),
    );
  }

  IconData _iconFor(String type) {
    switch (type) {
      case 'south': return FluentIcons.nav2_d_map_view;
      case 'north': return FluentIcons.compass_n_w;
      case 'islands': return FluentIcons.globe;
      case 'west': return FluentIcons.mountain_climbing;
      default: return FluentIcons.city_next;
    }
  }

  Color _colorFor(String type) {
    switch (type) {
      case 'south': return AppColors.green;
      case 'north': return AppColors.amber;
      case 'islands': return AppColors.purple;
      case 'west': return AppColors.cyan;
      default: return AppColors.blue;
    }
  }
}

// ─── Step 2: Preferences ──────────────────────────────────────────────────────

class _PreferencesStep extends StatelessWidget {
  final String? tripType;
  final String? groupType;
  final String? transportMode;
  final List<String> interests;
  final ValueChanged<String?> onTripType;
  final ValueChanged<String?> onGroupType;
  final ValueChanged<String?> onTransport;
  final void Function(String interest, bool add) onInterest;

  const _PreferencesStep({
    required this.tripType,
    required this.groupType,
    required this.transportMode,
    required this.interests,
    required this.onTripType,
    required this.onGroupType,
    required this.onTransport,
    required this.onInterest,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _section(c, 'Trip Style'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final t in ['Beach', 'Nature', 'Heritage', 'Food', 'Adventure', 'Shopping', 'Nightlife', 'Family'])
              _ToggleChip(
                label: t,
                selected: tripType?.toLowerCase() == t.toLowerCase(),
                onTap: () => onTripType(tripType?.toLowerCase() == t.toLowerCase() ? null : t.toLowerCase()),
                color: AppColors.red400,
              ),
          ]),
          const SizedBox(height: 18),
          _section(c, 'Group Type'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final g in ['Solo', 'Couple', 'Family', 'Barkada'])
              _ToggleChip(
                label: g,
                selected: groupType?.toLowerCase() == g.toLowerCase(),
                onTap: () => onGroupType(groupType?.toLowerCase() == g.toLowerCase() ? null : g.toLowerCase()),
                color: AppColors.blue,
              ),
          ]),
          const SizedBox(height: 18),
          _section(c, 'Transport'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final t in ['Car', 'Bus/Commute', 'Hired Van', 'Motorbike', 'Ferry'])
              _ToggleChip(
                label: t,
                selected: transportMode?.toLowerCase() == t.toLowerCase(),
                onTap: () => onTransport(transportMode?.toLowerCase() == t.toLowerCase() ? null : t.toLowerCase()),
                color: AppColors.green,
              ),
          ]),
          const SizedBox(height: 18),
          _section(c, 'Interests (optional)'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final i in ['beaches', 'waterfalls', 'heritage', 'food', 'cafes', 'scenic drives',
                             'churches', 'nature', 'shopping', 'nightlife', 'family-friendly',
                             'adventure', 'island hopping', 'mountain views'])
              _ToggleChip(
                label: i,
                selected: interests.contains(i),
                onTap: () => onInterest(i, !interests.contains(i)),
                color: AppColors.purple,
              ),
          ]),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Widget _section(AppColorScheme c, String label) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.textStrong)),
  );
}

// ─── Step 3: Duration ─────────────────────────────────────────────────────────

class _DurationStep extends StatelessWidget {
  final int days;
  final double hoursPerDay;
  final int maxStops;
  final double budget;
  final ValueChanged<int> onDays;
  final ValueChanged<double> onHours;
  final ValueChanged<int> onStops;
  final ValueChanged<double> onBudget;

  const _DurationStep({
    required this.days,
    required this.hoursPerDay,
    required this.maxStops,
    required this.budget,
    required this.onDays,
    required this.onHours,
    required this.onStops,
    required this.onBudget,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _section(c, 'Number of Days'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final d in [1, 2, 3, 4, 5, 7])
              _ToggleChip(
                label: d == 1 ? '1 day' : '$d days',
                selected: days == d,
                onTap: () => onDays(d),
                color: AppColors.red400,
              ),
          ]),
          const SizedBox(height: 18),
          _section(c, 'Hours per Day'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final h in [4.0, 6.0, 8.0, 10.0, 12.0])
              _ToggleChip(
                label: '${h.toInt()}h',
                selected: hoursPerDay == h,
                onTap: () => onHours(h),
                color: AppColors.blue,
              ),
          ]),
          const SizedBox(height: 18),
          _section(c, 'Max Stops per Day'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final s in [2, 3, 4, 5, 6, 8])
              _ToggleChip(
                label: '$s stops',
                selected: maxStops == s,
                onTap: () => onStops(s),
                color: AppColors.green,
              ),
          ]),
          const SizedBox(height: 18),
          _section(c, 'Daily Budget (₱, 0 = no limit)'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final b in [0.0, 500.0, 1000.0, 2000.0, 5000.0])
              _ToggleChip(
                label: b == 0 ? 'No limit' : '₱${b.toInt()}',
                selected: budget == b,
                onTap: () => onBudget(b),
                color: AppColors.amber,
              ),
          ]),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Widget _section(AppColorScheme c, String label) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.textStrong)),
  );
}

// ─── Shared toggle chip ───────────────────────────────────────────────────────

class _ToggleChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color color;

  const _ToggleChip({
    required this.label,
    required this.selected,
    required this.onTap,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? color.withAlpha(25) : c.surfaceElevated,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? color : c.borderMedium,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            color: selected ? color : c.textMuted,
          ),
        ),
      ),
    );
  }
}
