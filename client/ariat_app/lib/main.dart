import 'package:app_links/app_links.dart';
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
import 'screens/kiosk/kiosk_claim_screen.dart';
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

// Global navigator key so deep link handler can push routes without context
final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();

class _AriatNaAppState extends State<AriatNaApp> {
  late final AuthService _authService;
  late final CacheService _cacheService;
  late final ConnectivityService _connectivityService;
  late final LocationService _locationService;
  late final ApiService _apiService;
  final ThemeService _themeService = ThemeService();
  final _appLinks = AppLinks();

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

    _initDeepLinks();
  }

  /// Listen for incoming airatna:// deep links and navigate to the right screen.
  void _initDeepLinks() {
    // App already running — foreground link
    _appLinks.uriLinkStream.listen(_handleDeepLink);
    // Cold-start — app was opened via the link
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) _handleDeepLink(uri);
    });
  }

  void _handleDeepLink(Uri uri) {
    if (uri.scheme != 'airatna') return;

    // airatna://kiosk/TOKEN  →  KioskClaimScreen
    if (uri.host == 'kiosk') {
      final token = uri.pathSegments.isNotEmpty ? uri.pathSegments.first : null;
      if (token != null && token.isNotEmpty) {
        _navigatorKey.currentState?.push(
          FluentPageRoute(
            builder: (_) => KioskClaimScreen(token: token),
          ),
        );
      }
    }
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
          // Only propagate a custom URL — never override with stale emulator address
          if (auth.baseUrl != AuthService.defaultBaseUrl) {
            _apiService.baseUrl = auth.baseUrl;
          }

          return FluentApp(
            title: 'AIRAT-NA',
            navigatorKey: _navigatorKey,
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
