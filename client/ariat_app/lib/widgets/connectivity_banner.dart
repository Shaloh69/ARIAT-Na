import 'package:fluent_ui/fluent_ui.dart';
import '../theme/app_theme.dart';

class ConnectivityBanner extends StatelessWidget {
  final bool isOnline;
  const ConnectivityBanner({super.key, required this.isOnline});

  @override
  Widget build(BuildContext context) {
    if (isOnline) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: AppColors.amber.withAlpha(200),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(FluentIcons.cloud_not_synced, size: 14, color: Color(0xFF1E293B)),
          SizedBox(width: 8),
          Text(
            'Offline Mode — showing cached data',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF1E293B)),
          ),
        ],
      ),
    );
  }
}
