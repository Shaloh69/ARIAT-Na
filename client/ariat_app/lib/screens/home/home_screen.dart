import 'dart:async';
import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter/material.dart' show RefreshIndicator;
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/auth_service.dart';
import '../../services/api_service.dart';
import '../../services/connectivity_service.dart';
import '../../models/destination.dart';
import '../../models/guide.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/guest_wall.dart';
import '../../widgets/toast_overlay.dart';
import '../destinations/destination_detail_screen.dart';
import '../explore/explore_screen.dart';
import '../map/map_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Destination> _featured = [];
  List<Cluster> _clusters = [];
  List<CuratedGuide> _guides = [];
  bool _loading = true;
  bool _fromCache = false;
  String _loadingMessage = 'Loading...';
  Timer? _warmupTimer1;
  Timer? _warmupTimer2;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _warmupTimer1?.cancel();
    _warmupTimer2?.cancel();
    super.dispose();
  }

  void _startWarmupTimers() {
    _warmupTimer1?.cancel();
    _warmupTimer2?.cancel();
    // After 4s: hint the server might be waking up
    _warmupTimer1 = Timer(const Duration(seconds: 4), () {
      if (mounted && _loading) {
        setState(() => _loadingMessage = 'Connecting to server...');
      }
    });
    // After 10s: tell the user clearly it's a cold start
    _warmupTimer2 = Timer(const Duration(seconds: 10), () {
      if (mounted && _loading) {
        setState(() => _loadingMessage = 'Server waking up —\nfirst load takes ~30s on free tier');
      }
    });
  }

  void _cancelWarmupTimers() {
    _warmupTimer1?.cancel();
    _warmupTimer2?.cancel();
    _loadingMessage = 'Loading...';
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _loadingMessage = 'Loading...';
    });
    _startWarmupTimers();

    try {
      final api = context.read<ApiService>();

      // Fetch independently — a missing/broken endpoint (e.g. guides table not yet seeded)
      // should not prevent destinations and clusters from loading.
      final Map<String, dynamic> emptyResult = {'data': [], 'success': true};
      final results = await Future.wait([
        api.get('/destinations/featured').catchError((_) => emptyResult),
        api.get('/clusters').catchError((_) => emptyResult),
        api.get('/guides?featured=true').catchError((_) => emptyResult),
      ]);

      final featuredData = results[0]['data'] as List? ?? [];
      final clusterData  = results[1]['data'] as List? ?? [];
      final guideData    = results[2]['data'] as List? ?? [];
      final cached = results[0]['cached'] == true;

      // Show error toast only if ALL requests returned empty (likely an offline/URL issue)
      final allEmpty = featuredData.isEmpty && clusterData.isEmpty && guideData.isEmpty;
      if (mounted && allEmpty && !(results[0]['success'] == true)) {
        AppToast.error(context, 'Could not load data. Check connection.');
      }

      // Parse models OUTSIDE setState so a fromJson exception doesn't trap _loading = true
      final featured = featuredData
          .map((d) => Destination.fromJson(d as Map<String, dynamic>))
          .toList();
      final clusters = clusterData
          .map((c) => Cluster.fromJson(c as Map<String, dynamic>))
          .toList();
      final guides = guideData
          .map((g) => CuratedGuide.fromJson(g as Map<String, dynamic>))
          .toList();

      if (mounted) {
        setState(() {
          _featured = featured;
          _clusters = clusters;
          _guides = guides;
          _fromCache = cached;
        });
        if (cached) AppToast.info(context, 'Showing cached data');
      }
    } catch (e) {
      if (mounted) AppToast.error(context, 'Could not load data. Check connection.');
    } finally {
      _cancelWarmupTimers();
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final auth = context.watch<AuthService>();
    final isOnline = context.watch<ConnectivityService>().isOnline;
    final userName = auth.user?['full_name'] as String? ?? 'Explorer';

    return GradientBackground(
      child: SafeArea(
        child: _loading
            ? _LoadingState(message: _loadingMessage)
            : RefreshIndicator(
                onRefresh: _loadData,
                color: AppColors.red500,
                child: CustomScrollView(
                  slivers: [
                    // Header
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Image.asset('assets/logo.png', width: 36, height: 36),
                                const SizedBox(width: 10),
                                Text('AIRAT-NA',
                                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: c.textStrong, letterSpacing: 1.5)),
                                const Spacer(),
                                if (!isOnline)
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(color: AppColors.amber.withAlpha(25), borderRadius: BorderRadius.circular(6)),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(FluentIcons.cloud_not_synced, size: 12, color: AppColors.amber),
                                        const SizedBox(width: 4),
                                        Text('Offline', style: TextStyle(fontSize: 10, color: AppColors.amber, fontWeight: FontWeight.w600)),
                                      ],
                                    ),
                                  ),
                              ],
                            ).animate().fadeIn(duration: 500.ms),
                            const SizedBox(height: 20),
                            Text('Hello, $userName 👋',
                                style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: c.textStrong))
                                .animate().fadeIn(delay: 100.ms, duration: 500.ms),
                            const SizedBox(height: 4),
                            Text(
                              auth.isOfflineSession ? 'Offline mode — cached data shown' : 'Plan your Cebu adventure',
                              style: TextStyle(fontSize: 14, color: c.textMuted),
                            ).animate().fadeIn(delay: 200.ms, duration: 500.ms),
                            const SizedBox(height: 16),
                            // Quick-action chips
                            Row(
                              children: [
                                _QuickActionChip(
                                  label: 'Weekend Getaway',
                                  icon: FluentIcons.calendar,
                                  color: AppColors.green,
                                  onTap: () {
                                    if (context.read<AuthService>().isGuest) {
                                      showGuestWall(context, featureName: 'Trip planning');
                                      return;
                                    }
                                    Navigator.of(context).push(
                                      FluentPageRoute(builder: (_) => const MapScreen()),
                                    );
                                  },
                                ),
                                const SizedBox(width: 10),
                                _QuickActionChip(
                                  label: 'Beach Trip',
                                  icon: FluentIcons.globe,
                                  color: AppColors.blue,
                                  onTap: () {
                                    if (context.read<AuthService>().isGuest) {
                                      showGuestWall(context, featureName: 'Trip planning');
                                      return;
                                    }
                                    Navigator.of(context).push(
                                      FluentPageRoute(builder: (_) => const MapScreen()),
                                    );
                                  },
                                ),
                              ],
                            ).animate().fadeIn(delay: 250.ms, duration: 400.ms),
                            const SizedBox(height: 24),
                          ],
                        ),
                      ),
                    ),

                    // Cached data notice
                    if (_fromCache)
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              color: AppColors.blue.withAlpha(20),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: AppColors.blue.withAlpha(30)),
                            ),
                            child: Row(
                              children: [
                                Icon(FluentIcons.database, size: 14, color: AppColors.blue),
                                const SizedBox(width: 8),
                                Text('Showing cached data', style: TextStyle(fontSize: 12, color: AppColors.blue)),
                              ],
                            ),
                          ),
                        ),
                      ),

                    // Cebu Areas strip
                    if (_clusters.isNotEmpty) ...[
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                          child: Text('Explore Cebu by Area',
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.textStrong))
                              .animate().fadeIn(delay: 250.ms, duration: 500.ms),
                        ),
                      ),
                      SliverToBoxAdapter(
                        child: SizedBox(
                          height: 100,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            itemCount: _clusters.length,
                            separatorBuilder: (_, __) => const SizedBox(width: 10),
                            itemBuilder: (context, i) => _ClusterChip(cluster: _clusters[i])
                                .animate().fadeIn(delay: (280 + i * 60).ms, duration: 400.ms),
                          ),
                        ),
                      ),
                      const SliverToBoxAdapter(child: SizedBox(height: 24)),
                    ],

                    // Curated Guides
                    if (_guides.isNotEmpty) ...[
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                          child: Text('Curated Guides',
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.textStrong))
                              .animate().fadeIn(delay: 350.ms, duration: 500.ms),
                        ),
                      ),
                      SliverToBoxAdapter(
                        child: SizedBox(
                          height: 160,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            itemCount: _guides.length,
                            separatorBuilder: (_, __) => const SizedBox(width: 12),
                            itemBuilder: (context, i) => _GuideCard(guide: _guides[i])
                                .animate().fadeIn(delay: (380 + i * 60).ms, duration: 400.ms),
                          ),
                        ),
                      ),
                      const SliverToBoxAdapter(child: SizedBox(height: 24)),
                    ],

                    // Featured destinations
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                        child: Text('Featured Destinations',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.textStrong))
                            .animate().fadeIn(delay: 400.ms, duration: 500.ms),
                      ),
                    ),

                    if (_featured.isEmpty)
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: GlassCard(
                            child: Column(
                              children: [
                                Icon(FluentIcons.compass_n_w, size: 40, color: c.textFaint),
                                const SizedBox(height: 12),
                                Text('No featured destinations yet', style: TextStyle(color: c.textMuted, fontSize: 14)),
                                const SizedBox(height: 4),
                                Text('Check back soon for exciting places!', style: TextStyle(color: c.textFaint, fontSize: 12)),
                              ],
                            ),
                          ),
                        ),
                      )
                    else
                      SliverPadding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        sliver: SliverList.separated(
                          itemCount: _featured.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 14),
                          itemBuilder: (context, index) => _DestinationCard(destination: _featured[index])
                              .animate()
                              .fadeIn(delay: (450 + index * 100).ms, duration: 500.ms)
                              .slideX(begin: 0.05, end: 0, duration: 500.ms),
                        ),
                      ),

                    const SliverToBoxAdapter(child: SizedBox(height: 24)),
                  ],
                ),
              ),
      ),
    );
  }
}

// ─── Quick action chip ────────────────────────────────────────────────────────

// ─── Loading state with warm-up message ──────────────────────────────────────

class _LoadingState extends StatelessWidget {
  final String message;
  const _LoadingState({required this.message});

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ProgressRing(strokeWidth: 3),
            const SizedBox(height: 20),
            Text(
              message,
              style: TextStyle(fontSize: 13, color: c.textMuted, height: 1.5),
              textAlign: TextAlign.center,
            ).animate().fadeIn(duration: 400.ms),
          ],
        ),
      ),
    );
  }
}

// ─── Quick action chip ────────────────────────────────────────────────────────

class _QuickActionChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _QuickActionChip({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: color.withAlpha(20),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: color.withAlpha(60)),
          ),
          child: Row(
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 8),
              Expanded(
                child: Text(label,
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
              Icon(FluentIcons.chevron_right, size: 12, color: color.withAlpha(180)),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Cluster chip ─────────────────────────────────────────────────────────────

class _ClusterChip extends StatelessWidget {
  final Cluster cluster;
  const _ClusterChip({required this.cluster});

  static final _colors = {
    'metro': AppColors.blue,
    'south': AppColors.green,
    'north': AppColors.amber,
    'islands': AppColors.purple,
    'west': AppColors.cyan,
  };
  static final _icons = {
    'metro': FluentIcons.city_next,
    'south': FluentIcons.nav2_d_map_view,
    'north': FluentIcons.compass_n_w,
    'islands': FluentIcons.globe,
    'west': FluentIcons.mountain_climbing,
  };

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final color = _colors[cluster.regionType] ?? AppColors.red400;
    final icon = _icons[cluster.regionType] ?? FluentIcons.poi;
    return GestureDetector(
      onTap: () => Navigator.of(context).push(FluentPageRoute(
        builder: (_) => ExploreScreen(initialClusterId: cluster.id, initialTab: 1),
      )),
      child: GlassCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        borderRadius: 14,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(height: 6),
            Text(cluster.name, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c.text)),
            Text('${cluster.destinationCount} spots', style: TextStyle(fontSize: 10, color: c.textFaint)),
          ],
        ),
      ),
    );
  }
}

// ─── Guide card ───────────────────────────────────────────────────────────────

class _GuideCard extends StatelessWidget {
  final CuratedGuide guide;
  const _GuideCard({required this.guide});

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return SizedBox(
      width: 200,
      child: GlassCard(
        padding: EdgeInsets.zero,
        borderRadius: 14,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
              child: guide.coverImage != null
                  ? CachedNetworkImage(
                      imageUrl: guide.coverImage!,
                      height: 90, width: double.infinity, fit: BoxFit.cover,
                      placeholder: (_, __) => Container(height: 90, color: c.surfaceElevated),
                      errorWidget: (_, __, ___) => Container(height: 90, color: c.surfaceElevated,
                          child: Icon(FluentIcons.compass_n_w, color: c.textFaint, size: 28)),
                    )
                  : Container(height: 90, color: c.surfaceElevated,
                      child: Center(child: Icon(FluentIcons.compass_n_w, color: c.textFaint, size: 28))),
            ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(guide.title,
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c.textStrong),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 3),
                  Text(guide.durationLabel ?? guide.dayLabel,
                      style: TextStyle(fontSize: 11, color: c.textMuted)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Destination card ─────────────────────────────────────────────────────────

class _DestinationCard extends StatelessWidget {
  final Destination destination;
  const _DestinationCard({required this.destination});

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return GestureDetector(
      onTap: () => Navigator.of(context).push(FluentPageRoute(
        builder: (_) => DestinationDetailScreen(destination: destination),
      )),
      child: GlassCard(
        padding: EdgeInsets.zero,
        borderRadius: 16,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              child: destination.primaryImage != null
                  ? CachedNetworkImage(
                      imageUrl: destination.primaryImage!,
                      height: 160, width: double.infinity, fit: BoxFit.cover,
                      placeholder: (_, __) => Container(height: 160, color: c.surfaceElevated,
                          child: Center(child: ProgressRing(strokeWidth: 2))),
                      errorWidget: (_, __, ___) => Container(height: 160, color: c.surfaceElevated,
                          child: Center(child: Icon(FluentIcons.photo2, color: c.textFaint, size: 32))),
                    )
                  : Container(height: 160, color: c.surfaceElevated,
                      child: Center(child: Icon(FluentIcons.photo2, color: c.textFaint, size: 32))),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(destination.name,
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.textStrong),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      if (destination.isFeatured)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(color: AppColors.amber.withAlpha(30), borderRadius: BorderRadius.circular(6)),
                          child: Text('Featured', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.amber)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(FluentIcons.poi, size: 12, color: c.textFaint),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(destination.areaLabel,
                            style: TextStyle(fontSize: 12, color: c.textMuted), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      if (destination.categoryName != null) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(color: AppColors.red500.withAlpha(20), borderRadius: BorderRadius.circular(6)),
                          child: Text(destination.categoryName!,
                              style: TextStyle(fontSize: 10, color: AppColors.red400, fontWeight: FontWeight.w500)),
                        ),
                        const Spacer(),
                      ],
                      if (destination.rating > 0) ...[
                        Icon(FluentIcons.favorite_star_fill, size: 12, color: AppColors.amber),
                        const SizedBox(width: 3),
                        Text(destination.rating.toStringAsFixed(1),
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.text)),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
