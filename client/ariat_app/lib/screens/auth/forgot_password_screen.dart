import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  final _newPassCtrl = TextEditingController();
  final _confirmPassCtrl = TextEditingController();

  bool _codeSent = false;
  bool _loading = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _codeCtrl.dispose();
    _newPassCtrl.dispose();
    _confirmPassCtrl.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) {
      AppToast.warning(context, 'Please enter your email');
      return;
    }
    setState(() => _loading = true);
    try {
      final api = context.read<ApiService>();
      final res = await api.post('/auth/user/forgot-password', body: {'email': email});
      if (!mounted) return;
      if (res['success'] == true) {
        setState(() => _codeSent = true);
        AppToast.success(context, 'Reset code sent — check your email');
      } else {
        AppToast.error(context, res['message'] ?? 'Request failed');
      }
    } catch (_) {
      if (mounted) AppToast.error(context, 'Could not send reset code');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resetPassword() async {
    final code = _codeCtrl.text.trim();
    final newPass = _newPassCtrl.text;
    final confirm = _confirmPassCtrl.text;

    if (code.isEmpty || newPass.isEmpty) {
      AppToast.warning(context, 'Please fill in all fields');
      return;
    }
    if (newPass.length < 8) {
      AppToast.warning(context, 'Password must be at least 8 characters');
      return;
    }
    if (newPass != confirm) {
      AppToast.warning(context, 'Passwords do not match');
      return;
    }

    setState(() => _loading = true);
    try {
      final api = context.read<ApiService>();
      final res = await api.post('/auth/user/reset-password', body: {
        'email': _emailCtrl.text.trim(),
        'code': code,
        'new_password': newPass,
      });
      if (!mounted) return;
      if (res['success'] == true) {
        AppToast.success(context, 'Password reset! Please sign in.');
        Navigator.of(context).pop();
      } else {
        AppToast.error(context, res['message'] ?? 'Reset failed');
      }
    } catch (_) {
      if (mounted) AppToast.error(context, 'Could not reset password');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;

    return GradientBackground(
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconButton(
                icon: Icon(FluentIcons.back, color: c.textStrong, size: 20),
                onPressed: () => Navigator.of(context).pop(),
              ),
              const SizedBox(height: 24),

              Text('Reset Password',
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: c.textStrong))
                  .animate().fadeIn(duration: 400.ms),
              const SizedBox(height: 6),
              Text(_codeSent
                  ? 'Enter the 6-digit code sent to your email'
                  : 'Enter your email to receive a reset code',
                  style: TextStyle(fontSize: 14, color: c.textMuted))
                  .animate().fadeIn(delay: 100.ms, duration: 400.ms),

              const SizedBox(height: 32),

              GlassCard(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Step 1 — email
                    Text('Email', style: TextStyle(fontSize: 12, color: c.textMuted, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 6),
                    TextBox(
                      controller: _emailCtrl,
                      placeholder: 'you@example.com',
                      keyboardType: TextInputType.emailAddress,
                      enabled: !_codeSent,
                      style: TextStyle(color: c.textStrong),
                      decoration: WidgetStateProperty.all(BoxDecoration(
                        color: c.surfaceElevated,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: c.borderMedium),
                      )),
                    ),

                    if (!_codeSent) ...[
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: _loading ? null : _requestCode,
                          style: ButtonStyle(
                            backgroundColor: WidgetStateProperty.resolveWith((s) =>
                                s.contains(WidgetState.disabled) ? AppColors.red800 : AppColors.red500),
                            shape: WidgetStateProperty.all(
                                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                            padding: WidgetStateProperty.all(
                                const EdgeInsets.symmetric(vertical: 14)),
                          ),
                          child: _loading
                              ? const SizedBox(width: 18, height: 18, child: ProgressRing(strokeWidth: 2))
                              : const Text('Send Reset Code',
                                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                        ),
                      ),
                    ],

                    // Step 2 — code + new password
                    if (_codeSent) ...[
                      const SizedBox(height: 20),
                      Text('6-Digit Code', style: TextStyle(fontSize: 12, color: c.textMuted, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 6),
                      TextBox(
                        controller: _codeCtrl,
                        placeholder: '123456',
                        keyboardType: TextInputType.number,
                        style: TextStyle(color: c.textStrong),
                        decoration: WidgetStateProperty.all(BoxDecoration(
                          color: c.surfaceElevated,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: c.borderMedium),
                        )),
                      ),
                      const SizedBox(height: 16),
                      Text('New Password', style: TextStyle(fontSize: 12, color: c.textMuted, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 6),
                      PasswordBox(
                        controller: _newPassCtrl,
                        placeholder: 'Min. 8 characters',
                        style: TextStyle(color: c.textStrong),
                        decoration: WidgetStateProperty.all(BoxDecoration(
                          color: c.surfaceElevated,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: c.borderMedium),
                        )),
                      ),
                      const SizedBox(height: 16),
                      Text('Confirm Password', style: TextStyle(fontSize: 12, color: c.textMuted, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 6),
                      PasswordBox(
                        controller: _confirmPassCtrl,
                        placeholder: 'Re-enter password',
                        style: TextStyle(color: c.textStrong),
                        decoration: WidgetStateProperty.all(BoxDecoration(
                          color: c.surfaceElevated,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: c.borderMedium),
                        )),
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: _loading ? null : _resetPassword,
                          style: ButtonStyle(
                            backgroundColor: WidgetStateProperty.resolveWith((s) =>
                                s.contains(WidgetState.disabled) ? AppColors.red800 : AppColors.red500),
                            shape: WidgetStateProperty.all(
                                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                            padding: WidgetStateProperty.all(
                                const EdgeInsets.symmetric(vertical: 14)),
                          ),
                          child: _loading
                              ? const SizedBox(width: 18, height: 18, child: ProgressRing(strokeWidth: 2))
                              : const Text('Reset Password',
                                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Center(
                        child: HyperlinkButton(
                          onPressed: _loading ? null : () {
                            setState(() { _codeSent = false; _codeCtrl.clear(); });
                          },
                          child: Text('Resend code', style: TextStyle(fontSize: 12, color: c.textFaint)),
                        ),
                      ),
                    ],
                  ],
                ),
              ).animate().fadeIn(delay: 200.ms, duration: 500.ms).slideY(begin: 0.05, end: 0, duration: 500.ms),
            ],
          ),
        ),
      ),
    );
  }
}
