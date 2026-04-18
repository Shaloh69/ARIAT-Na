import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:provider/provider.dart';
import '../../models/destination.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';
import '../map/map_screen.dart';

class DestinationDetailScreen extends StatefulWidget {
  final Destination destination;
  const DestinationDetailScreen({super.key, required this.destination});

  @override
  State<DestinationDetailScreen> createState() => _DestinationDetailScreenState();
}

class _DestinationDetailScreenState extends State<DestinationDetailScreen> {
  List<Destination> _nearby = [];
  bool _nearbyLoading = true;

  // Rating state
  int _userRating = 0;
  bool _submittingRating = false;

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

  Future<void> _submitRating(int stars) async {
    setState(() { _userRating = stars; _submittingRating = true; });
    try {
      final api = context.read<ApiService>();
      await api.post('/destinations/${widget.destination.id}/rate',
          body: {'rating': stars}, auth: true);
      if (mounted) AppToast.success(context, 'Rating submitted!');
    } catch (_) {
      if (mounted) AppToast.error(context, 'Could not submit rating');
    } finally {
      if (mounted) setState(() => _submittingRating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final d = widget.destination;

    return GradientBackground(
      child: SafeArea(
        child: Column(
          children: [
            // Header bar
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
                    child: Text(d.name,
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
                    // Photo carousel
                    if (d.images.isNotEmpty)
                      SizedBox(
                        height: 240,
                        child: PageView.builder(
                          itemCount: d.images.length,
                          itemBuilder: (_, i) => CachedNetworkImage(
                            imageUrl: d.images[i],
                            fit: BoxFit.cover,
                            placeholder: (_, __) => Container(
                                color: c.surfaceElevated,
                                child: const Center(child: ProgressRing(strokeWidth: 2))),
                            errorWidget: (_, __, ___) => Container(
                                color: c.surfaceElevated,
                                child: Center(child: Icon(FluentIcons.photo2, color: c.textFaint, size: 40))),
                          ),
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

                          // Name + star rating badge
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(d.name,
                                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: c.textStrong)),
                              ),
                              if (d.rating > 0)
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
                                      Text('${d.rating.toStringAsFixed(1)} (${d.reviewCount})',
                                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.amber)),
                                    ],
                                  ),
                                ),
                            ],
                          ).animate().fadeIn(delay: 150.ms, duration: 400.ms),

                          // Category badge + tags
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 6, runSpacing: 6,
                            children: [
                              if (d.categoryName != null)
                                _badge(d.categoryName!, AppColors.red400, c),
                              if (d.familyFriendly)
                                _badge('Family-Friendly', AppColors.green, c),
                              _badge(d.budgetLabel, AppColors.blue, c),
                              if (d.starRating != null)
                                _badge('${'★' * d.starRating!} Hotel', AppColors.amber, c),
                              ...d.cuisineTypes.map((ct) => _badge(ct, AppColors.purple, c)),
                              ...d.serviceTypes.map((st) => _badge(st, AppColors.green, c)),
                            ],
                          ).animate().fadeIn(delay: 200.ms, duration: 400.ms),

                          // Address
                          if (d.address != null) ...[
                            const SizedBox(height: 12),
                            Row(children: [
                              Icon(FluentIcons.poi, size: 14, color: c.textFaint),
                              const SizedBox(width: 6),
                              Expanded(child: Text(d.address!,
                                  style: TextStyle(fontSize: 13, color: c.textMuted))),
                            ]),
                          ],

                          // Island warning
                          if (d.isIsland) ...[
                            const SizedBox(height: 14),
                            _infoBox(
                              icon: FluentIcons.airplane,
                              color: AppColors.purple,
                              text: 'Island destination — route goes through a pier. Ferry travel required.',
                              c: c,
                            ),
                          ],

                          // Key stats row
                          const SizedBox(height: 20),
                          Row(
                            children: [
                              Expanded(child: _infoCard(context, 'Local Fee',
                                  d.entranceFeeLocal > 0 ? 'PHP ${d.entranceFeeLocal.toStringAsFixed(0)}' : 'Free')),
                              const SizedBox(width: 10),
                              Expanded(child: _infoCard(context, 'Foreign Fee',
                                  d.entranceFeeForeign > 0 ? 'PHP ${d.entranceFeeForeign.toStringAsFixed(0)}' : 'Free')),
                              const SizedBox(width: 10),
                              Expanded(child: _infoCard(context, 'Duration',
                                  d.averageVisitDuration > 0 ? '${d.averageVisitDuration} min' : 'N/A')),
                            ],
                          ).animate().fadeIn(delay: 280.ms, duration: 400.ms),

                          // Hotel pricing
                          if (d.perNightMin != null || d.checkInTime != null) ...[
                            const SizedBox(height: 14),
                            GlassCard(
                              padding: const EdgeInsets.all(14),
                              child: Wrap(
                                spacing: 14, runSpacing: 10,
                                children: [
                                  if (d.perNightMin != null)
                                    _detailItem(FluentIcons.hotel,
                                        '₱${d.perNightMin!.toStringAsFixed(0)}${d.perNightMax != null ? "–₱${d.perNightMax!.toStringAsFixed(0)}" : ""}',
                                        'Per night', c),
                                  if (d.checkInTime != null)
                                    _detailItem(FluentIcons.clock, d.checkInTime!, 'Check-in', c),
                                  if (d.checkOutTime != null)
                                    _detailItem(FluentIcons.clock, d.checkOutTime!, 'Check-out', c),
                                  if (d.seatingCapacity != null)
                                    _detailItem(FluentIcons.people, '${d.seatingCapacity} seats', 'Seating', c),
                                ],
                              ),
                            ).animate().fadeIn(delay: 300.ms, duration: 400.ms),
                          ],

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
                                FluentPageRoute(builder: (_) => MapScreen(destination: d)),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: const [
                                  Icon(FluentIcons.add, size: 16, color: Colors.white),
                                  SizedBox(width: 8),
                                  Text('Add to Trip',
                                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                                ],
                              ),
                            ),
                          ).animate().fadeIn(delay: 320.ms, duration: 400.ms),

                          // About
                          if (d.description != null && d.description!.isNotEmpty) ...[
                            const SizedBox(height: 24),
                            _sectionHeader('About', c),
                            const SizedBox(height: 8),
                            Text(d.description!,
                                style: TextStyle(fontSize: 14, color: c.textMuted, height: 1.6)),
                          ],

                          // Best time to visit
                          if (d.bestTimeToVisit != null && d.bestTimeToVisit!.isNotEmpty) ...[
                            const SizedBox(height: 20),
                            GlassCard(
                              child: Row(children: [
                                Icon(FluentIcons.sunny, size: 18, color: AppColors.amber),
                                const SizedBox(width: 10),
                                Expanded(child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Best Time to Visit',
                                        style: TextStyle(fontSize: 12, color: c.textFaint, fontWeight: FontWeight.w500)),
                                    Text(d.bestTimeToVisit!, style: TextStyle(fontSize: 14, color: c.text)),
                                  ],
                                )),
                              ]),
                            ),
                          ],

                          // Contact & social
                          if (d.contactPhone != null || d.contactEmail != null ||
                              d.websiteUrl != null || d.facebookUrl != null || d.instagramUrl != null) ...[
                            const SizedBox(height: 24),
                            _sectionHeader('Contact & Links', c),
                            const SizedBox(height: 10),
                            GlassCard(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                children: [
                                  if (d.contactPhone != null)
                                    _contactRow(FluentIcons.phone, d.contactPhone!, c),
                                  if (d.contactEmail != null)
                                    _contactRow(FluentIcons.mail, d.contactEmail!, c),
                                  if (d.websiteUrl != null)
                                    _contactRow(FluentIcons.globe, d.websiteUrl!, c),
                                  if (d.facebookUrl != null)
                                    _contactRow(FluentIcons.share, 'Facebook', c),
                                  if (d.instagramUrl != null)
                                    _contactRow(FluentIcons.photo2, 'Instagram', c),
                                ],
                              ),
                            ).animate().fadeIn(delay: 100.ms, duration: 400.ms),
                          ],

                          // Amenities
                          if (d.amenities.isNotEmpty) ...[
                            const SizedBox(height: 24),
                            _sectionHeader('Amenities', c),
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 8, runSpacing: 8,
                              children: d.amenities.map((a) => Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(
                                  color: c.surfaceElevated,
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: c.borderSubtle),
                                ),
                                child: Text(a, style: TextStyle(fontSize: 12, color: c.text)),
                              )).toList(),
                            ),
                          ],

                          // Menu images (restaurants)
                          if (d.menuImages.isNotEmpty) ...[
                            const SizedBox(height: 24),
                            _sectionHeader('Menu', c),
                            const SizedBox(height: 10),
                            SizedBox(
                              height: 160,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemCount: d.menuImages.length,
                                separatorBuilder: (_, __) => const SizedBox(width: 10),
                                itemBuilder: (_, i) => ClipRRect(
                                  borderRadius: BorderRadius.circular(10),
                                  child: CachedNetworkImage(
                                    imageUrl: d.menuImages[i],
                                    width: 140, height: 160, fit: BoxFit.cover,
                                    placeholder: (_, __) => Container(width: 140, color: c.surfaceElevated),
                                    errorWidget: (_, __, ___) => Container(
                                        width: 140, color: c.surfaceElevated,
                                        child: Icon(FluentIcons.photo2, color: c.textFaint)),
                                  ),
                                ),
                              ),
                            ),
                          ],

                          // Rate this place
                          const SizedBox(height: 28),
                          _sectionHeader('Rate This Place', c),
                          const SizedBox(height: 10),
                          GlassCard(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('How was your experience?',
                                    style: TextStyle(fontSize: 13, color: c.textMuted)),
                                const SizedBox(height: 12),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: List.generate(5, (i) {
                                    final star = i + 1;
                                    return GestureDetector(
                                      onTap: _submittingRating ? null : () => _submitRating(star),
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(horizontal: 6),
                                        child: Icon(
                                          star <= _userRating
                                              ? FluentIcons.favorite_star_fill
                                              : FluentIcons.favorite_star,
                                          size: 32,
                                          color: star <= _userRating ? AppColors.amber : c.borderMedium,
                                        ),
                                      ),
                                    );
                                  }),
                                ),
                                if (_submittingRating) ...[
                                  const SizedBox(height: 10),
                                  const Center(child: ProgressRing(strokeWidth: 2)),
                                ],
                              ],
                            ),
                          ).animate().fadeIn(delay: 120.ms, duration: 400.ms),

                          // Nearby spots
                          const SizedBox(height: 28),
                          Row(
                            children: [
                              _sectionHeader('Nearby Spots', c),
                              const Spacer(),
                              if (_nearbyLoading)
                                const SizedBox(width: 14, height: 14,
                                    child: ProgressRing(strokeWidth: 2)),
                            ],
                          ),
                          const SizedBox(height: 12),
                          if (!_nearbyLoading && _nearby.isEmpty)
                            Text('No nearby spots found', style: TextStyle(fontSize: 13, color: c.textFaint))
                          else
                            Column(
                              children: _nearby.map((spot) => Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: _NearbySpotCard(spot: spot),
                              )).toList(),
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

  Widget _sectionHeader(String label, AppColorScheme c) =>
      Text(label, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: c.textStrong));

  Widget _badge(String label, Color color, AppColorScheme c) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: color.withAlpha(22), borderRadius: BorderRadius.circular(6)),
    child: Text(label, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
  );

  Widget _infoBox({required IconData icon, required Color color, required String text, required AppColorScheme c}) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: color.withAlpha(20),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withAlpha(60)),
        ),
        child: Row(children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(fontSize: 12, color: c.textMuted))),
        ]),
      );

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

  Widget _detailItem(IconData icon, String value, String label, AppColorScheme c) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 13, color: c.textFaint),
      const SizedBox(width: 5),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textStrong)),
          Text(label, style: TextStyle(fontSize: 10, color: c.textFaint)),
        ],
      ),
    ],
  );

  Widget _contactRow(IconData icon, String text, AppColorScheme c) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(children: [
      Icon(icon, size: 15, color: c.textMuted),
      const SizedBox(width: 10),
      Expanded(child: Text(text, style: TextStyle(fontSize: 13, color: c.text))),
    ]),
  );
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
