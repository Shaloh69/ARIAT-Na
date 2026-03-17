import 'package:fluent_ui/fluent_ui.dart';
import '../theme/app_theme.dart';

class GradientBackground extends StatelessWidget {
  final Widget child;
  const GradientBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [c.gradient0, c.gradient1, c.gradient2, c.gradient3],
          stops: const [0.0, 0.3, 0.7, 1.0],
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
                gradient: RadialGradient(colors: [c.orbRed, Colors.transparent]),
              ),
            ),
          ),
          Positioned(
            bottom: -50, right: -40,
            child: Container(
              width: 250, height: 250,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [c.orbPurple, Colors.transparent]),
              ),
            ),
          ),
          Positioned(
            top: 200, right: -30,
            child: Container(
              width: 200, height: 200,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [c.orbBlue, Colors.transparent]),
              ),
            ),
          ),
          child,
        ],
      ),
    );
  }
}
