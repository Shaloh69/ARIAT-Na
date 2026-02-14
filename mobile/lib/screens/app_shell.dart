import 'package:fluent_ui/fluent_ui.dart';
import '../theme/app_theme.dart';
import 'home/home_screen.dart';
import 'destinations/destinations_screen.dart';
import 'map/map_screen.dart';
import 'profile/profile_screen.dart';
import 'settings/settings_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});
  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _selectedIndex = 0;

  final _pages = const <Widget>[
    HomeScreen(),
    DestinationsScreen(),
    MapScreen(),
    ProfileScreen(),
    SettingsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    // On mobile, use a bottom tab bar instead of NavigationView sidebar
    return Container(
      color: AppColors.surface,
      child: Column(
        children: [
          Expanded(child: _pages[_selectedIndex]),
          _buildBottomNav(),
        ],
      ),
    );
  }

  Widget _buildBottomNav() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceCard.withAlpha(240),
        border: Border(top: BorderSide(color: Colors.white.withAlpha(20))),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _navItem(FluentIcons.home, 'Home', 0),
              _navItem(FluentIcons.poi, 'Explore', 1),
              _navItem(FluentIcons.nav2_d_map_view, 'Map', 2),
              _navItem(FluentIcons.contact, 'Profile', 3),
              _navItem(FluentIcons.settings, 'Settings', 4),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem(IconData icon, String label, int index) {
    final isSelected = _selectedIndex == index;
    return GestureDetector(
      onTap: () => setState(() => _selectedIndex = index),
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 64,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.red500.withAlpha(30) : Colors.transparent,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(icon, size: 22, color: isSelected ? AppColors.red400 : AppColors.textFaint),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                color: isSelected ? AppColors.red400 : AppColors.textFaint,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
