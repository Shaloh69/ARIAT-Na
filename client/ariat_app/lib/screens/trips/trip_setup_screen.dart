import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../models/destination.dart';
import '../../models/trip_params.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/toast_overlay.dart';

/// Multi-step trip planning wizard.
/// Returns a [TripSetupParams] when the user completes all steps.
/// Pass [preselected] to skip the cluster step and anchor the trip to a destination.
class TripSetupScreen extends StatefulWidget {
  final Destination? preselected;
  const TripSetupScreen({super.key, this.preselected});

  @override
  State<TripSetupScreen> createState() => _TripSetupScreenState();
}

class _TripSetupScreenState extends State<TripSetupScreen> {
  late int _step; // 0=Area 1=Preferences 2=Duration (skipped to 1 when preselected)
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
    // Skip cluster step when a specific destination is pre-selected
    _step = widget.preselected != null ? 1 : 0;
    // Pre-select the cluster matching the destination (if known)
    if (widget.preselected?.clusterId != null) {
      _clusterIds = [widget.preselected!.clusterId!];
    }
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
        pinnedDestinationIds: widget.preselected?.id != null ? [widget.preselected!.id] : const [],
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
                        Text(
                          widget.preselected != null
                              ? 'Step $_step of 2'
                              : 'Step ${_step + 1} of 3',
                          style: TextStyle(fontSize: 12, color: c.textMuted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Progress bar
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Builder(builder: (context) {
                final total = widget.preselected != null ? 2 : 3;
                final filled = widget.preselected != null ? _step : _step + 1;
                return Row(
                  children: List.generate(total, (i) => Expanded(
                    child: Container(
                      height: 4,
                      margin: EdgeInsets.only(right: i < total - 1 ? 4 : 0),
                      decoration: BoxDecoration(
                        color: i < filled ? AppColors.red500 : c.surfaceElevated,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  )),
                );
              }),
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

// ─── Step 1: Area (interactive Cebu map) ─────────────────────────────────────

class _AreaStep extends StatefulWidget {
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
  State<_AreaStep> createState() => _AreaStepState();
}

class _AreaStepState extends State<_AreaStep> {
  // Cebu island center
  static const _cebuCenter = LatLng(10.45, 123.85);

  static const _clusterColors = {
    'metro':   Color(0xFF3B82F6),
    'south':   Color(0xFF10B981),
    'north':   Color(0xFFF59E0B),
    'islands': Color(0xFF8B5CF6),
    'west':    Color(0xFF06B6D4),
  };

  static const _clusterEmoji = {
    'metro':   '🏙️',
    'south':   '🌊',
    'north':   '🧭',
    'islands': '🏝️',
    'west':    '⛰️',
  };

  bool _allCebu(List<String> sel) => sel.isEmpty;

  void _toggle(String id) {
    if (id.isEmpty) {
      widget.onChanged([]);
      return;
    }
    final next = List<String>.from(widget.selected);
    if (next.contains(id)) {
      next.remove(id);
    } else {
      next.add(id);
    }
    widget.onChanged(next);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    if (widget.loading) return const Center(child: ProgressRing());

    final mappable = widget.clusters
        .where((cl) => cl.centerLat != null && cl.centerLng != null)
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Subtitle
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
          child: Text('Tap a region on the map to select it',
              style: TextStyle(fontSize: 12, color: c.textFaint)),
        ),

        // "All Cebu" toggle
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
          child: GestureDetector(
            onTap: () => _toggle(''),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: _allCebu(widget.selected)
                    ? AppColors.red400.withAlpha(25)
                    : c.surfaceCard.withAlpha(200),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _allCebu(widget.selected) ? AppColors.red400 : c.borderMedium,
                  width: _allCebu(widget.selected) ? 1.5 : 1,
                ),
              ),
              child: Row(children: [
                Icon(FluentIcons.globe, size: 18, color: AppColors.red400),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('All Cebu',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.textStrong)),
                      Text('Let AI pick the best spots island-wide',
                          style: TextStyle(fontSize: 11, color: c.textMuted)),
                    ],
                  ),
                ),
                if (_allCebu(widget.selected))
                  Icon(FluentIcons.check_mark, size: 14, color: AppColors.red400),
              ]),
            ),
          ),
        ),

        // Map
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Stack(
                children: [
                  FlutterMap(
                    options: MapOptions(
                      initialCenter: _cebuCenter,
                      initialZoom: 8.2,
                      interactionOptions: const InteractionOptions(
                        flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag,
                      ),
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                            'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                        subdomains: const ['a', 'b', 'c', 'd'],
                        userAgentPackageName: 'com.airatna.app',
                      ),
                      // Glow circles for each cluster
                      CircleLayer(
                        circles: mappable.map((cl) {
                          final color = _clusterColors[cl.regionType] ?? AppColors.red400;
                          final isSel = widget.selected.contains(cl.id);
                          return CircleMarker(
                            point: LatLng(cl.centerLat!, cl.centerLng!),
                            radius: isSel ? 52 : 38,
                            color: isSel
                                ? color.withAlpha(70)
                                : color.withAlpha(30),
                            borderColor: isSel ? color : color.withAlpha(120),
                            borderStrokeWidth: isSel ? 2.5 : 1.5,
                          );
                        }).toList(),
                      ),
                      // Label markers
                      MarkerLayer(
                        markers: mappable.map((cl) {
                          final color = _clusterColors[cl.regionType] ?? AppColors.red400;
                          final emoji = _clusterEmoji[cl.regionType] ?? '📍';
                          final isSel = widget.selected.contains(cl.id);
                          return Marker(
                            point: LatLng(cl.centerLat!, cl.centerLng!),
                            width: 130,
                            height: 56,
                            child: GestureDetector(
                              onTap: () => _toggle(cl.id),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  AnimatedContainer(
                                    duration: const Duration(milliseconds: 180),
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 9, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: isSel
                                          ? color
                                          : color.withAlpha(210),
                                      borderRadius: BorderRadius.circular(10),
                                      border: isSel
                                          ? Border.all(
                                              color: Colors.white.withAlpha(180),
                                              width: 1.5)
                                          : null,
                                      boxShadow: [
                                        BoxShadow(
                                          color: color.withAlpha(isSel ? 100 : 60),
                                          blurRadius: isSel ? 10 : 5,
                                          spreadRadius: isSel ? 1 : 0,
                                        ),
                                      ],
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(emoji,
                                            style: const TextStyle(fontSize: 13)),
                                        const SizedBox(width: 5),
                                        Flexible(
                                          child: Text(
                                            cl.name,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                        if (isSel) ...[
                                          const SizedBox(width: 4),
                                          const Icon(FluentIcons.check_mark,
                                              size: 10, color: Colors.white),
                                        ],
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                  // Hint pill
                  Positioned(
                    top: 10, left: 0, right: 0,
                    child: Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.black.withAlpha(150),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text(
                          'Tap regions to select  ·  Pinch to zoom',
                          style: TextStyle(
                              color: Color(0xB3FFFFFF),
                              fontSize: 11,
                              fontWeight: FontWeight.w500),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),

        // Selected area chips
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
          child: widget.selected.isEmpty
              ? Text(
                  'No specific area selected — AI picks island-wide',
                  style: TextStyle(fontSize: 11, color: c.textFaint),
                )
              : SizedBox(
                  height: 30,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: widget.clusters
                        .where((cl) => widget.selected.contains(cl.id))
                        .map((cl) {
                      final color =
                          _clusterColors[cl.regionType] ?? AppColors.red400;
                      return Container(
                        margin: const EdgeInsets.only(right: 8),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: color.withAlpha(25),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: color),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(cl.name,
                                style: TextStyle(
                                    fontSize: 11,
                                    color: color,
                                    fontWeight: FontWeight.w600)),
                            const SizedBox(width: 5),
                            GestureDetector(
                              onTap: () => _toggle(cl.id),
                              child: Icon(FluentIcons.clear,
                                  size: 10, color: color),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ),
        ),
        const SizedBox(height: 6),
      ],
    );
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
