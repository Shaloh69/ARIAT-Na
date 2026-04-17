import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:provider/provider.dart';
import '../../models/destination.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../trips/trip_setup_screen.dart';

class DestinationDetailScreen extends StatefulWidget {
  final Destination destination;
  const DestinationDetailScreen({super.key, required this.destination});

  @override
  State<DestinationDetailScreen> createState() => _DestinationDetailScreenState();
}

class _DestinationDetailScreenState extends State<DestinationDetailScreen> {
  List<Destination> _nearby = [];
  bool _nearbyLoading = true;

  @override
  void initState() {
    super.initState();
    _loadNearby();
  }

  Future<void> _loadNearby() async {
    try {
      final api = context.read<ApiService>();
      final res = await api.get('/destinations/${widget.destination.id}');
      final rawNearby = res['data']?['nearby_places'] as List? ?? [];
      if (mounted) {
        setState(() {
          _nearby = rawNearby.map((n) => Destination.fromJson(n as Map<String, dynamic>)).toList();
          _nearbyLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _nearbyLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final destination = widget.destination;

    return GradientBackground(
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                children: [
                  IconButton(
                    icon: Icon(FluentIcons.back, color: c.textStrong, size: 20),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(destination.name,
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.textStrong),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (destination.images.isNotEmpty)
                      SizedBox(
                        height: 240,
                        child: PageView.builder(
                          itemCount: destination.images.length,
                          itemBuilder: (context, index) {
                            return CachedNetworkImage(
                              imageUrl: destination.images[index],
                              fit: BoxFit.cover,
                              placeholder: (_, __) => Container(
                                  color: c.surfaceElevated,
                                  child: Center(child: ProgressRing(strokeWidth: 2))),
                              errorWidget: (_, __, ___) => Container(
                                  color: c.surfaceElevated,
                                  child: Center(child: Icon(FluentIcons.photo2, color: c.textFaint, size: 40))),
                            );
                          },
                        ),
                      ).animate().fadeIn(duration: 500.ms)
                    else
                      Container(
                          height: 200,
                          color: c.surfaceElevated,
                          child: Center(child: Icon(FluentIcons.photo2, color: c.textFaint, size: 48))),

                    Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(destination.name,
                                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: c.textStrong)),
                              ),
                              if (destination.rating > 0)
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                      color: AppColors.amber.withAlpha(30),
                                      borderRadius: BorderRadius.circular(8)),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(FluentIcons.favorite_star_fill, size: 14, color: AppColors.amber),
                                      const SizedBox(width: 4),
                                      Text(destination.rating.toStringAsFixed(1),
                                          style: TextStyle(
                                              fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.amber)),
                                    ],
                                  ),
                                ),
                            ],
                          ).animate().fadeIn(delay: 200.ms, duration: 400.ms),

                          if (destination.categoryName != null) ...[
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                  color: AppColors.red500.withAlpha(20),
                                  borderRadius: BorderRadius.circular(6)),
                              child: Text(destination.categoryName!,
                                  style: TextStyle(
                                      fontSize: 12, color: AppColors.red400, fontWeight: FontWeight.w500)),
                            ),
                          ],

                          if (destination.address != null) ...[
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Icon(FluentIcons.poi, size: 14, color: c.textFaint),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(destination.address!,
                                      style: TextStyle(fontSize: 13, color: c.textMuted)),
                                ),
                              ],
                            ),
                          ],

                          if (destination.isIsland) ...[
                            const SizedBox(height: 16),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                color: const Color(0xFF7c3aed).withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: const Color(0xFF7c3aed).withValues(alpha: 0.35)),
                              ),
                              child: Row(
                                children: [
                                  const Icon(FluentIcons.airplane, size: 16, color: Color(0xFF7c3aed)),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      'Island destination — route goes through a pier. Ferry travel required.',
                                      style: TextStyle(fontSize: 12, color: c.textMuted),
                                    ),
                                  ),
                                ],
                              ),
                            ).animate().fadeIn(delay: 200.ms),
                          ],

                          const SizedBox(height: 20),
                          Row(
                            children: [
                              Expanded(child: _infoCard(context, 'Local Fee',
                                  destination.entranceFeeLocal > 0
                                      ? 'PHP ${destination.entranceFeeLocal.toStringAsFixed(0)}'
                                      : 'Free')),
                              const SizedBox(width: 10),
                              Expanded(child: _infoCard(context, 'Foreign Fee',
                                  destination.entranceFeeForeign > 0
                                      ? 'PHP ${destination.entranceFeeForeign.toStringAsFixed(0)}'
                                      : 'Free')),
                              const SizedBox(width: 10),
                              Expanded(child: _infoCard(context, 'Duration',
                                  destination.averageVisitDuration > 0
                                      ? '${destination.averageVisitDuration} min'
                                      : 'N/A')),
                            ],
                          ).animate().fadeIn(delay: 300.ms, duration: 400.ms),

                          // Add to Trip CTA
                          const SizedBox(height: 20),
                          SizedBox(
                            width: double.infinity,
                            child: Button(
                              style: ButtonStyle(
                                backgroundColor: WidgetStateProperty.all(AppColors.red500),
                                padding: WidgetStateProperty.all(
                                    const EdgeInsets.symmetric(vertical: 14)),
                                shape: WidgetStateProperty.all(RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12))),
                              ),
                              onPressed: () => Navigator.of(context).push(
                                FluentPageRoute(builder: (_) => TripSetupScreen(preselected: destination)),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: const [
                                  Icon(FluentIcons.add, size: 16, color: Colors.white),
                                  SizedBox(width: 8),
                                  Text('Add to Trip',
                                      style: TextStyle(
                                          fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                                ],
                              ),
                            ),
                          ).animate().fadeIn(delay: 350.ms, duration: 400.ms),

                          if (destination.description != null && destination.description!.isNotEmpty) ...[
                            const SizedBox(height: 24),
                            Text('About',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.textStrong)),
                            const SizedBox(height: 8),
                            Text(destination.description!,
                                style: TextStyle(fontSize: 14, color: c.textMuted, height: 1.5)),
                          ],

                          if (destination.bestTimeToVisit != null &&
                              destination.bestTimeToVisit!.isNotEmpty) ...[
                            const SizedBox(height: 20),
                            GlassCard(
                              child: Row(
                                children: [
                                  Icon(FluentIcons.sunny, size: 18, color: AppColors.amber),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text('Best Time to Visit',
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: c.textFaint,
                                                fontWeight: FontWeight.w500)),
                                        Text(destination.bestTimeToVisit!,
                                            style: TextStyle(fontSize: 14, color: c.text)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],

                          if (destination.amenities.isNotEmpty) ...[
                            const SizedBox(height: 20),
                            Text('Amenities',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.textStrong)),
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: destination.amenities
                                  .map((a) => Container(
                                        padding:
                                            const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                        decoration: BoxDecoration(
                                          color: c.surfaceElevated,
                                          borderRadius: BorderRadius.circular(8),
                                          border: Border.all(color: c.borderSubtle),
                                        ),
                                        child: Text(a, style: TextStyle(fontSize: 12, color: c.text)),
                                      ))
                                  .toList(),
                            ),
                          ],

                          // Nearby Spots section
                          const SizedBox(height: 28),
                          Row(
                            children: [
                              Text('Nearby Spots',
                                  style: TextStyle(
                                      fontSize: 18, fontWeight: FontWeight.w600, color: c.textStrong)),
                              const Spacer(),
                              if (_nearbyLoading)
                                const SizedBox(
                                    width: 14,
                                    height: 14,
                                    child: ProgressRing(strokeWidth: 2)),
                            ],
                          ),
                          const SizedBox(height: 12),
                          if (!_nearbyLoading && _nearby.isEmpty)
                            Text('No nearby spots found',
                                style: TextStyle(fontSize: 13, color: c.textFaint))
                          else
                            Column(
                              children: _nearby
                                  .map((spot) => Padding(
                                        padding: const EdgeInsets.only(bottom: 10),
                                        child: _NearbySpotCard(spot: spot),
                                      ))
                                  .toList(),
                            ),

                          const SizedBox(height: 30),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoCard(BuildContext context, String label, String value) {
    final c = context.appColors;
    return GlassCard(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
      borderRadius: 10,
      child: Column(
        children: [
          Text(value,
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.textStrong),
              textAlign: TextAlign.center),
          const SizedBox(height: 2),
          Text(label,
              style: TextStyle(fontSize: 10, color: c.textFaint),
              textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

class _NearbySpotCard extends StatelessWidget {
  final Destination spot;
  const _NearbySpotCard({required this.spot});

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        FluentPageRoute(builder: (_) => DestinationDetailScreen(destination: spot)),
      ),
      child: GlassCard(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: spot.primaryImage != null
                  ? CachedNetworkImage(
                      imageUrl: spot.primaryImage!,
                      width: 60, height: 60, fit: BoxFit.cover,
                      placeholder: (_, __) =>
                          Container(width: 60, height: 60, color: c.surfaceElevated),
                      errorWidget: (_, __, ___) => Container(
                          width: 60, height: 60, color: c.surfaceElevated,
                          child: Icon(FluentIcons.photo2, color: c.textFaint, size: 20)),
                    )
                  : Container(
                      width: 60, height: 60, color: c.surfaceElevated,
                      child: Icon(FluentIcons.photo2, color: c.textFaint, size: 20)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(spot.name,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textStrong),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(spot.areaLabel,
                      style: TextStyle(fontSize: 11, color: c.textMuted),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (spot.rating > 0) ...[
                    const SizedBox(height: 4),
                    Row(children: [
                      Icon(FluentIcons.favorite_star_fill, size: 10, color: AppColors.amber),
                      const SizedBox(width: 3),
                      Text(spot.rating.toStringAsFixed(1),
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c.text)),
                    ]),
                  ],
                ],
              ),
            ),
            Icon(FluentIcons.chevron_right, size: 12, color: c.textFaint),
          ],
        ),
      ),
    );
  }
}
