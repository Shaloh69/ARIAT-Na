import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter/material.dart' show showModalBottomSheet;
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';

/// Shows a bottom sheet telling the guest they need a real account for this feature.
/// Returns true if the user subsequently logs in, false otherwise.
Future<bool> showGuestWall(BuildContext context, {String? featureName}) async {
  final auth = context.read<AuthService>();
  if (!auth.isGuest) return true; // not a guest — allow through

  await showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _GuestWallSheet(featureName: featureName),
  );

  // After dismissal, check if the user logged in
  if (!context.mounted) return false;
  return !context.read<AuthService>().isGuest;
}

class _GuestWallSheet extends StatelessWidget {
  final String? featureName;
  const _GuestWallSheet({this.featureName});

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return Container(
      margin: const EdgeInsets.all(16),
      padding: EdgeInsets.fromLTRB(
        24, 24, 24, MediaQuery.of(context).padding.bottom + 24,
      ),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: c.borderLight),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(
              color: AppColors.red500.withAlpha(20),
              shape: BoxShape.circle,
            ),
            child: const Center(
              child: Text('🔒', style: TextStyle(fontSize: 26)),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            featureName != null
                ? '$featureName requires an account'
                : 'Please Log in or Register',
            style: TextStyle(
              fontSize: 18, fontWeight: FontWeight.w700, color: c.textStrong,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'To have full access to AIRAT-NA — saving trips, viewing history, and more — '
            'please log in or create a free account.',
            style: TextStyle(fontSize: 13, color: c.textMuted),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  FluentPageRoute(builder: (_) => const LoginScreen()),
                );
              },
              style: ButtonStyle(
                backgroundColor: WidgetStateProperty.all(AppColors.red500),
                shape: WidgetStateProperty.all(
                  RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                padding: WidgetStateProperty.all(
                  const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
              child: const Text(
                'Log In',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colors.white),
              ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: Button(
              onPressed: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  FluentPageRoute(builder: (_) => RegisterScreen()),
                );
              },
              style: ButtonStyle(
                shape: WidgetStateProperty.all(
                  RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                padding: WidgetStateProperty.all(
                  const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
              child: Text(
                'Create Account',
                style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: c.text,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          HyperlinkButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Maybe Later',
              style: TextStyle(fontSize: 13, color: c.textFaint),
            ),
          ),
        ],
      ),
    );
  }
}
