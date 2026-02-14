import 'package:fluent_ui/fluent_ui.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../services/auth_service.dart';
import '../../services/connectivity_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  final bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || password.isEmpty) {
      AppToast.warning(context, 'Please enter email and password');
      return;
    }
    setState(() => _loading = true);
    try {
      final isOnline = context.read<ConnectivityService>().isOnline;
      await context.read<AuthService>().login(email, password, isOnline: isOnline);
      if (mounted) {
        if (!isOnline) {
          AppToast.info(context, 'Signed in offline with cached credentials');
        } else {
          AppToast.success(context, 'Welcome back!');
        }
      }
    } catch (e) {
      if (mounted) AppToast.error(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOnline = context.watch<ConnectivityService>().isOnline;

    return GradientBackground(
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Logo
                Image.asset('assets/logo.png', width: 80, height: 80)
                    .animate()
                    .fadeIn(duration: 600.ms)
                    .scale(begin: const Offset(0.8, 0.8), end: const Offset(1, 1), duration: 600.ms, curve: Curves.easeOut),
                const SizedBox(height: 12),
                const Text(
                  'AIRAT-NA',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: AppColors.textStrong, letterSpacing: 2),
                ).animate().fadeIn(delay: 200.ms, duration: 500.ms),
                const SizedBox(height: 4),
                const Text(
                  'Tourist Navigation',
                  style: TextStyle(fontSize: 14, color: AppColors.textMuted),
                ).animate().fadeIn(delay: 300.ms, duration: 500.ms),

                // Offline indicator
                if (!isOnline) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.amber.withAlpha(30),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.amber.withAlpha(60)),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(FluentIcons.cloud_not_synced, size: 14, color: AppColors.amber),
                        SizedBox(width: 8),
                        Text('Offline — cached login only', style: TextStyle(fontSize: 12, color: AppColors.amber, fontWeight: FontWeight.w500)),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 40),

                // Login card
                GlassCard(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Sign In', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: AppColors.textStrong)),
                      const SizedBox(height: 4),
                      const Text('Welcome back, explorer', style: TextStyle(fontSize: 13, color: AppColors.textMuted)),
                      const SizedBox(height: 24),

                      const Text('Email', style: TextStyle(fontSize: 12, color: AppColors.textMuted, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 6),
                      TextBox(
                        controller: _emailController,
                        placeholder: 'you@example.com',
                        keyboardType: TextInputType.emailAddress,
                        style: const TextStyle(color: AppColors.textStrong),
                        decoration: WidgetStateProperty.all(BoxDecoration(
                          color: AppColors.surfaceElevated,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.white.withAlpha(25)),
                        )),
                      ),
                      const SizedBox(height: 16),

                      const Text('Password', style: TextStyle(fontSize: 12, color: AppColors.textMuted, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 6),
                      PasswordBox(
                        controller: _passwordController,
                        placeholder: 'Enter your password',
                        revealMode: _obscurePassword ? PasswordRevealMode.hidden : PasswordRevealMode.visible,
                        style: const TextStyle(color: AppColors.textStrong),
                        decoration: WidgetStateProperty.all(BoxDecoration(
                          color: AppColors.surfaceElevated,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.white.withAlpha(25)),
                        )),
                        onSubmitted: (_) => _login(),
                      ),
                      const SizedBox(height: 24),

                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: _loading ? null : _login,
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
                              : const Text('Sign In', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                        ),
                      ),
                    ],
                  ),
                ).animate().fadeIn(delay: 400.ms, duration: 600.ms).slideY(begin: 0.1, end: 0, duration: 600.ms),

                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text("Don't have an account? ", style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                    HyperlinkButton(
                      onPressed: isOnline
                          ? () => Navigator.of(context).push(FluentPageRoute(builder: (_) => const RegisterScreen()))
                          : () => AppToast.warning(context, 'Registration requires internet'),
                      child: Text(
                        'Sign Up',
                        style: TextStyle(
                          color: isOnline ? AppColors.red400 : AppColors.textFaint,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ).animate().fadeIn(delay: 600.ms, duration: 500.ms),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
