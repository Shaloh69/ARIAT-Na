import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:fluent_ui/fluent_ui.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../services/connectivity_service.dart';
import '../../services/theme_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/guest_wall.dart';
import '../../widgets/toast_overlay.dart';
import '../kiosk/kiosk_scan_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _editing = false;
  bool _saving = false;
  bool _uploadingPhoto = false;
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

  Future<void> _pickAndUploadPhoto() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (picked == null || !mounted) return;

    setState(() => _uploadingPhoto = true);
    try {
      final api = context.read<ApiService>();
      final auth = context.read<AuthService>();
      final uri = Uri.parse('${api.baseUrl}/upload/profile-image');
      final request = http.MultipartRequest('POST', uri)
        ..headers['Authorization'] = 'Bearer ${auth.accessToken ?? ""}'
        ..files.add(await http.MultipartFile.fromPath('file', picked.path));
      final streamed = await request.send().timeout(const Duration(seconds: 60));
      final body = jsonDecode(await streamed.stream.bytesToString()) as Map<String, dynamic>;
      if (!mounted) return;
      if (body['success'] == true) {
        final imageUrl = (body['data'] as Map<String, dynamic>?)?['url'] as String?
            ?? (body['data'] as Map<String, dynamic>?)?['publicUrl'] as String?;
        if (imageUrl != null) {
          await auth.updateProfile(profileImageUrl: imageUrl);
          if (mounted) AppToast.success(context, 'Profile photo updated!');
        }
      } else {
        AppToast.error(context, (body['message'] as String?) ?? 'Upload failed');
      }
    } catch (_) {
      if (mounted) AppToast.error(context, 'Photo upload failed');
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
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
    final c = context.appColors;
    final auth = context.watch<AuthService>();
    final isOnline = context.watch<ConnectivityService>().isOnline;
    final themeService = context.watch<ThemeService>();
    if (auth.isGuest) {
      return GradientBackground(
        child: SafeArea(
          child: GuestWallWidget(featureName: 'Profile'),
        ),
      );
    }

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
              GestureDetector(
                onTap: isOnline ? _pickAndUploadPhoto : null,
                child: Stack(
                  children: [
                    Container(
                      width: 90, height: 90,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [AppColors.red500, AppColors.purple],
                          begin: Alignment.topLeft, end: Alignment.bottomRight,
                        ),
                        boxShadow: [BoxShadow(color: AppColors.red500.withAlpha(60), blurRadius: 20, offset: const Offset(0, 6))],
                      ),
                      child: _uploadingPhoto
                          ? const Center(child: ProgressRing(strokeWidth: 3, activeColor: Colors.white))
                          : user['profile_image_url'] != null
                              ? ClipOval(
                                  child: CachedNetworkImage(
                                    imageUrl: user['profile_image_url'] as String,
                                    width: 90, height: 90, fit: BoxFit.cover,
                                    placeholder: (_, __) => Center(
                                        child: Text(initials,
                                            style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w700, color: Colors.white))),
                                    errorWidget: (_, __, ___) => Center(
                                        child: Text(initials,
                                            style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w700, color: Colors.white))),
                                  ),
                                )
                              : Center(
                                  child: Text(initials,
                                      style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w700, color: Colors.white)),
                                ),
                    ),
                    if (isOnline && !_uploadingPhoto)
                      Positioned(
                        bottom: 0, right: 0,
                        child: Container(
                          width: 26, height: 26,
                          decoration: BoxDecoration(
                            color: AppColors.red500,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2),
                          ),
                          child: const Icon(FluentIcons.camera, size: 12, color: Colors.white),
                        ),
                      ),
                  ],
                ),
              ).animate().fadeIn(duration: 500.ms).scale(begin: const Offset(0.8, 0.8), end: const Offset(1, 1), duration: 500.ms),

              SizedBox(height: 14),
              Text(name, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: c.textStrong))
                  .animate().fadeIn(delay: 100.ms, duration: 400.ms),
              SizedBox(height: 4),
              Text(email, style: TextStyle(fontSize: 13, color: c.textMuted))
                  .animate().fadeIn(delay: 200.ms, duration: 400.ms),

              if (auth.isOfflineSession) ...[
                SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: AppColors.amber.withAlpha(20), borderRadius: BorderRadius.circular(6)),
                  child: Text('Offline session', style: TextStyle(fontSize: 11, color: AppColors.amber, fontWeight: FontWeight.w500)),
                ),
              ],

              SizedBox(height: 32),

              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text('Profile Info', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.textStrong)),
                        Spacer(),
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
                                color: _editing ? AppColors.green.withAlpha(20) : c.surfaceElevated,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: _editing ? AppColors.green.withAlpha(60) : c.borderSubtle),
                              ),
                              child: _saving
                                  ? SizedBox(width: 14, height: 14, child: ProgressRing(strokeWidth: 2))
                                  : Text(
                                      _editing ? 'Save' : 'Edit',
                                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: _editing ? AppColors.green : c.text),
                                    ),
                            ),
                          ),
                      ],
                    ),
                    SizedBox(height: 20),
                    _profileField('Full Name', _editing ? null : name, controller: _editing ? _nameController : null, icon: FluentIcons.contact),
                    SizedBox(height: 14),
                    _profileField('Email', email, icon: FluentIcons.mail),
                    SizedBox(height: 14),
                    _profileField('Phone', _editing ? null : (phone.isNotEmpty ? phone : 'Not set'), controller: _editing ? _phoneController : null, icon: FluentIcons.phone),
                    if (_editing) ...[
                      SizedBox(height: 16),
                      GestureDetector(
                        onTap: () {
                          setState(() => _editing = false);
                          _nameController.text = name;
                          _phoneController.text = phone;
                        },
                        child: Text('Cancel', style: TextStyle(fontSize: 12, color: c.textFaint)),
                      ),
                    ],
                  ],
                ),
              ).animate().fadeIn(delay: 300.ms, duration: 500.ms),

              SizedBox(height: 20),

              // Appearance
              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Appearance', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.textStrong)),
                    SizedBox(height: 16),
                    Row(
                      children: [
                        Icon(
                          themeService.isDark ? FluentIcons.clear_night : FluentIcons.brightness,
                          size: 16, color: c.textMuted,
                        ),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            themeService.isDark ? 'Dark Mode' : 'Light Mode',
                            style: TextStyle(fontSize: 14, color: c.text),
                          ),
                        ),
                        ToggleSwitch(
                          checked: themeService.isDark,
                          onChanged: (_) => context.read<ThemeService>().toggleTheme(),
                        ),
                      ],
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 400.ms, duration: 500.ms),

              SizedBox(height: 20),

              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Kiosk', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.textStrong)),
                    SizedBox(height: 16),
                    _actionTile(
                      'Scan Kiosk QR',
                      FluentIcons.q_r_code,
                      AppColors.purple,
                      () => Navigator.push(
                        context,
                        FluentPageRoute(builder: (_) => const KioskScanScreen()),
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 500.ms, duration: 500.ms),

              SizedBox(height: 20),

              GlassCard(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Account', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.textStrong)),
                    SizedBox(height: 16),
                    if (isOnline) ...[
                      _actionTile('Change Password', FluentIcons.password_field, AppColors.blue, _changePassword),
                      SizedBox(height: 10),
                    ],
                    _actionTile('Sign Out', FluentIcons.sign_out, Color(0xFFDC2626), () async {
                      await auth.logout();
                      if (!context.mounted) return;
                      AppToast.info(context, 'Signed out');
                    }),
                  ],
                ),
              ).animate().fadeIn(delay: 600.ms, duration: 500.ms),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _changePassword() async {
    final currentCtrl = TextEditingController();
    final newCtrl     = TextEditingController();
    final confirmCtrl = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => ContentDialog(
        title: const Text('Change Password'),
        content: StatefulBuilder(
          builder: (ctx, setS) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Current Password', style: TextStyle(fontSize: 12, color: ctx.appColors.textMuted, fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              PasswordBox(controller: currentCtrl, placeholder: 'Current password'),
              const SizedBox(height: 14),
              Text('New Password', style: TextStyle(fontSize: 12, color: ctx.appColors.textMuted, fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              PasswordBox(controller: newCtrl, placeholder: 'Min. 8 characters'),
              const SizedBox(height: 14),
              Text('Confirm New Password', style: TextStyle(fontSize: 12, color: ctx.appColors.textMuted, fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              PasswordBox(controller: confirmCtrl, placeholder: 'Re-enter new password'),
            ],
          ),
        ),
        actions: [
          Button(child: const Text('Cancel'), onPressed: () => Navigator.pop(ctx, false)),
          FilledButton(
            style: ButtonStyle(backgroundColor: WidgetStateProperty.all(AppColors.blue)),
            child: const Text('Change'),
            onPressed: () => Navigator.pop(ctx, true),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    final current = currentCtrl.text;
    final newPass  = newCtrl.text;
    final confirm  = confirmCtrl.text;

    if (current.isEmpty || newPass.isEmpty) {
      AppToast.warning(context, 'Please fill in all fields');
      return;
    }
    if (newPass.length < 8) {
      AppToast.warning(context, 'New password must be at least 8 characters');
      return;
    }
    if (newPass != confirm) {
      AppToast.warning(context, 'Passwords do not match');
      return;
    }

    try {
      final api = context.read<ApiService>();
      final res = await api.post('/auth/user/change-password', body: {
        'current_password': current,
        'new_password': newPass,
      }, auth: true);
      if (!mounted) return;
      if (res['success'] == true) {
        AppToast.success(context, 'Password changed!');
      } else {
        AppToast.error(context, res['message'] ?? 'Change failed');
      }
    } catch (e) {
      if (mounted) AppToast.error(context, e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Widget _profileField(String label, String? value, {TextEditingController? controller, required IconData icon}) {
    final c = context.appColors;
    return Row(
      children: [
        Icon(icon, size: 16, color: c.textFaint),
        SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(fontSize: 11, color: c.textFaint, fontWeight: FontWeight.w500)),
              SizedBox(height: 4),
              if (controller != null)
                TextBox(
                  controller: controller,
                  style: TextStyle(color: c.textStrong, fontSize: 14),
                  decoration: WidgetStateProperty.all(BoxDecoration(
                    color: c.surfaceElevated,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: c.borderLight),
                  )),
                )
              else
                Text(value ?? '', style: TextStyle(fontSize: 14, color: c.text)),
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
            SizedBox(width: 10),
            Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: color)),
            Spacer(),
            Icon(FluentIcons.chevron_right, size: 12, color: color.withAlpha(150)),
          ],
        ),
      ),
    );
  }
}
