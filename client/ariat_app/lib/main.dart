import 'package:fluent_ui/fluent_ui.dart';
import 'package:provider/provider.dart';
import 'services/auth_service.dart';
import 'services/api_service.dart';
import 'services/cache_service.dart';
import 'services/connectivity_service.dart';
import 'services/location_service.dart';
import 'services/notification_service.dart';
import 'services/theme_service.dart';
import 'theme/app_theme.dart';
import 'screens/auth/login_screen.dart';
import 'screens/app_shell.dart';
import 'widgets/loading_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await NotificationService.init();
  runApp(const AriatNaApp());
}

class AriatNaApp extends StatefulWidget {
  const AriatNaApp({super.key});
  @override
  State<AriatNaApp> createState() => _AriatNaAppState();
}

class _AriatNaAppState extends State<AriatNaApp> {
  late final AuthService _authService;
  late final CacheService _cacheService;
  late final ConnectivityService _connectivityService;
  late final LocationService _locationService;
  late final ApiService _apiService;
  final ThemeService _themeService = ThemeService();

  @override
  void initState() {
    super.initState();
    _authService = AuthService();
    _cacheService = CacheService();
    _connectivityService = ConnectivityService();
    _locationService = LocationService();
    _apiService = ApiService(_authService, _cacheService, _connectivityService);

    _authService.init().then((_) {
      // Only sync baseUrl if the user has explicitly saved a custom URL.
      // Otherwise always use the production default to avoid stale emulator
      // addresses from old SharedPreferences overriding the correct URL.
      final saved = _authService.baseUrl;
      if (saved != AuthService.defaultBaseUrl) {
        _apiService.baseUrl = saved;
      }
    });
  }

  @override
  void dispose() {
    _connectivityService.dispose();
    _locationService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: _authService),
        ChangeNotifierProvider.value(value: _connectivityService),
        ChangeNotifierProvider.value(value: _locationService),
        ChangeNotifierProvider.value(value: _themeService),
        Provider.value(value: _apiService),
        Provider.value(value: _cacheService),
      ],
      child: Consumer2<AuthService, ThemeService>(
        builder: (context, auth, themeService, _) {
          _apiService.baseUrl = auth.baseUrl;

          // Only propagate a custom URL — never override with stale emulator address
          if (auth.baseUrl != AuthService.defaultBaseUrl) {
            _apiService.baseUrl = auth.baseUrl;
          }

          return FluentApp(
            title: 'AIRAT-NA',
            theme: themeService.isDark ? buildAppTheme() : buildLightTheme(),
            debugShowCheckedModeBanner: false,
            home: auth.isLoading
                ? const LoadingScreen(message: 'Loading...')
                : auth.isAuthenticated
                    ? const AppShell()
                    : const LoginScreen(),
          );
        },
      ),
    );
  }
}
