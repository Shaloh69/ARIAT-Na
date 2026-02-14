import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../models/destination.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';

class DestinationDetailScreen extends StatelessWidget {
  final Destination destination;
  const DestinationDetailScreen({super.key, required this.destination});

  @override
  Widget build(BuildContext context) {
    return GradientBackground(
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(FluentIcons.back, color: AppColors.textStrong, size: 20),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(destination.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textStrong), maxLines: 1, overflow: TextOverflow.ellipsis),
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
                              placeholder: (_, __) => Container(color: AppColors.surfaceElevated, child: const Center(child: ProgressRing(strokeWidth: 2))),
                              errorWidget: (_, __, ___) => Container(color: AppColors.surfaceElevated, child: const Center(child: Icon(FluentIcons.photo2, color: AppColors.textFaint, size: 40))),
                            );
                          },
                        ),
                      ).animate().fadeIn(duration: 500.ms)
                    else
                      Container(height: 200, color: AppColors.surfaceElevated, child: const Center(child: Icon(FluentIcons.photo2, color: AppColors.textFaint, size: 48))),

                    Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(child: Text(destination.name, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: AppColors.textStrong))),
                              if (destination.rating > 0)
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(color: AppColors.amber.withAlpha(30), borderRadius: BorderRadius.circular(8)),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(FluentIcons.favorite_star_fill, size: 14, color: AppColors.amber),
                                      const SizedBox(width: 4),
                                      Text(destination.rating.toStringAsFixed(1), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.amber)),
                                    ],
                                  ),
                                ),
                            ],
                          ).animate().fadeIn(delay: 200.ms, duration: 400.ms),

                          if (destination.categoryName != null) ...[
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(color: AppColors.red500.withAlpha(20), borderRadius: BorderRadius.circular(6)),
                              child: Text(destination.categoryName!, style: const TextStyle(fontSize: 12, color: AppColors.red400, fontWeight: FontWeight.w500)),
                            ),
                          ],

                          if (destination.address != null) ...[
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                const Icon(FluentIcons.poi, size: 14, color: AppColors.textFaint),
                                const SizedBox(width: 6),
                                Expanded(child: Text(destination.address!, style: const TextStyle(fontSize: 13, color: AppColors.textMuted))),
                              ],
                            ),
                          ],

                          const SizedBox(height: 20),
                          Row(
                            children: [
                              Expanded(child: _infoCard('Local Fee', destination.entranceFeeLocal > 0 ? 'PHP ${destination.entranceFeeLocal.toStringAsFixed(0)}' : 'Free')),
                              const SizedBox(width: 10),
                              Expanded(child: _infoCard('Foreign Fee', destination.entranceFeeForeign > 0 ? 'PHP ${destination.entranceFeeForeign.toStringAsFixed(0)}' : 'Free')),
                              const SizedBox(width: 10),
                              Expanded(child: _infoCard('Duration', destination.averageVisitDuration > 0 ? '${destination.averageVisitDuration} min' : 'N/A')),
                            ],
                          ).animate().fadeIn(delay: 300.ms, duration: 400.ms),

                          if (destination.description != null && destination.description!.isNotEmpty) ...[
                            const SizedBox(height: 24),
                            const Text('About', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textStrong)),
                            const SizedBox(height: 8),
                            Text(destination.description!, style: const TextStyle(fontSize: 14, color: AppColors.textMuted, height: 1.5)),
                          ],

                          if (destination.bestTimeToVisit != null && destination.bestTimeToVisit!.isNotEmpty) ...[
                            const SizedBox(height: 20),
                            GlassCard(
                              child: Row(
                                children: [
                                  const Icon(FluentIcons.sunny, size: 18, color: AppColors.amber),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Text('Best Time to Visit', style: TextStyle(fontSize: 12, color: AppColors.textFaint, fontWeight: FontWeight.w500)),
                                        Text(destination.bestTimeToVisit!, style: const TextStyle(fontSize: 14, color: AppColors.text)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],

                          if (destination.amenities.isNotEmpty) ...[
                            const SizedBox(height: 20),
                            const Text('Amenities', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textStrong)),
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: destination.amenities.map((a) => Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceElevated,
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: Colors.white.withAlpha(15)),
                                ),
                                child: Text(a, style: const TextStyle(fontSize: 12, color: AppColors.text)),
                              )).toList(),
                            ),
                          ],

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

  Widget _infoCard(String label, String value) {
    return GlassCard(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
      borderRadius: 10,
      child: Column(
        children: [
          Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textStrong), textAlign: TextAlign.center),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textFaint), textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
