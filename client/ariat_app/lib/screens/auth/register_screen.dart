import 'package:fluent_ui/fluent_ui.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../services/auth_service.dart';
import '../../services/connectivity_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/responsive_utils.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    final isOnline = context.read<ConnectivityService>().isOnline;
    if (!isOnline) {
      AppToast.error(context, 'Registration requires an internet connection');
      return;
    }

    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final phone = _phoneController.text.trim();
    final password = _passwordController.text;
    final confirm = _confirmController.text;

    if (name.isEmpty || email.isEmpty || password.isEmpty) {
      AppToast.warning(context, 'Please fill in all required fields');
      return;
    }
    if (password.length < 6) {
      AppToast.warning(context, 'Password must be at least 6 characters');
      return;
    }
    if (password != confirm) {
      AppToast.error(context, 'Passwords do not match');
      return;
    }

    setState(() => _loading = true);
    try {
      await context.read<AuthService>().register(name, email, password, phone: phone);
      if (mounted) {
        AppToast.success(context, 'Account created successfully!');
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) AppToast.error(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _buildField(String label, TextEditingController controller, {
    String? placeholder,
    TextInputType? keyboardType,
    bool isPassword = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textMuted, fontWeight: FontWeight.w500)),
        const SizedBox(height: 6),
        if (isPassword)
          PasswordBox(
            controller: controller,
            placeholder: placeholder ?? '',
            style: const TextStyle(color: AppColors.textStrong),
            decoration: WidgetStateProperty.all(BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.white.withAlpha(25)),
            )),
          )
        else
          TextBox(
            controller: controller,
            placeholder: placeholder ?? '',
            keyboardType: keyboardType,
            style: const TextStyle(color: AppColors.textStrong),
            decoration: WidgetStateProperty.all(BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.white.withAlpha(25)),
            )),
          ),
        const SizedBox(height: 14),
      ],
    );
  }

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
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: EdgeInsets.symmetric(
                  horizontal: ResponsiveUtils.responsivePadding(
                    context,
                    small: 16,
                    medium: 20,
                    large: 24,
                  ),
                ),
                child: Column(
                  children: [
                    Image.asset('assets/logo.png', width: 56, height: 56)
                        .animate().fadeIn(duration: 500.ms),
                    const SizedBox(height: 8),
                    Text(
                      'AIRAT-NA',
                      style: TextStyle(
                        fontSize: ResponsiveUtils.responsiveFontSize(
                          context,
                          small: 18,
                          medium: 22,
                          large: 24,
                        ),
                        fontWeight: FontWeight.w700,
                        color: AppColors.textStrong,
                        letterSpacing: 2,
                      ),
                    ).animate().fadeIn(delay: 100.ms, duration: 500.ms),
                    const SizedBox(height: 28),
                    GlassCard(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Create Account', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: AppColors.textStrong)),
                          const SizedBox(height: 4),
                          const Text('Join AIRAT-NA and explore!', style: TextStyle(fontSize: 13, color: AppColors.textMuted)),
                          const SizedBox(height: 24),
                          _buildField('Full Name *', _nameController, placeholder: 'John Doe'),
                          _buildField('Email *', _emailController, placeholder: 'you@example.com', keyboardType: TextInputType.emailAddress),
                          _buildField('Phone Number', _phoneController, placeholder: '+63 XXX XXX XXXX', keyboardType: TextInputType.phone),
                          _buildField('Password *', _passwordController, placeholder: 'Min 6 characters', isPassword: true),
                          _buildField('Confirm Password *', _confirmController, placeholder: 'Re-enter password', isPassword: true),
                          const SizedBox(height: 8),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(
                              onPressed: _loading ? null : _register,
                              style: ButtonStyle(
                                backgroundColor: WidgetStateProperty.resolveWith((states) {
                                  if (states.contains(WidgetState.disabled)) return AppColors.red800;
                                  return AppColors.red500;
                                }),
                                shape: WidgetStateProperty.all(RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                                padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 14)),
                              ),
                              child: _loading
                                  ? const SizedBox(width: 18, height: 18, child: ProgressRing(strokeWidth: 2))
                                  : const Text('Create Account', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                            ),
                          ),
                        ],
                      ),
                    ).animate().fadeIn(delay: 200.ms, duration: 600.ms).slideY(begin: 0.1, end: 0, duration: 600.ms),
                    const SizedBox(height: 30),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
