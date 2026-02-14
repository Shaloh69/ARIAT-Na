import 'package:fluent_ui/fluent_ui.dart';
import '../theme/app_theme.dart';

class GradientBackground extends StatelessWidget {
  final Widget child;
  const GradientBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF0F172A),
            Color(0xFF1A1030),
            Color(0xFF0F172A),
            Color(0xFF0D1A2D),
          ],
          stops: [0.0, 0.3, 0.7, 1.0],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: -80, left: -60,
            child: Container(
              width: 300, height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [AppColors.red500.withAlpha(60), Colors.transparent]),
              ),
            ),
          ),
          Positioned(
            bottom: -50, right: -40,
            child: Container(
              width: 250, height: 250,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [AppColors.purple.withAlpha(40), Colors.transparent]),
              ),
            ),
          ),
          Positioned(
            top: 200, right: -30,
            child: Container(
              width: 200, height: 200,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [AppColors.blue.withAlpha(35), Colors.transparent]),
              ),
            ),
          ),
          child,
        ],
      ),
    );
  }
}
