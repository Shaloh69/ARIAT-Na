import 'package:fluent_ui/fluent_ui.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../services/auth_service.dart';
import '../../services/api_service.dart';
import '../../services/connectivity_service.dart';
import '../../services/cache_service.dart';
import '../../services/theme_service.dart';
import '../../theme/app_theme.dart';
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
    final currentContext = context;
    final url = _urlController.text.trim();
    if (url.isEmpty) {
      AppToast.warning(currentContext, 'Please enter a valid URL');
      return;
    }
    try {
      final auth = currentContext.read<AuthService>();
      final api = currentContext.read<ApiService>();
      await auth.setBaseUrl(url);
      if (!currentContext.mounted) return;
      api.baseUrl = url;
      AppToast.success(currentContext, 'API URL updated');
    } catch (e) {
      if (!currentContext.mounted) return;
      AppToast.error(currentContext, 'Failed to update URL');
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
    final c = context.appColors;
    final isOnline = context.watch<ConnectivityService>().isOnline;
    final themeService = context.watch<ThemeService>();

    return GradientBackground(
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(height: 8),
              Text('Settings', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: c.textStrong))
                  .animate().fadeIn(duration: 400.ms),
              SizedBox(height: 24),

              // Appearance (theme toggle)
              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(FluentIcons.brightness, size: 16, color: AppColors.amber),
                        SizedBox(width: 8),
                        Text('Appearance', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.textStrong)),
                      ],
                    ),
                    SizedBox(height: 14),
                    Row(
                      children: [
                        Icon(
                          themeService.isDark ? FluentIcons.clear_night : FluentIcons.sunny,
                          size: 16,
                          color: c.textMuted,
                        ),
                        SizedBox(width: 10),
                        Text(
                          themeService.isDark ? 'Dark Mode' : 'Light Mode',
                          style: TextStyle(fontSize: 14, color: c.text),
                        ),
                        Spacer(),
                        ToggleSwitch(
                          checked: themeService.isDark,
                          onChanged: (_) => context.read<ThemeService>().toggleTheme(),
                        ),
                      ],
                    ),
                  ],
                ),
              ).animate().fadeIn(duration: 400.ms),

              SizedBox(height: 16),

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
                    SizedBox(width: 12),
                    Text(
                      isOnline ? 'Connected to Internet' : 'Offline Mode',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: isOnline ? AppColors.green : AppColors.amber),
                    ),
                    Spacer(),
                    Icon(
                      isOnline ? FluentIcons.cloud : FluentIcons.cloud_not_synced,
                      size: 18,
                      color: isOnline ? AppColors.green : AppColors.amber,
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 50.ms, duration: 400.ms),

              SizedBox(height: 16),

              // Server connection
              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(FluentIcons.server, size: 16, color: AppColors.red400),
                        SizedBox(width: 8),
                        Text('Server Connection', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.textStrong)),
                      ],
                    ),
                    SizedBox(height: 6),
                    Text('Configure the API server URL', style: TextStyle(fontSize: 12, color: c.textFaint)),
                    SizedBox(height: 14),
                    Text('API Base URL', style: TextStyle(fontSize: 12, color: c.textMuted, fontWeight: FontWeight.w500)),
                    SizedBox(height: 6),
                    TextBox(
                      controller: _urlController,
                      placeholder: 'http://10.0.2.2:5000/api/v1',
                      style: TextStyle(color: c.textStrong, fontSize: 13),
                      decoration: WidgetStateProperty.all(BoxDecoration(
                        color: c.surfaceElevated,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: c.borderMedium),
                      )),
                    ),
                    SizedBox(height: 12),
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
                            child: Text('Save', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          ),
                        ),
                        SizedBox(width: 10),
                        Button(
                          onPressed: () => _urlController.text = AuthService.defaultBaseUrl,
                          style: ButtonStyle(
                            shape: WidgetStateProperty.all(RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                            padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 10, horizontal: 14)),
                          ),
                          child: Text('Reset', style: TextStyle(fontSize: 13)),
                        ),
                      ],
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 100.ms, duration: 500.ms),

              SizedBox(height: 16),

              // Cache management
              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(FluentIcons.database, size: 16, color: AppColors.cyan),
                        SizedBox(width: 8),
                        Text('Offline Cache', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.textStrong)),
                      ],
                    ),
                    SizedBox(height: 6),
                    Text('Cached data is used when you are offline', style: TextStyle(fontSize: 12, color: c.textFaint)),
                    SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: Button(
                        onPressed: _clearCache,
                        style: ButtonStyle(
                          shape: WidgetStateProperty.all(RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                          padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 10)),
                        ),
                        child: Text('Clear Cache', style: TextStyle(fontSize: 13)),
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 150.ms, duration: 500.ms),

              SizedBox(height: 16),

              // About
              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(FluentIcons.info, size: 16, color: AppColors.blue),
                        SizedBox(width: 8),
                        Text('About', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.textStrong)),
                      ],
                    ),
                    SizedBox(height: 14),
                    _aboutRow('App Name', 'AIRAT-NA'),
                    _aboutRow('Version', '1.0.0'),
                    _aboutRow('Platform', 'Flutter + FluentUI'),
                    _aboutRow('Offline Support', 'Enabled'),
                    SizedBox(height: 12),
                    Row(
                      children: [
                        Image.asset('assets/logo.png', width: 28, height: 28),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'AIRAT-NA Tourist Navigation - Your guide to exploring amazing destinations.',
                            style: TextStyle(fontSize: 12, color: c.textMuted, height: 1.4),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 200.ms, duration: 500.ms),

              SizedBox(height: 16),

              // Danger zone
              GlassCard(
                padding: const EdgeInsets.all(20),
                borderColor: Color(0xFFDC2626).withAlpha(30),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Danger Zone', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFFFCA5A5))),
                    SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: Button(
                        onPressed: () async {
                          await context.read<AuthService>().logout();
                          if (!context.mounted) return;
                          AppToast.info(context, 'Signed out');
                        },
                        style: ButtonStyle(
                          backgroundColor: WidgetStateProperty.all(Color(0xFFDC2626).withAlpha(20)),
                          shape: WidgetStateProperty.all(RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: Color(0xFFDC2626).withAlpha(40)))),
                          padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 12)),
                        ),
                        child: Text('Sign Out', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Color(0xFFFCA5A5))),
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 300.ms, duration: 500.ms),

              SizedBox(height: 30),
            ],
          ),
        ),
      ),
    );
  }

  Widget _aboutRow(String label, String value) {
    final c = context.appColors;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 13, color: c.textMuted)),
          Text(value, style: TextStyle(fontSize: 13, color: c.text, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
