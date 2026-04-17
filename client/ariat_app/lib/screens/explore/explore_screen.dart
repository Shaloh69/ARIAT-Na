import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';
import '../../models/destination.dart';
import '../../models/guide.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';
import '../destinations/destination_detail_screen.dart';

class ExploreScreen extends StatefulWidget {
  final String? initialClusterId;
  final int initialTab;
  const ExploreScreen({super.key, this.initialClusterId, this.initialTab = 0});
  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  late int _tab;
  bool _loading = true;

  List<Cluster> _clusters = [];
  List<Destination> _spots = [];
  List<CuratedGuide> _guides = [];
  late String? _selectedCluster;
  String? _selectedInterest;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab;
    _selectedCluster = widget.initialClusterId;
    _searchController.addListener(() {
      setState(() => _searchQuery = _searchController.text);
    });
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final api = context.read<ApiService>();

    // Fetch independently so one broken endpoint doesn't block the rest
    const Map<String, dynamic> emptyResult = {'data': [], 'success': true};
    final results = await Future.wait([
      api.get('/clusters').catchError((_) => emptyResult),
      api.get('/destinations?limit=40').catchError((_) => emptyResult),
      api.get('/guides').catchError((_) => emptyResult),
    ]);

    final clusters   = (results[0]['data'] as List? ?? []).map((e) => Cluster.fromJson(e as Map<String, dynamic>)).toList();
    final spots      = (results[1]['data'] as List? ?? []).map((e) => Destination.fromJson(e as Map<String, dynamic>)).toList();
    final guides     = (results[2]['data'] as List? ?? []).map((e) => CuratedGuide.fromJson(e as Map<String, dynamic>)).toList();

    if (mounted && spots.isEmpty && clusters.isEmpty) {
      AppToast.error(context, 'Failed to load explore data');
    }

    setState(() {
      _clusters = clusters;
      _spots = spots;
      _guides = guides;
      _loading = false;
    });
  }

  List<Destination> get _filteredSpots {
    var spots = _spots;
    if (_selectedCluster != null) {
      spots = spots.where((d) => d.clusterId == _selectedCluster).toList();
    }
    if (_selectedInterest != null) {
      final kw = _selectedInterest!.toLowerCase();
      spots = spots.where((d) {
        final catMatch = d.categoryName?.toLowerCase().contains(kw) ?? false;
        final tagMatch = d.tags.any((t) => t.toLowerCase().contains(kw));
        return catMatch || tagMatch;
      }).toList();
    }
    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      spots = spots.where((d) =>
        d.name.toLowerCase().contains(q) ||
        (d.municipality?.toLowerCase().contains(q) ?? false) ||
        (d.categoryName?.toLowerCase().contains(q) ?? false)
      ).toList();
    }
    return spots;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;

    return GradientBackground(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Text('Explore Cebu',
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: c.textStrong))
                  .animate().fadeIn(duration: 400.ms),
            ),
            const SizedBox(height: 14),

            // Tab bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  _tabChip('Areas', 0, c),
                  const SizedBox(width: 8),
                  _tabChip('Spots', 1, c),
                  const SizedBox(width: 8),
                  _tabChip('Guides', 2, c),
                ],
              ),
            ),
            const SizedBox(height: 16),

            if (_loading)
              const Expanded(child: Center(child: ProgressRing()))
            else
              Expanded(
                child: IndexedStack(
                  index: _tab,
                  children: [
                    _AreasTab(
                      clusters: _clusters,
                      onClusterTap: (id) => setState(() {
                        _selectedCluster = id;
                        _tab = 1;
                      }),
                    ),
                    _SpotsTab(
                      spots: _filteredSpots,
                      clusters: _clusters,
                      selectedCluster: _selectedCluster,
                      onClusterFilter: (id) => setState(() => _selectedCluster = id),
                      selectedInterest: _selectedInterest,
                      onInterestFilter: (interest) => setState(() =>
                          _selectedInterest = _selectedInterest == interest ? null : interest),
                      searchController: _searchController,
                    ),
                    _GuidesTab(guides: _guides),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _tabChip(String label, int idx, AppColorScheme c) {
    final selected = _tab == idx;
    return GestureDetector(
      onTap: () => setState(() => _tab = idx),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.red500 : c.surfaceElevated,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? AppColors.red500 : c.borderMedium),
        ),
        child: Text(label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: selected ? Colors.white : c.textMuted,
            )),
      ),
    );
  }
}

// ─── Areas tab ────────────────────────────────────────────────────────────────

class _AreasTab extends StatelessWidget {
  final List<Cluster> clusters;
  final ValueChanged<String> onClusterTap;
  const _AreasTab({required this.clusters, required this.onClusterTap});

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    if (clusters.isEmpty) {
      return Center(
        child: Text('No areas found', style: TextStyle(color: c.textMuted)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      itemCount: clusters.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, i) {
        final cl = clusters[i];
        return _ClusterCard(cluster: cl, onTap: () => onClusterTap(cl.id))
            .animate().fadeIn(delay: (i * 60).ms, duration: 400.ms);
      },
    );
  }
}

class _ClusterCard extends StatelessWidget {
  final Cluster cluster;
  final VoidCallback? onTap;
  const _ClusterCard({required this.cluster, this.onTap});

  static final _regionColors = {
    'metro': Color(0xFF3B82F6),
    'south': Color(0xFF10B981),
    'north': Color(0xFFF59E0B),
    'islands': Color(0xFF8B5CF6),
    'west': Color(0xFF06B6D4),
  };

  static final _regionIcons = {
    'metro': FluentIcons.city_next,
    'south': FluentIcons.nav2_d_map_view,
    'north': FluentIcons.nav2_d_map_view,
    'islands': FluentIcons.globe,
    'west': FluentIcons.mountain_climbing,
  };

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final color = _regionColors[cluster.regionType] ?? AppColors.red400;
    final icon = _regionIcons[cluster.regionType] ?? FluentIcons.poi;

    return GestureDetector(
      onTap: onTap,
      child: GlassCard(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: color.withAlpha(25),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(cluster.name,
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.textStrong)),
                  if (cluster.description != null) ...[
                    const SizedBox(height: 4),
                    Text(cluster.description!,
                        style: TextStyle(fontSize: 12, color: c.textMuted, height: 1.4),
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                  ],
                  if (cluster.recommendedTripLength != null) ...[
                    const SizedBox(height: 6),
                    Row(children: [
                      Icon(FluentIcons.clock, size: 11, color: color),
                      const SizedBox(width: 4),
                      Text(cluster.recommendedTripLength!,
                          style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w500)),
                      const Spacer(),
                      Text('${cluster.destinationCount} spots',
                          style: TextStyle(fontSize: 11, color: c.textFaint)),
                    ]),
                  ],
                ],
              ),
            ),
            if (onTap != null) ...[
              const SizedBox(width: 8),
              Icon(FluentIcons.chevron_right, size: 14, color: c.textFaint),
            ],
          ],
        ),
      ),
    );
  }
}

// ─── Spots tab ────────────────────────────────────────────────────────────────

const _kInterests = [
  'beaches', 'waterfalls', 'heritage', 'food', 'cafes',
  'nature', 'shopping', 'adventure', 'churches', 'nightlife',
  'family-friendly', 'island hopping', 'mountain views', 'scenic drives',
];

class _SpotsTab extends StatelessWidget {
  final List<Destination> spots;
  final List<Cluster> clusters;
  final String? selectedCluster;
  final ValueChanged<String?> onClusterFilter;
  final String? selectedInterest;
  final ValueChanged<String> onInterestFilter;
  final TextEditingController searchController;

  const _SpotsTab({
    required this.spots,
    required this.clusters,
    required this.selectedCluster,
    required this.onClusterFilter,
    required this.selectedInterest,
    required this.onInterestFilter,
    required this.searchController,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Search bar
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: TextBox(
            controller: searchController,
            placeholder: 'Search spots...',
            prefix: Padding(
              padding: const EdgeInsets.only(left: 10),
              child: Icon(FluentIcons.search, size: 14, color: c.textMuted),
            ),
            style: TextStyle(fontSize: 13, color: c.text),
          ),
        ),
        const SizedBox(height: 10),
        // Cluster filter chips
        SizedBox(
          height: 34,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            children: [
              _filterChip('All Areas', null, selectedCluster, onClusterFilter, c),
              ...clusters.map((cl) => Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: _filterChip(cl.name, cl.id, selectedCluster, onClusterFilter, c),
                  )),
            ],
          ),
        ),
        const SizedBox(height: 8),
        // Interest filter chips
        SizedBox(
          height: 34,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            children: _kInterests.map((interest) => Padding(
              padding: const EdgeInsets.only(right: 8),
              child: _interestChip(interest, selectedInterest, onInterestFilter, c),
            )).toList(),
          ),
        ),
        const SizedBox(height: 10),
        Expanded(
          child: spots.isEmpty
              ? Center(child: Text('No spots found', style: TextStyle(color: c.textMuted)))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  itemCount: spots.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, i) {
                    return _SpotRow(spot: spots[i])
                        .animate()
                        .fadeIn(delay: (i * 40).ms, duration: 350.ms);
                  },
                ),
        ),
      ],
    );
  }

  Widget _filterChip(String label, String? id, String? selected, ValueChanged<String?> onTap, AppColorScheme c) {
    final active = selected == id;
    return GestureDetector(
      onTap: () => onTap(active ? null : id),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: active ? AppColors.red500 : c.surfaceElevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: active ? AppColors.red500 : c.borderMedium),
        ),
        child: Text(label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: active ? Colors.white : c.textMuted,
            )),
      ),
    );
  }

  Widget _interestChip(String interest, String? selected, ValueChanged<String> onTap, AppColorScheme c) {
    final active = selected == interest;
    return GestureDetector(
      onTap: () => onTap(interest),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: active ? AppColors.blue.withAlpha(220) : c.surfaceElevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: active ? AppColors.blue : c.borderMedium),
        ),
        child: Text(interest,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: active ? Colors.white : c.textMuted,
            )),
      ),
    );
  }
}

class _SpotRow extends StatelessWidget {
  final Destination spot;
  const _SpotRow({required this.spot});

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        FluentPageRoute(builder: (_) => DestinationDetailScreen(destination: spot)),
      ),
      child: GlassCard(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: spot.primaryImage != null
                  ? CachedNetworkImage(
                      imageUrl: spot.primaryImage!,
                      width: 72, height: 72, fit: BoxFit.cover,
                      placeholder: (_, __) => Container(width: 72, height: 72, color: c.surfaceElevated),
                      errorWidget: (_, __, ___) => Container(
                          width: 72, height: 72, color: c.surfaceElevated,
                          child: Icon(FluentIcons.photo2, color: c.textFaint, size: 24)),
                    )
                  : Container(
                      width: 72, height: 72, color: c.surfaceElevated,
                      child: Icon(FluentIcons.photo2, color: c.textFaint, size: 24)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(spot.name,
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.textStrong),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 3),
                  Text(spot.areaLabel,
                      style: TextStyle(fontSize: 12, color: c.textMuted),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 6),
                  Row(children: [
                    if (spot.categoryName != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.red500.withAlpha(20),
                          borderRadius: BorderRadius.circular(5),
                        ),
                        child: Text(spot.categoryName!,
                            style: TextStyle(fontSize: 10, color: AppColors.red400, fontWeight: FontWeight.w500)),
                      ),
                      const SizedBox(width: 6),
                    ],
                    if (spot.rating > 0) ...[
                      Icon(FluentIcons.favorite_star_fill, size: 11, color: AppColors.amber),
                      const SizedBox(width: 2),
                      Text(spot.rating.toStringAsFixed(1),
                          style: TextStyle(fontSize: 11, color: c.text, fontWeight: FontWeight.w600)),
                    ],
                  ]),
                ],
              ),
            ),
            Icon(FluentIcons.chevron_right, size: 14, color: c.textFaint),
          ],
        ),
      ),
    );
  }
}

// ─── Guides tab ───────────────────────────────────────────────────────────────

class _GuidesTab extends StatelessWidget {
  final List<CuratedGuide> guides;
  const _GuidesTab({required this.guides});

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    if (guides.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(FluentIcons.nav2_d_map_view, size: 48, color: c.textFaint),
            const SizedBox(height: 12),
            Text('No guides yet', style: TextStyle(color: c.textMuted, fontSize: 15)),
            const SizedBox(height: 4),
            Text('Curated Cebu guides coming soon!',
                style: TextStyle(color: c.textFaint, fontSize: 12)),
          ],
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      itemCount: guides.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, i) {
        return _GuideCard(guide: guides[i])
            .animate()
            .fadeIn(delay: (i * 60).ms, duration: 400.ms);
      },
    );
  }
}

class _GuideCard extends StatelessWidget {
  final CuratedGuide guide;
  const _GuideCard({required this.guide});

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return GlassCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (guide.coverImage != null)
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              child: CachedNetworkImage(
                imageUrl: guide.coverImage!,
                height: 130, width: double.infinity, fit: BoxFit.cover,
                placeholder: (_, __) => Container(height: 130, color: c.surfaceElevated),
                errorWidget: (_, __, ___) => Container(
                    height: 130, color: c.surfaceElevated,
                    child: Icon(FluentIcons.nav2_d_map_view, color: c.textFaint, size: 36)),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Expanded(
                    child: Text(guide.title,
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.textStrong)),
                  ),
                  if (guide.isFeatured)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.amber.withAlpha(30),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: Text('Featured',
                          style: TextStyle(fontSize: 10, color: AppColors.amber, fontWeight: FontWeight.w600)),
                    ),
                ]),
                if (guide.description != null) ...[
                  const SizedBox(height: 4),
                  Text(guide.description!,
                      style: TextStyle(fontSize: 12, color: c.textMuted, height: 1.4),
                      maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
                const SizedBox(height: 8),
                Row(children: [
                  Icon(FluentIcons.clock, size: 12, color: c.textFaint),
                  const SizedBox(width: 4),
                  Text(guide.durationLabel ?? guide.dayLabel,
                      style: TextStyle(fontSize: 11, color: c.textMuted)),
                  const SizedBox(width: 12),
                  Icon(FluentIcons.settings, size: 12, color: c.textFaint),
                  const SizedBox(width: 4),
                  Text(guide.difficultyLabel,
                      style: TextStyle(fontSize: 11, color: c.textMuted)),
                ]),
                if (guide.tags.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: guide.tags.take(4).map((tag) => Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.blue.withAlpha(20),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(tag, style: TextStyle(fontSize: 10, color: AppColors.blue)),
                    )).toList(),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
