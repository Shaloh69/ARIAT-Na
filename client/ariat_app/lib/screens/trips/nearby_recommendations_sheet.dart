import 'package:cached_network_image/cached_network_image.dart';
import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter/material.dart' show showModalBottomSheet;
import 'package:flutter_animate/flutter_animate.dart';
import '../../models/destination.dart';
import '../../theme/app_theme.dart';
import '../../widgets/glass_card.dart';

/// Parsed result from POST /ai/recommend/nearby
class NearbyRecommendations {
  final bool isMealtime;
  final String mealLabel;
  final List<Map<String, dynamic>> mealtime;
  final List<Map<String, dynamic>> nearby;
  final List<Map<String, dynamic>> dontMiss;

  const NearbyRecommendations({
    required this.isMealtime,
    required this.mealLabel,
    required this.mealtime,
    required this.nearby,
    required this.dontMiss,
  });

  factory NearbyRecommendations.fromJson(Map<String, dynamic> json) {
    List<Map<String, dynamic>> castList(dynamic v) =>
        (v as List?)?.map((e) => Map<String, dynamic>.from(e as Map)).toList() ?? [];
    return NearbyRecommendations(
      isMealtime: json['is_mealtime'] == true,
      mealLabel: json['meal_label'] as String? ?? 'Meal',
      mealtime: castList(json['mealtime']),
      nearby: castList(json['nearby']),
      dontMiss: castList(json['dont_miss']),
    );
  }

  bool get isEmpty => mealtime.isEmpty && nearby.isEmpty && dontMiss.isEmpty;
}

/// Builds a Destination from a raw recommendation map (server returns flat row)
Destination _destinationFromRaw(Map<String, dynamic> raw) {
  return Destination(
    id: raw['id'] as String? ?? '',
    name: raw['name'] as String? ?? '',
    description: raw['description'] as String?,
    categoryName: raw['category_name'] as String?,
    categorySlug: raw['category_slug'] as String?,
    clusterId: raw['cluster_id'] as String?,
    clusterName: raw['cluster_name'] as String?,
    municipality: raw['municipality'] as String?,
    latitude: (raw['latitude'] as num?)?.toDouble() ?? 0,
    longitude: (raw['longitude'] as num?)?.toDouble() ?? 0,
    images: (raw['images'] as List?)?.cast<String>() ?? [],
    entranceFeeLocal: (raw['entrance_fee_local'] as num?)?.toDouble() ?? 0,
    averageVisitDuration: (raw['average_visit_duration'] as num?)?.toInt() ?? 60,
    budgetLevel: raw['budget_level'] as String? ?? 'mid',
    rating: (raw['rating'] as num?)?.toDouble() ?? 0,
    reviewCount: (raw['review_count'] as num?)?.toInt() ?? 0,
    isFeatured: raw['is_featured'] == true || raw['is_featured'] == 1,
    isActive: true,
  );
}

class NearbyRecommendationsSheet extends StatelessWidget {
  final NearbyRecommendations recs;
  final void Function(Destination dest) onAdd;

  const NearbyRecommendationsSheet({
    super.key,
    required this.recs,
    required this.onAdd,
  });

  static Future<void> show(
    BuildContext context,
    NearbyRecommendations recs,
    void Function(Destination) onAdd,
  ) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      enableDrag: true,
      builder: (_) => NearbyRecommendationsSheet(recs: recs, onAdd: onAdd),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final sections = <_Section>[];

    if (recs.isMealtime && recs.mealtime.isNotEmpty) {
      sections.add(_Section(
        emoji: '🍽️',
        title: recs.mealLabel,
        subtitle: 'Great places to eat nearby',
        color: AppColors.amber,
        items: recs.mealtime,
      ));
    }
    if (recs.nearby.isNotEmpty) {
      sections.add(_Section(
        emoji: '🚶',
        title: 'Walking Distance',
        subtitle: 'Within 500m of you',
        color: AppColors.green,
        items: recs.nearby,
      ));
    }
    if (recs.dontMiss.isNotEmpty) {
      sections.add(_Section(
        emoji: '⭐',
        title: "Don't Miss",
        subtitle: 'Highly rated, close by',
        color: AppColors.red400,
        items: recs.dontMiss,
      ));
    }

    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(top: BorderSide(color: c.borderLight)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 4),
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: c.borderMedium,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            child: Row(
              children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [AppColors.red500, AppColors.red400],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(FluentIcons.location, size: 20, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('You\'re here!',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.textStrong)),
                    Text('Explore what\'s around you',
                        style: TextStyle(fontSize: 12, color: c.textMuted)),
                  ],
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () => Navigator.of(context).pop(),
                  child: Icon(FluentIcons.cancel, size: 16, color: c.textMuted),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 300.ms).slideY(begin: -0.1, end: 0),

          const SizedBox(height: 12),

          if (sections.isEmpty)
            Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                children: [
                  Icon(FluentIcons.map_pin, size: 48, color: c.textFaint),
                  const SizedBox(height: 12),
                  Text('No spots found nearby',
                      style: TextStyle(fontSize: 14, color: c.textMuted, fontWeight: FontWeight.w500)),
                  Text('Try exploring on the map',
                      style: TextStyle(fontSize: 12, color: c.textFaint)),
                ],
              ),
            )
          else
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.6,
              ),
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (var i = 0; i < sections.length; i++) ...[
                      if (i > 0) const SizedBox(height: 20),
                      _SectionWidget(
                        section: sections[i],
                        onAdd: (raw) {
                          final dest = _destinationFromRaw(raw);
                          onAdd(dest);
                          Navigator.of(context).pop();
                        },
                        delay: i * 100,
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    ).animate().slideY(begin: 0.15, end: 0, duration: 350.ms, curve: Curves.easeOutCubic);
  }
}

class _Section {
  final String emoji;
  final String title;
  final String subtitle;
  final Color color;
  final List<Map<String, dynamic>> items;

  const _Section({
    required this.emoji,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.items,
  });
}

class _SectionWidget extends StatelessWidget {
  final _Section section;
  final void Function(Map<String, dynamic>) onAdd;
  final int delay;

  const _SectionWidget({required this.section, required this.onAdd, this.delay = 0});

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Text(section.emoji, style: const TextStyle(fontSize: 18)),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(section.title,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.textStrong)),
              Text(section.subtitle,
                  style: TextStyle(fontSize: 11, color: c.textMuted)),
            ],
          ),
        ]).animate().fadeIn(delay: delay.ms, duration: 300.ms),
        const SizedBox(height: 10),
        SizedBox(
          height: 200,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: section.items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, i) => _RecommendationCard(
              raw: section.items[i],
              accentColor: section.color,
              onAdd: onAdd,
              delay: delay + i * 60,
            ),
          ),
        ),
      ],
    );
  }
}

class _RecommendationCard extends StatelessWidget {
  final Map<String, dynamic> raw;
  final Color accentColor;
  final void Function(Map<String, dynamic>) onAdd;
  final int delay;

  const _RecommendationCard({
    required this.raw,
    required this.accentColor,
    required this.onAdd,
    this.delay = 0,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final images = raw['images'] is List
        ? (raw['images'] as List).cast<String>()
        : <String>[];
    final distKm = (raw['distanceKm'] as num?)?.toDouble() ?? 0;
    final distLabel = distKm < 1
        ? '${(distKm * 1000).round()}m away'
        : '${distKm.toStringAsFixed(1)}km away';
    final rating = (raw['rating'] as num?)?.toDouble() ?? 0;
    final fee = (raw['entrance_fee_local'] as num?)?.toDouble() ?? 0;

    return GestureDetector(
      onTap: () => onAdd(raw),
      child: GlassCard(
        padding: EdgeInsets.zero,
        child: SizedBox(
          width: 160,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Image
              ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                child: SizedBox(
                  height: 90,
                  width: double.infinity,
                  child: images.isNotEmpty
                      ? CachedNetworkImage(
                          imageUrl: images.first,
                          fit: BoxFit.cover,
                          placeholder: (_, __) => Container(color: c.surfaceElevated),
                          errorWidget: (_, __, ___) => Container(
                            color: c.surfaceElevated,
                            child: Icon(FluentIcons.image_pixel, size: 32, color: c.textFaint),
                          ),
                        )
                      : Container(
                          color: c.surfaceElevated,
                          child: Icon(FluentIcons.image_pixel, size: 32, color: c.textFaint),
                        ),
                ),
              ),

              // Info
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(raw['name'] as String? ?? '',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c.textStrong),
                          maxLines: 2, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 4),
                      Row(children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(
                            color: accentColor.withAlpha(25),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(distLabel,
                              style: TextStyle(fontSize: 9, color: accentColor, fontWeight: FontWeight.w600)),
                        ),
                        const SizedBox(width: 4),
                        if (rating > 0) ...[
                          Icon(FluentIcons.favorite_star_fill, size: 9, color: AppColors.amber),
                          const SizedBox(width: 2),
                          Text(rating.toStringAsFixed(1),
                              style: TextStyle(fontSize: 9, color: c.textMuted)),
                        ],
                      ]),
                      const Spacer(),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          if (fee > 0)
                            Text('₱${fee.toStringAsFixed(0)}',
                                style: TextStyle(fontSize: 10, color: AppColors.amber, fontWeight: FontWeight.w600))
                          else
                            Text('Free entry',
                                style: TextStyle(fontSize: 10, color: AppColors.green, fontWeight: FontWeight.w500)),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: accentColor,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text('+ Add',
                                style: const TextStyle(fontSize: 9, color: Colors.white, fontWeight: FontWeight.w700)),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ).animate().fadeIn(delay: delay.ms, duration: 300.ms).slideX(begin: 0.1, end: 0),
    );
  }
}
