import 'package:fluent_ui/fluent_ui.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';
import '../../models/destination.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';
import 'destination_detail_screen.dart';

class DestinationsScreen extends StatefulWidget {
  const DestinationsScreen({super.key});
  @override
  State<DestinationsScreen> createState() => _DestinationsScreenState();
}

class _DestinationsScreenState extends State<DestinationsScreen> {
  List<Destination> _destinations = [];
  List<Category> _categories = [];
  String? _selectedCategory;
  String _searchQuery = '';
  bool _loading = true;
  int _page = 1;
  int _totalPages = 1;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadCategories();
    _loadDestinations();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    try {
      final api = context.read<ApiService>();
      final res = await api.get('/categories');
      setState(() {
        _categories = ((res['data'] as List?) ?? []).map((c) => Category.fromJson(c)).toList();
      });
    } catch (_) {}
  }

  Future<void> _loadDestinations({bool append = false}) async {
    if (!append) setState(() => _loading = true);
    try {
      final api = context.read<ApiService>();
      final query = <String, String>{
        'page': _page.toString(),
        'limit': '20',
        if (_selectedCategory != null) 'category': _selectedCategory!,
        if (_searchQuery.isNotEmpty) 'q': _searchQuery,
      };
      final res = await api.get('/destinations', query: query);
      final data = ((res['data'] as List?) ?? []).map((d) => Destination.fromJson(d)).toList();
      final pagination = res['pagination'] as Map<String, dynamic>?;
      final cached = res['cached'] == true;

      setState(() {
        if (append) {
          _destinations.addAll(data);
        } else {
          _destinations = data;
        }
        _totalPages = pagination?['totalPages'] ?? 1;
        _loading = false;
      });

      if (cached && !append && mounted) {
        AppToast.info(context, 'Showing cached destinations');
      }
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) AppToast.error(context, 'Failed to load destinations');
    }
  }

  void _onSearch(String value) {
    _searchQuery = value;
    _page = 1;
    _loadDestinations();
  }

  void _onCategoryFilter(String? catId) {
    setState(() => _selectedCategory = catId);
    _page = 1;
    _loadDestinations();
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
              child: Text('Explore', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: c.textStrong))
                  .animate().fadeIn(duration: 400.ms),
            ),
            SizedBox(height: 14),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: TextBox(
                controller: _searchController,
                placeholder: 'Search destinations...',
                prefix: Padding(
                  padding: EdgeInsets.only(left: 10),
                  child: Icon(FluentIcons.search, size: 16, color: c.textFaint),
                ),
                onSubmitted: _onSearch,
                style: TextStyle(color: c.textStrong),
                decoration: WidgetStateProperty.all(BoxDecoration(
                  color: c.surfaceElevated,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: c.borderLight),
                )),
              ),
            ).animate().fadeIn(delay: 100.ms, duration: 400.ms),
            SizedBox(height: 12),
            if (_categories.isNotEmpty)
              SizedBox(
                height: 36,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  children: [
                    _chipFilter('All', null),
                    ..._categories.map((c) => _chipFilter(c.name, c.id)),
                  ],
                ),
              ).animate().fadeIn(delay: 200.ms, duration: 400.ms),
            SizedBox(height: 12),
            Expanded(
              child: _loading
                  ? Center(child: ProgressRing())
                  : _destinations.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(FluentIcons.search, size: 40, color: c.textFaint),
                              SizedBox(height: 12),
                              Text('No destinations found', style: TextStyle(color: c.textMuted, fontSize: 15)),
                              SizedBox(height: 4),
                              Text('Try a different search or category', style: TextStyle(color: c.textFaint, fontSize: 12)),
                            ],
                          ),
                        )
                      : NotificationListener<ScrollNotification>(
                          onNotification: (scroll) {
                            if (scroll.metrics.pixels >= scroll.metrics.maxScrollExtent - 200 && _page < _totalPages) {
                              _page++;
                              _loadDestinations(append: true);
                            }
                            return false;
                          },
                          child: ListView.separated(
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            itemCount: _destinations.length,
                            separatorBuilder: (_, __) => SizedBox(height: 12),
                            itemBuilder: (context, index) {
                              final dest = _destinations[index];
                              return _DestListItem(destination: dest)
                                  .animate().fadeIn(delay: (index * 50).ms, duration: 400.ms);
                            },
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _chipFilter(String label, String? catId) {
    final c = context.appColors;
    final isSelected = _selectedCategory == catId;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: () => _onCategoryFilter(catId),
        child: AnimatedContainer(
          duration: Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.red500 : c.surfaceElevated,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: isSelected ? AppColors.red500 : c.borderLight),
          ),
          child: Text(label, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400, color: isSelected ? Colors.white : c.textMuted)),
        ),
      ),
    );
  }
}

class _DestListItem extends StatelessWidget {
  final Destination destination;
  const _DestListItem({required this.destination});

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return GestureDetector(
      onTap: () {
        Navigator.of(context).push(FluentPageRoute(
          builder: (_) => DestinationDetailScreen(destination: destination),
        ));
      },
      child: GlassCard(
        padding: const EdgeInsets.all(10),
        borderRadius: 14,
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: destination.primaryImage != null
                  ? CachedNetworkImage(
                      imageUrl: destination.primaryImage!,
                      width: 80, height: 80, fit: BoxFit.cover,
                      placeholder: (_, __) => Container(width: 80, height: 80, color: c.surfaceElevated),
                      errorWidget: (_, __, ___) => Container(width: 80, height: 80, color: c.surfaceElevated, child: Icon(FluentIcons.photo2, color: c.textFaint)),
                    )
                  : Container(width: 80, height: 80, color: c.surfaceElevated, child: Icon(FluentIcons.photo2, color: c.textFaint)),
            ),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(destination.name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.textStrong), maxLines: 1, overflow: TextOverflow.ellipsis),
                  SizedBox(height: 3),
                  if (destination.address != null)
                    Text(destination.address!, style: TextStyle(fontSize: 11, color: c.textMuted), maxLines: 1, overflow: TextOverflow.ellipsis),
                  SizedBox(height: 6),
                  Row(
                    children: [
                      if (destination.categoryName != null)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(color: AppColors.red500.withAlpha(20), borderRadius: BorderRadius.circular(4)),
                          child: Text(destination.categoryName!, style: TextStyle(fontSize: 9, color: AppColors.red400)),
                        ),
                      Spacer(),
                      if (destination.rating > 0) ...[
                        Icon(FluentIcons.favorite_star_fill, size: 11, color: AppColors.amber),
                        SizedBox(width: 2),
                        Text(destination.rating.toStringAsFixed(1), style: TextStyle(fontSize: 11, color: c.text, fontWeight: FontWeight.w500)),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            SizedBox(width: 4),
            Icon(FluentIcons.chevron_right, size: 14, color: c.textFaint),
          ],
        ),
      ),
    );
  }
}
