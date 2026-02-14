import 'package:fluent_ui/fluent_ui.dart';

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

  // Dark surfaces
  static const surface = Color(0xFF0F172A);
  static const surfaceLight = Color(0xFF1E293B);
  static const surfaceCard = Color(0xFF1A2332);
  static const surfaceElevated = Color(0xFF243044);

  // Text
  static const textStrong = Color(0xFFFFFFFF);
  static const text = Color(0xFFF1F5F9);
  static const textMuted = Color(0xFFCBD5E1);
  static const textFaint = Color(0xFF94A3B8);

  // Accents
  static const blue = Color(0xFF2563EB);
  static const cyan = Color(0xFF0891B2);
  static const green = Color(0xFF16A34A);
  static const amber = Color(0xFFF59E0B);
  static const purple = Color(0xFF9333EA);

  // Gradient colors
  static const gradientStart = Color(0xFFF43F5E);
  static const gradientMid = Color(0xFF9333EA);
  static const gradientEnd = Color(0xFF2563EB);
}

FluentThemeData buildAppTheme() {
  return FluentThemeData(
    brightness: Brightness.dark,
    accentColor: AccentColor.swatch({
      'darkest': AppColors.red900,
      'darker': AppColors.red800,
      'dark': AppColors.red700,
      'normal': AppColors.red500,
      'light': AppColors.red400,
      'lighter': AppColors.red300,
      'lightest': AppColors.red200,
    }),
    scaffoldBackgroundColor: AppColors.surface,
    cardColor: AppColors.surfaceCard,
    micaBackgroundColor: AppColors.surface,
    typography: Typography.raw(
      display: const TextStyle(fontSize: 68, fontWeight: FontWeight.w600, color: AppColors.textStrong),
      titleLarge: const TextStyle(fontSize: 40, fontWeight: FontWeight.w600, color: AppColors.textStrong),
      title: const TextStyle(fontSize: 28, fontWeight: FontWeight.w600, color: AppColors.textStrong),
      subtitle: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: AppColors.textStrong),
      bodyLarge: const TextStyle(fontSize: 18, fontWeight: FontWeight.w400, color: AppColors.text),
      bodyStrong: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textStrong),
      body: const TextStyle(fontSize: 14, fontWeight: FontWeight.w400, color: AppColors.text),
      caption: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: AppColors.textMuted),
    ),
  );
}
