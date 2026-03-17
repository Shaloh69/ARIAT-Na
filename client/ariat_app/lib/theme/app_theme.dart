import 'package:fluent_ui/fluent_ui.dart';

/// Brand / accent colors — identical in dark and light mode.
class AppColors {
  // Brand Reds
  static const red50 = Color(0xFFFFF1F2);
  static const red100 = Color(0xFFFFE4E6);
  static const red200 = Color(0xFFFECDD3);
  static const red300 = Color(0xFFFDA4AF);
  static const red400 = Color(0xFFFB7185);
  static const red500 = Color(0xFFF43F5E); // Primary
  static const red600 = Color(0xFFE11D48);
  static const red700 = Color(0xFFBE123C);
  static const red800 = Color(0xFF9F1239);
  static const red900 = Color(0xFF881337);

  // Accents (same in both modes)
  static const blue = Color(0xFF2563EB);
  static const cyan = Color(0xFF0891B2);
  static const green = Color(0xFF16A34A);
  static const amber = Color(0xFFF59E0B);
  static const purple = Color(0xFF9333EA);

  // Gradient colors (same in both modes)
  static const gradientStart = Color(0xFFF43F5E);
  static const gradientMid = Color(0xFF9333EA);
  static const gradientEnd = Color(0xFF2563EB);
}

/// Adaptive surface / text / border colors that flip between dark and light.
@immutable
class AppColorScheme extends ThemeExtension<AppColorScheme> {
  final Color surface;
  final Color surfaceLight;
  final Color surfaceCard;
  final Color surfaceElevated;
  final Color textStrong;
  final Color text;
  final Color textMuted;
  final Color textFaint;
  // Border helpers — replace all the inline Colors.white.withAlpha(xx) calls
  final Color borderSubtle;  // ≈ withAlpha(15) in dark
  final Color borderLight;   // ≈ withAlpha(20) in dark
  final Color borderMedium;  // ≈ withAlpha(25) in dark
  final Color borderStrong;  // ≈ withAlpha(40) in dark
  // Background gradient stops
  final Color gradient0;
  final Color gradient1;
  final Color gradient2;
  final Color gradient3;
  // Decorative orb colors (with baked-in alpha)
  final Color orbRed;
  final Color orbPurple;
  final Color orbBlue;

  final bool isDark;

  const AppColorScheme({
    required this.surface,
    required this.surfaceLight,
    required this.surfaceCard,
    required this.surfaceElevated,
    required this.textStrong,
    required this.text,
    required this.textMuted,
    required this.textFaint,
    required this.borderSubtle,
    required this.borderLight,
    required this.borderMedium,
    required this.borderStrong,
    required this.gradient0,
    required this.gradient1,
    required this.gradient2,
    required this.gradient3,
    required this.orbRed,
    required this.orbPurple,
    required this.orbBlue,
    required this.isDark,
  });

  // ── Dark scheme ──────────────────────────────────────────────────────────────
  static const dark = AppColorScheme(
    surface: Color(0xFF0F172A),
    surfaceLight: Color(0xFF1E293B),
    surfaceCard: Color(0xFF1A2332),
    surfaceElevated: Color(0xFF243044),
    textStrong: Color(0xFFFFFFFF),
    text: Color(0xFFF1F5F9),
    textMuted: Color(0xFFCBD5E1),
    textFaint: Color(0xFF94A3B8),
    borderSubtle: Color(0x0FFFFFFF), // white ~6%
    borderLight: Color(0x14FFFFFF),  // white ~8%
    borderMedium: Color(0x19FFFFFF), // white ~10%
    borderStrong: Color(0x28FFFFFF), // white ~16%
    gradient0: Color(0xFF0F172A),
    gradient1: Color(0xFF1A1030),
    gradient2: Color(0xFF0F172A),
    gradient3: Color(0xFF0D1A2D),
    orbRed: Color(0x3CF43F5E),    // red500 alpha 60
    orbPurple: Color(0x289333EA), // purple alpha 40
    orbBlue: Color(0x232563EB),   // blue alpha 35
    isDark: true,
  );

  // ── Light scheme ─────────────────────────────────────────────────────────────
  static const light = AppColorScheme(
    surface: Color(0xFFF8FAFC),
    surfaceLight: Color(0xFFF1F5F9),
    surfaceCard: Color(0xFFFFFFFF),
    surfaceElevated: Color(0xFFE2E8F0),
    textStrong: Color(0xFF0F172A),
    text: Color(0xFF1E293B),
    textMuted: Color(0xFF64748B),
    textFaint: Color(0xFF94A3B8),
    borderSubtle: Color(0x10000000), // black ~6%
    borderLight: Color(0x16000000),  // black ~9%
    borderMedium: Color(0x1E000000), // black ~12%
    borderStrong: Color(0x30000000), // black ~19%
    gradient0: Color(0xFFFFFFFF),
    gradient1: Color(0xFFF0F9FF),
    gradient2: Color(0xFFF8FAFC),
    gradient3: Color(0xFFEFF6FF),
    orbRed: Color(0x14F43F5E),    // red500 alpha 20
    orbPurple: Color(0x0F9333EA), // purple alpha 15
    orbBlue: Color(0x0C2563EB),   // blue alpha 12
    isDark: false,
  );

  @override
  AppColorScheme copyWith({
    Color? surface,
    Color? surfaceLight,
    Color? surfaceCard,
    Color? surfaceElevated,
    Color? textStrong,
    Color? text,
    Color? textMuted,
    Color? textFaint,
    Color? borderSubtle,
    Color? borderLight,
    Color? borderMedium,
    Color? borderStrong,
    Color? gradient0,
    Color? gradient1,
    Color? gradient2,
    Color? gradient3,
    Color? orbRed,
    Color? orbPurple,
    Color? orbBlue,
    bool? isDark,
  }) {
    return AppColorScheme(
      surface: surface ?? this.surface,
      surfaceLight: surfaceLight ?? this.surfaceLight,
      surfaceCard: surfaceCard ?? this.surfaceCard,
      surfaceElevated: surfaceElevated ?? this.surfaceElevated,
      textStrong: textStrong ?? this.textStrong,
      text: text ?? this.text,
      textMuted: textMuted ?? this.textMuted,
      textFaint: textFaint ?? this.textFaint,
      borderSubtle: borderSubtle ?? this.borderSubtle,
      borderLight: borderLight ?? this.borderLight,
      borderMedium: borderMedium ?? this.borderMedium,
      borderStrong: borderStrong ?? this.borderStrong,
      gradient0: gradient0 ?? this.gradient0,
      gradient1: gradient1 ?? this.gradient1,
      gradient2: gradient2 ?? this.gradient2,
      gradient3: gradient3 ?? this.gradient3,
      orbRed: orbRed ?? this.orbRed,
      orbPurple: orbPurple ?? this.orbPurple,
      orbBlue: orbBlue ?? this.orbBlue,
      isDark: isDark ?? this.isDark,
    );
  }

  @override
  ThemeExtension<AppColorScheme> lerp(
      ThemeExtension<AppColorScheme>? other, double t) {
    if (other is! AppColorScheme) return this;
    return t < 0.5 ? this : other;
  }
}

/// Convenience getter — use `context.appColors.xxx` anywhere in widget tree.
extension AppColorsX on BuildContext {
  AppColorScheme get appColors =>
      FluentTheme.of(this).extension<AppColorScheme>()!;
}

// ── Theme builders ────────────────────────────────────────────────────────────

FluentThemeData buildAppTheme() => _buildTheme(AppColorScheme.dark);

FluentThemeData buildLightTheme() => _buildTheme(AppColorScheme.light);

FluentThemeData _buildTheme(AppColorScheme scheme) {
  return FluentThemeData(
    brightness: scheme.isDark ? Brightness.dark : Brightness.light,
    accentColor: AccentColor.swatch({
      'darkest': AppColors.red900,
      'darker': AppColors.red800,
      'dark': AppColors.red700,
      'normal': AppColors.red500,
      'light': AppColors.red400,
      'lighter': AppColors.red300,
      'lightest': AppColors.red200,
    }),
    scaffoldBackgroundColor: scheme.surface,
    cardColor: scheme.surfaceCard,
    micaBackgroundColor: scheme.surface,
    typography: Typography.raw(
      display: TextStyle(fontSize: 68, fontWeight: FontWeight.w600, color: scheme.textStrong),
      titleLarge: TextStyle(fontSize: 40, fontWeight: FontWeight.w600, color: scheme.textStrong),
      title: TextStyle(fontSize: 28, fontWeight: FontWeight.w600, color: scheme.textStrong),
      subtitle: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: scheme.textStrong),
      bodyLarge: TextStyle(fontSize: 18, fontWeight: FontWeight.w400, color: scheme.text),
      bodyStrong: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: scheme.textStrong),
      body: TextStyle(fontSize: 14, fontWeight: FontWeight.w400, color: scheme.text),
      caption: TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: scheme.textMuted),
    ),
    extensions: [scheme],
  );
}
