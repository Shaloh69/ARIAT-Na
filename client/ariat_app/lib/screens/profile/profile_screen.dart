import 'package:fluent_ui/fluent_ui.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../services/auth_service.dart';
import '../../services/connectivity_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _editing = false;
  bool _saving = false;
  late TextEditingController _nameController;
  late TextEditingController _phoneController;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthService>().user;
    _nameController = TextEditingController(text: user?['full_name'] ?? '');
    _phoneController = TextEditingController(text: user?['phone_number'] ?? '');
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    final isOnline = context.read<ConnectivityService>().isOnline;
    if (!isOnline) {
      AppToast.warning(context, 'Profile update requires internet');
      return;
    }
    setState(() => _saving = true);
    try {
      await context.read<AuthService>().updateProfile(
        fullName: _nameController.text.trim(),
        phone: _phoneController.text.trim(),
      );
      if (mounted) {
        setState(() => _editing = false);
        AppToast.success(context, 'Profile updated!');
      }
    } catch (e) {
      if (mounted) AppToast.error(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final isOnline = context.watch<ConnectivityService>().isOnline;
    final user = auth.user;
    if (user == null) return const SizedBox.shrink();

    final name = user['full_name'] ?? 'User';
    final email = user['email'] ?? '';
    final phone = user['phone_number'] ?? '';
    final initials = name.split(' ').take(2).map((w) => w.isNotEmpty ? w[0].toUpperCase() : '').join();

    return GradientBackground(
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              const SizedBox(height: 16),
              Container(
                width: 90, height: 90,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    colors: [AppColors.red500, AppColors.purple],
                    begin: Alignment.topLeft, end: Alignment.bottomRight,
                  ),
                  boxShadow: [BoxShadow(color: AppColors.red500.withAlpha(60), blurRadius: 20, offset: const Offset(0, 6))],
                ),
                child: Center(
                  child: Text(initials, style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w700, color: Colors.white)),
                ),
              ).animate().fadeIn(duration: 500.ms).scale(begin: const Offset(0.8, 0.8), end: const Offset(1, 1), duration: 500.ms),

              const SizedBox(height: 14),
              Text(
                name,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: AppColors.textStrong),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ).animate().fadeIn(delay: 100.ms, duration: 400.ms),
              const SizedBox(height: 4),
              Text(email, style: const TextStyle(fontSize: 13, color: AppColors.textMuted))
                  .animate().fadeIn(delay: 200.ms, duration: 400.ms),

              if (auth.isOfflineSession) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: AppColors.amber.withAlpha(20), borderRadius: BorderRadius.circular(6)),
                  child: const Text('Offline session', style: TextStyle(fontSize: 11, color: AppColors.amber, fontWeight: FontWeight.w500)),
                ),
              ],

              const SizedBox(height: 32),

              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Text('Profile Info', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textStrong)),
                        const Spacer(),
                        if (isOnline)
                          GestureDetector(
                            onTap: () {
                              if (_editing) {
                                _saveProfile();
                              } else {
                                setState(() => _editing = true);
                              }
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: _editing ? AppColors.green.withAlpha(20) : AppColors.surfaceElevated,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: _editing ? AppColors.green.withAlpha(60) : Colors.white.withAlpha(15)),
                              ),
                              child: _saving
                                  ? const SizedBox(width: 14, height: 14, child: ProgressRing(strokeWidth: 2))
                                  : Text(
                                      _editing ? 'Save' : 'Edit',
                                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: _editing ? AppColors.green : AppColors.text),
                                    ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    _profileField('Full Name', _editing ? null : name, controller: _editing ? _nameController : null, icon: FluentIcons.contact),
                    const SizedBox(height: 14),
                    _profileField('Email', email, icon: FluentIcons.mail),
                    const SizedBox(height: 14),
                    _profileField('Phone', _editing ? null : (phone.isNotEmpty ? phone : 'Not set'), controller: _editing ? _phoneController : null, icon: FluentIcons.phone),
                    if (_editing) ...[
                      const SizedBox(height: 16),
                      GestureDetector(
                        onTap: () {
                          setState(() => _editing = false);
                          _nameController.text = name;
                          _phoneController.text = phone;
                        },
                        child: const Text('Cancel', style: TextStyle(fontSize: 12, color: AppColors.textFaint)),
                      ),
                    ],
                  ],
                ),
              ).animate().fadeIn(delay: 300.ms, duration: 500.ms),

              const SizedBox(height: 20),

              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Account', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textStrong)),
                    const SizedBox(height: 16),
                    _actionTile('Sign Out', FluentIcons.sign_out, const Color(0xFFDC2626), () async {
                      await auth.logout();
                      if (mounted) AppToast.info(context, 'Signed out');
                    }),
                  ],
                ),
              ).animate().fadeIn(delay: 400.ms, duration: 500.ms),
            ],
          ),
        ),
      ),
    );
  }

  Widget _profileField(String label, String? value, {TextEditingController? controller, required IconData icon}) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppColors.textFaint),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textFaint, fontWeight: FontWeight.w500)),
              const SizedBox(height: 4),
              if (controller != null)
                TextBox(
                  controller: controller,
                  style: const TextStyle(color: AppColors.textStrong, fontSize: 14),
                  decoration: WidgetStateProperty.all(BoxDecoration(
                    color: AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.white.withAlpha(20)),
                  )),
                )
              else
                Text(value ?? '', style: const TextStyle(fontSize: 14, color: AppColors.text)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _actionTile(String label, IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: color.withAlpha(15),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withAlpha(30)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 10),
            Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: color)),
            const Spacer(),
            Icon(FluentIcons.chevron_right, size: 12, color: color.withAlpha(150)),
          ],
        ),
      ),
    );
  }
}
