import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_theme.dart';
import 'gradient_background.dart';

class LoadingScreen extends StatelessWidget {
  final String? message;
  const LoadingScreen({super.key, this.message});

  @override
  Widget build(BuildContext context) {
    return GradientBackground(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 80,
              height: 80,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Image.asset('assets/logo.png', width: 48, height: 48)
                      .animate(onPlay: (c) => c.repeat())
                      .fade(duration: 1200.ms, begin: 0.6, end: 1.0)
                      .then()
                      .fade(duration: 1200.ms, begin: 1.0, end: 0.6),
                  SizedBox(
                    width: 72,
                    height: 72,
                    child: const ProgressRing(strokeWidth: 3),
                  ),
                ],
              ),
            ),
            if (message != null) ...[
              const SizedBox(height: 20),
              Text(
                message!,
                style: const TextStyle(color: AppColors.textMuted, fontSize: 14),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
