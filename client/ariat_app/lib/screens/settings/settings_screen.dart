import 'package:fluent_ui/fluent_ui.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../services/auth_service.dart';
import '../../services/api_service.dart';
import '../../services/connectivity_service.dart';
import '../../services/cache_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/responsive_utils.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late TextEditingController _urlController;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthService>();
    _urlController = TextEditingController(text: auth.baseUrl);
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  Future<void> _saveApiUrl() async {
    final url = _urlController.text.trim();
    if (url.isEmpty) {
      AppToast.warning(context, 'Please enter a valid URL');
      return;
    }
    try {
      final auth = context.read<AuthService>();
      await auth.setBaseUrl(url);
      context.read<ApiService>().baseUrl = url;
      if (mounted) AppToast.success(context, 'API URL updated');
    } catch (e) {
      if (mounted) AppToast.error(context, 'Failed to update URL');
    }
  }

  Future<void> _clearCache() async {
    try {
      await CacheService().clearAll();
      if (mounted) AppToast.success(context, 'Cache cleared successfully');
    } catch (e) {
      if (mounted) AppToast.error(context, 'Failed to clear cache');
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOnline = context.watch<ConnectivityService>().isOnline;

    return GradientBackground(
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 8),
              Text(
                'Settings',
                style: TextStyle(
                  fontSize: ResponsiveUtils.responsiveFontSize(
                    context,
                    small: 22,
                    medium: 28,
                    large: 32,
                  ),
                  fontWeight: FontWeight.w700,
                  color: AppColors.textStrong,
                ),
              ).animate().fadeIn(duration: 400.ms),
              const SizedBox(height: 24),

              // Connection status
              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    Container(
                      width: 10, height: 10,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isOnline ? AppColors.green : AppColors.amber,
                        boxShadow: [BoxShadow(color: (isOnline ? AppColors.green : AppColors.amber).withAlpha(100), blurRadius: 8)],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      isOnline ? 'Connected to Internet' : 'Offline Mode',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: isOnline ? AppColors.green : AppColors.amber),
                    ),
                    const Spacer(),
                    Icon(
                      isOnline ? FluentIcons.cloud : FluentIcons.cloud_not_synced,
                      size: 18,
                      color: isOnline ? AppColors.green : AppColors.amber,
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 50.ms, duration: 400.ms),

              const SizedBox(height: 16),

              // Server connection
              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(FluentIcons.server, size: 16, color: AppColors.red400),
                        SizedBox(width: 8),
                        Text('Server Connection', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textStrong)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    const Text('Configure the API server URL', style: TextStyle(fontSize: 12, color: AppColors.textFaint)),
                    const SizedBox(height: 14),
                    const Text('API Base URL', style: TextStyle(fontSize: 12, color: AppColors.textMuted, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 6),
                    TextBox(
                      controller: _urlController,
                      placeholder: 'http://10.0.2.2:5000/api/v1',
                      style: const TextStyle(color: AppColors.textStrong, fontSize: 13),
                      decoration: WidgetStateProperty.all(BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.white.withAlpha(25)),
                      )),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton(
                            onPressed: _saveApiUrl,
                            style: ButtonStyle(
                              backgroundColor: WidgetStateProperty.all(AppColors.red500),
                              shape: WidgetStateProperty.all(RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                              padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 10)),
                            ),
                            child: const Text('Save', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Button(
                          onPressed: () => _urlController.text = AuthService.defaultBaseUrl,
                          style: ButtonStyle(
                            shape: WidgetStateProperty.all(RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                            padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 10, horizontal: 14)),
                          ),
                          child: const Text('Reset', style: TextStyle(fontSize: 13)),
                        ),
                      ],
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 100.ms, duration: 500.ms),

              const SizedBox(height: 16),

              // Cache management
              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(FluentIcons.database, size: 16, color: AppColors.cyan),
                        SizedBox(width: 8),
                        Text('Offline Cache', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textStrong)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    const Text('Cached data is used when you are offline', style: TextStyle(fontSize: 12, color: AppColors.textFaint)),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: Button(
                        onPressed: _clearCache,
                        style: ButtonStyle(
                          shape: WidgetStateProperty.all(RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                          padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 10)),
                        ),
                        child: const Text('Clear Cache', style: TextStyle(fontSize: 13)),
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 150.ms, duration: 500.ms),

              const SizedBox(height: 16),

              // About
              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(FluentIcons.info, size: 16, color: AppColors.blue),
                        SizedBox(width: 8),
                        Text('About', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textStrong)),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _aboutRow('App Name', 'AIRAT-NA'),
                    _aboutRow('Version', '1.0.0'),
                    _aboutRow('Platform', 'Flutter + FluentUI'),
                    _aboutRow('Offline Support', 'Enabled'),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Image.asset('assets/logo.png', width: 28, height: 28),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            'AIRAT-NA Tourist Navigation - Your guide to exploring amazing destinations.',
                            style: TextStyle(fontSize: 12, color: AppColors.textMuted, height: 1.4),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 200.ms, duration: 500.ms),

              const SizedBox(height: 16),

              // Danger zone
              GlassCard(
                padding: const EdgeInsets.all(20),
                borderColor: const Color(0xFFDC2626).withAlpha(30),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Danger Zone', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFFFCA5A5))),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: Button(
                        onPressed: () async {
                          await context.read<AuthService>().logout();
                          if (mounted) AppToast.info(context, 'Signed out');
                        },
                        style: ButtonStyle(
                          backgroundColor: WidgetStateProperty.all(const Color(0xFFDC2626).withAlpha(20)),
                          shape: WidgetStateProperty.all(RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: const Color(0xFFDC2626).withAlpha(40)))),
                          padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 12)),
                        ),
                        child: const Text('Sign Out', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Color(0xFFFCA5A5))),
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 300.ms, duration: 500.ms),

              const SizedBox(height: 30),
            ],
          ),
        ),
      ),
    );
  }

  Widget _aboutRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textMuted)),
          Text(value, style: const TextStyle(fontSize: 13, color: AppColors.text, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
