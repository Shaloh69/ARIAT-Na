import 'dart:ui';
import 'package:fluent_ui/fluent_ui.dart';
import '../theme/app_theme.dart';

class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final double borderRadius;
  final double blur;
  final Color? borderColor;

  const GlassCard({
    super.key,
    required this.child,
    this.padding,
    this.borderRadius = 16,
    this.blur = 20,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: Container(
          padding: padding ?? const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: c.surfaceCard.withAlpha(c.isDark ? 200 : 230),
            borderRadius: BorderRadius.circular(borderRadius),
            border: Border.all(
              color: borderColor ?? c.borderMedium,
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}
