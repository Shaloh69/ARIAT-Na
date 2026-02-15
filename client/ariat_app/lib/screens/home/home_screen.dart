import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter/material.dart' show RefreshIndicator;
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/auth_service.dart';
import '../../services/api_service.dart';
import '../../services/connectivity_service.dart';
import '../../models/destination.dart';
import '../../theme/app_theme.dart';
import '../../utils/responsive_utils.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';
import '../destinations/destination_detail_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Destination> _featured = [];
  List<Category> _categories = [];
  bool _loading = true;
  bool _fromCache = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    try {
      final api = context.read<ApiService>();
      final results = await Future.wait([
        api.get('/destinations/featured'),
        api.get('/categories'),
      ]);

      final featuredData = results[0]['data'] as List? ?? [];
      final catData = results[1]['data'] as List? ?? [];
      final cached = results[0]['cached'] == true || results[1]['cached'] == true;

      setState(() {
        _featured = featuredData.map((d) => Destination.fromJson(d)).toList();
        _categories = catData.map((c) => Category.fromJson(c)).toList();
        _loading = false;
        _fromCache = cached;
      });

      if (cached && mounted) {
        AppToast.info(context, 'Showing cached data');
      }
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) AppToast.error(context, 'Could not load data. Check connection.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final isOnline = context.watch<ConnectivityService>().isOnline;
    final userName = auth.user?['full_name'] ?? 'Explorer';

    return GradientBackground(
      child: SafeArea(
        child: _loading
            ? const Center(child: ProgressRing())
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
                                const Text('AIRAT-NA', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.textStrong, letterSpacing: 1.5)),
                                const Spacer(),
                                if (!isOnline)
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: AppColors.amber.withAlpha(25),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: const Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(FluentIcons.cloud_not_synced, size: 12, color: AppColors.amber),
                                        SizedBox(width: 4),
                                        Text('Offline', style: TextStyle(fontSize: 10, color: AppColors.amber, fontWeight: FontWeight.w600)),
                                      ],
                                    ),
                                  ),
                              ],
                            ).animate().fadeIn(duration: 500.ms),
                            const SizedBox(height: 20),
                            Text(
                              'Hello, $userName',
                              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: AppColors.textStrong),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ).animate().fadeIn(delay: 100.ms, duration: 500.ms),
                            const SizedBox(height: 4),
                            Text(
                              auth.isOfflineSession ? 'Offline mode — cached data shown' : 'Where would you like to go?',
                              style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
                            ).animate().fadeIn(delay: 200.ms, duration: 500.ms),
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
                            child: const Row(
                              children: [
                                Icon(FluentIcons.database, size: 14, color: AppColors.blue),
                                SizedBox(width: 8),
                                Text('Showing cached data', style: TextStyle(fontSize: 12, color: AppColors.blue)),
                              ],
                            ),
                          ),
                        ),
                      ),

                    // Categories
                    if (_categories.isNotEmpty) ...[
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                          child: const Text('Categories', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textStrong))
                              .animate().fadeIn(delay: 300.ms, duration: 500.ms),
                        ),
                      ),
                      SliverToBoxAdapter(
                        child: SizedBox(
                          height: ResponsiveUtils.isShortScreen(context) ? 70 : 80,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            itemCount: _categories.length,
                            separatorBuilder: (_, __) => const SizedBox(width: 10),
                            itemBuilder: (context, index) {
                              final cat = _categories[index];
                              return GlassCard(
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                borderRadius: 14,
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Icon(FluentIcons.poi, color: AppColors.red400, size: 22),
                                    const SizedBox(height: 4),
                                    Text(
                                      cat.name,
                                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: AppColors.text),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    Text('${cat.destinationCount}', style: const TextStyle(fontSize: 10, color: AppColors.textFaint)),
                                  ],
                                ),
                              ).animate().fadeIn(delay: (300 + index * 60).ms, duration: 400.ms);
                            },
                          ),
                        ),
                      ),
                    ],

                    // Featured destinations
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
                        child: const Text('Featured Destinations', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textStrong))
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
                                Icon(FluentIcons.compass_n_w, size: 40, color: AppColors.textFaint),
                                const SizedBox(height: 12),
                                const Text('No featured destinations yet', style: TextStyle(color: AppColors.textMuted, fontSize: 14)),
                                const SizedBox(height: 4),
                                const Text('Check back soon for exciting places!', style: TextStyle(color: AppColors.textFaint, fontSize: 12)),
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
                          itemBuilder: (context, index) {
                            final dest = _featured[index];
                            return _DestinationCard(destination: dest)
                                .animate()
                                .fadeIn(delay: (500 + index * 100).ms, duration: 500.ms)
                                .slideX(begin: 0.05, end: 0, duration: 500.ms);
                          },
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

class _DestinationCard extends StatelessWidget {
  final Destination destination;
  const _DestinationCard({required this.destination});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        Navigator.of(context).push(FluentPageRoute(
          builder: (_) => DestinationDetailScreen(destination: destination),
        ));
      },
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
                      height: 160,
                      width: double.infinity,
                      fit: BoxFit.cover,
                      placeholder: (_, __) => Container(
                        height: 160,
                        color: AppColors.surfaceElevated,
                        child: const Center(child: ProgressRing(strokeWidth: 2)),
                      ),
                      errorWidget: (_, __, ___) => Container(
                        height: 160,
                        color: AppColors.surfaceElevated,
                        child: const Center(child: Icon(FluentIcons.photo2, color: AppColors.textFaint, size: 32)),
                      ),
                    )
                  : Container(
                      height: 160,
                      color: AppColors.surfaceElevated,
                      child: const Center(child: Icon(FluentIcons.photo2, color: AppColors.textFaint, size: 32)),
                    ),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(destination.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textStrong), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      if (destination.isFeatured)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(color: AppColors.amber.withAlpha(30), borderRadius: BorderRadius.circular(6)),
                          child: const Text('Featured', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.amber)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  if (destination.address != null)
                    Row(
                      children: [
                        const Icon(FluentIcons.poi, size: 12, color: AppColors.textFaint),
                        const SizedBox(width: 4),
                        Expanded(child: Text(destination.address!, style: const TextStyle(fontSize: 12, color: AppColors.textMuted), maxLines: 1, overflow: TextOverflow.ellipsis)),
                      ],
                    ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      if (destination.categoryName != null) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(color: AppColors.red500.withAlpha(20), borderRadius: BorderRadius.circular(6)),
                          child: Text(destination.categoryName!, style: const TextStyle(fontSize: 10, color: AppColors.red400, fontWeight: FontWeight.w500)),
                        ),
                        const Spacer(),
                      ],
                      if (destination.rating > 0) ...[
                        Icon(FluentIcons.favorite_star_fill, size: 12, color: AppColors.amber),
                        const SizedBox(width: 3),
                        Text(destination.rating.toStringAsFixed(1), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.text)),
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
