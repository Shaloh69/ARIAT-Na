import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter/services.dart' show TextCapitalization;
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../services/auth_service.dart';
import '../../services/connectivity_service.dart';
import '../app_shell.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';
import 'register_screen.dart';
import 'forgot_password_screen.dart';

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
      final auth = context.read<AuthService>();
      final guestId = auth.isGuest ? (auth.user?['id'] as String?) : null;
      final isOnline = context.read<ConnectivityService>().isOnline;
      await auth.login(email, password, isOnline: isOnline);
      if (guestId != null) await auth.migrateGuestAccount(guestId);
      if (mounted) {
        if (!isOnline) {
          AppToast.info(context, 'Signed in offline with cached credentials');
        } else {
          AppToast.success(context, 'Welcome back!');
        }
        Navigator.of(context).pushAndRemoveUntil(
          FluentPageRoute(builder: (_) => const AppShell()),
          (route) => false,
        );
      }
    } catch (e) {
      if (mounted) AppToast.error(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showGuestCodeDialog() {
    final codeController = TextEditingController();
    final c = context.appColors;

    showDialog<void>(
      context: context,
      builder: (ctx) => ContentDialog(
        title: const Text('Continue as Guest'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.blue.withAlpha(20),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.blue.withAlpha(45)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Where to find your guest code:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.blue)),
                  const SizedBox(height: 6),
                  Text('① Go to the AIRAT-NA kiosk terminal', style: TextStyle(fontSize: 12, color: c.textMuted)),
                  const SizedBox(height: 2),
                  Text('② Tap "Continue as Guest" on the kiosk', style: TextStyle(fontSize: 12, color: c.textMuted)),
                  const SizedBox(height: 2),
                  Text('③ Scan the QR code displayed on screen', style: TextStyle(fontSize: 12, color: c.textMuted)),
                  const SizedBox(height: 2),
                  Text('④ Your 8-character code appears on the page that opens', style: TextStyle(fontSize: 12, color: c.textMuted)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Text('Guest Code', style: TextStyle(fontSize: 12, color: c.textMuted, fontWeight: FontWeight.w500)),
            const SizedBox(height: 6),
            TextBox(
              controller: codeController,
              placeholder: 'e.g. APEY9X6U',
              style: TextStyle(
                color: c.textStrong,
                fontFamily: 'monospace',
                fontSize: 18,
                letterSpacing: 3,
              ),
              textCapitalization: TextCapitalization.characters,
              decoration: WidgetStateProperty.all(BoxDecoration(
                color: c.surfaceElevated,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: c.borderMedium),
              )),
            ),
            const SizedBox(height: 6),
            Text('Guest codes are valid for 24 hours.', style: TextStyle(fontSize: 11, color: c.textFaint)),
          ],
        ),
        actions: [
          Button(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: ButtonStyle(
              backgroundColor: WidgetStateProperty.resolveWith((states) {
                if (states.contains(WidgetState.disabled)) return AppColors.red800;
                return AppColors.red500;
              }),
            ),
            onPressed: () {
              final code = codeController.text.trim().toUpperCase();
              Navigator.pop(ctx);
              if (code.isEmpty) {
                AppToast.warning(context, 'Please enter your guest code');
                return;
              }
              _loginWithGuestCode(code);
            },
            child: const Text('Continue'),
          ),
        ],
      ),
    );
  }

  Future<void> _loginWithGuestCode(String code) async {
    setState(() => _loading = true);
    try {
      await context.read<AuthService>().loginWithGuestCode(code);
      if (mounted) {
        Navigator.of(context).pushAndRemoveUntil(
          FluentPageRoute(builder: (_) => const AppShell()),
          (route) => false,
        );
      }
    } catch (e) {
      if (mounted) AppToast.error(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
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
                Text(
                  'AIRAT-NA',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: c.textStrong, letterSpacing: 2),
                ).animate().fadeIn(delay: 200.ms, duration: 500.ms),
                const SizedBox(height: 4),
                Text(
                  'Tourist Navigation',
                  style: TextStyle(fontSize: 14, color: c.textMuted),
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
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(FluentIcons.cloud_not_synced, size: 14, color: AppColors.amber),
                        const SizedBox(width: 8),
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
                      Text('Sign In', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: c.textStrong)),
                      const SizedBox(height: 4),
                      Text('Sign in with your registered email and password to access your trips.', style: TextStyle(fontSize: 13, color: c.textMuted)),
                      const SizedBox(height: 24),

                      Text('Email', style: TextStyle(fontSize: 12, color: c.textMuted, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 6),
                      TextBox(
                        controller: _emailController,
                        placeholder: 'you@example.com',
                        keyboardType: TextInputType.emailAddress,
                        style: TextStyle(color: c.textStrong),
                        decoration: WidgetStateProperty.all(BoxDecoration(
                          color: c.surfaceElevated,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: c.borderMedium),
                        )),
                      ),
                      const SizedBox(height: 16),

                      Text('Password', style: TextStyle(fontSize: 12, color: c.textMuted, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 6),
                      PasswordBox(
                        controller: _passwordController,
                        placeholder: 'Enter your password',
                        revealMode: _obscurePassword ? PasswordRevealMode.hidden : PasswordRevealMode.visible,
                        style: TextStyle(color: c.textStrong),
                        decoration: WidgetStateProperty.all(BoxDecoration(
                          color: c.surfaceElevated,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: c.borderMedium),
                        )),
                        onSubmitted: (_) => _login(),
                      ),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerRight,
                        child: HyperlinkButton(
                          onPressed: isOnline
                              ? () => Navigator.of(context).push(
                                    FluentPageRoute(builder: (_) => const ForgotPasswordScreen()),
                                  )
                              : null,
                          child: Text(
                            'Forgot password?',
                            style: TextStyle(
                              fontSize: 12,
                              color: isOnline ? AppColors.red400 : c.textFaint,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

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

                      const SizedBox(height: 12),

                      // Divider
                      Row(
                        children: [
                          Expanded(child: Divider(style: DividerThemeData(thickness: 1, decoration: BoxDecoration(color: c.borderLight)))),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Text('or', style: TextStyle(fontSize: 12, color: c.textFaint)),
                          ),
                          Expanded(child: Divider(style: DividerThemeData(thickness: 1, decoration: BoxDecoration(color: c.borderLight)))),
                        ],
                      ),

                      const SizedBox(height: 12),

                      // Continue as Guest
                      SizedBox(
                        width: double.infinity,
                        child: Button(
                          onPressed: _loading ? null : _showGuestCodeDialog,
                          style: ButtonStyle(
                            shape: WidgetStateProperty.all(RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                            padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 14)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(FluentIcons.temporary_user, size: 16, color: c.textMuted),
                              const SizedBox(width: 8),
                              Text(
                                'Continue as Guest',
                                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.textMuted),
                              ),
                            ],
                          ),
                        ),
                      ),

                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: AppColors.blue.withAlpha(18),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppColors.blue.withAlpha(40)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('How to get a guest code:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.blue)),
                            const SizedBox(height: 5),
                            Text('① Visit the AIRAT-NA kiosk terminal', style: TextStyle(fontSize: 11, color: c.textMuted)),
                            Text('② Tap "Continue as Guest" on the kiosk', style: TextStyle(fontSize: 11, color: c.textMuted)),
                            Text('③ Scan the QR code shown on the kiosk', style: TextStyle(fontSize: 11, color: c.textMuted)),
                            Text('④ Enter the code from the page that opens', style: TextStyle(fontSize: 11, color: c.textMuted)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ).animate().fadeIn(delay: 400.ms, duration: 600.ms).slideY(begin: 0.1, end: 0, duration: 600.ms),

                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text("Don't have an account? ", style: TextStyle(color: c.textMuted, fontSize: 13)),
                    HyperlinkButton(
                      onPressed: isOnline
                          ? () => Navigator.of(context).push(FluentPageRoute(builder: (_) => const RegisterScreen()))
                          : () => AppToast.warning(context, 'Registration requires internet'),
                      child: Text(
                        'Sign Up',
                        style: TextStyle(
                          color: isOnline ? AppColors.red400 : c.textFaint,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ).animate().fadeIn(delay: 600.ms, duration: 500.ms),

                const SizedBox(height: 6),
                Text(
                  'Create an account to save trips and itineraries permanently.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11, color: c.textFaint),
                ).animate().fadeIn(delay: 700.ms, duration: 500.ms),

                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
