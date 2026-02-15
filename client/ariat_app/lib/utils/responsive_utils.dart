import 'package:fluent_ui/fluent_ui.dart';

class ResponsiveUtils {
  static bool isSmallScreen(BuildContext context) {
    return MediaQuery.of(context).size.width < 360;
  }

  static bool isMediumScreen(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    return width >= 360 && width < 430;
  }

  static bool isLargeScreen(BuildContext context) {
    return MediaQuery.of(context).size.width >= 430;
  }

  static bool isShortScreen(BuildContext context) {
    return MediaQuery.of(context).size.height < 600;
  }

  static double responsiveFontSize(BuildContext context, {
    required double small,
    required double medium,
    required double large,
  }) {
    if (isSmallScreen(context)) return small;
    if (isMediumScreen(context)) return medium;
    return large;
  }

  static double responsivePadding(BuildContext context, {
    required double small,
    required double medium,
    required double large,
  }) {
    if (isSmallScreen(context)) return small;
    if (isMediumScreen(context)) return medium;
    return large;
  }

  static double screenWidth(BuildContext context) {
    return MediaQuery.of(context).size.width;
  }

  static double screenHeight(BuildContext context) {
    return MediaQuery.of(context).size.height;
  }
}
