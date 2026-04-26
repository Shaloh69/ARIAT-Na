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
import 'services/navigation_ws_service.dart';
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

// Global navigator key — used by deep link handler and KioskClaimScreen
// to push routes even when widget context may have been rebuilt.
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

class _AriatNaAppState extends State<AriatNaApp> {
  late final AuthService _authService;
  late final CacheService _cacheService;
  late final ConnectivityService _connectivityService;
  late final LocationService _locationService;
  late final ApiService _apiService;
  late final NavigationWsService _navWsService;
  final ThemeService _themeService = ThemeService();
  final _appLinks = AppLinks();

  // Token buffered while auth is still loading — pushed once init() finishes.
  String? _pendingKioskToken;

  @override
  void initState() {
    super.initState();
    _authService = AuthService();
    _cacheService = CacheService();
    _connectivityService = ConnectivityService();
    _locationService = LocationService();
    _apiService = ApiService(_authService, _cacheService, _connectivityService);
    _navWsService = NavigationWsService(_authService);

    _authService.init().then((_) {
      // Only sync baseUrl if the user has explicitly saved a custom URL.
      final saved = _authService.baseUrl;
      if (saved != AuthService.defaultBaseUrl) {
        _apiService.baseUrl = saved;
      }
      // Drain any kiosk deep link that arrived before init() completed.
      _tryPushPendingKioskToken();
    });

    _initDeepLinks();
  }

  void _initDeepLinks() {
    // App already running — foreground / background resume link
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
      if (token == null || token.isEmpty) return;

      // If auth is still loading, buffer the token — we can't push yet because
      // the Navigator may not be ready and isAuthenticated is unknown.
      if (_authService.isLoading) {
        _pendingKioskToken = token;
        return;
      }

      _pushKioskClaim(token);
    }
  }

  void _tryPushPendingKioskToken() {
    final token = _pendingKioskToken;
    if (token == null) return;
    _pendingKioskToken = null;
    _pushKioskClaim(token);
  }

  void _pushKioskClaim(String token) {
    final nav = navigatorKey.currentState;
    if (nav != null) {
      nav.push(FluentPageRoute(builder: (_) => KioskClaimScreen(token: token)));
    } else {
      // Navigator widget not mounted yet — retry after the current frame.
      WidgetsBinding.instance.addPostFrameCallback((_) => _pushKioskClaim(token));
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
        ChangeNotifierProvider.value(value: _navWsService),
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
            navigatorKey: navigatorKey,
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
