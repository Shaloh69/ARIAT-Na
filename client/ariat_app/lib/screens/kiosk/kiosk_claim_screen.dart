import 'dart:async';
import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../models/itinerary.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/toast_overlay.dart';
import '../auth/login_screen.dart';
import '../map/map_screen.dart';

/// Shown after scanning a kiosk QR code.
///
/// 1. Fetches the preview from GET /kiosk/preview/:token
/// 2. Shows itinerary details so the user knows what they're claiming
/// 3. If authenticated → "Claim & Start" → POST /kiosk/claim/:token → DayDetailScreen
///    If not authenticated → "Sign in to Claim" → LoginScreen → returns here
class KioskClaimScreen extends StatefulWidget {
  final String token;
  const KioskClaimScreen({super.key, required this.token});

  @override
  State<KioskClaimScreen> createState() => _KioskClaimScreenState();
}

class _KioskClaimScreenState extends State<KioskClaimScreen> {
  bool _loading = true;
  bool _claiming = false;
  String? _error;

  Map<String, dynamic>? _preview; // raw server data
  MultiDayItinerary? _multiDay;
  DayItinerary? _singleDay;
  int _days = 1;
  int _totalStops = 0;

  // ── Kiosk received banner ─────────────────────────────────────────────────
  bool _showReceivedBanner = false;
  int _autoStartCountdown = 3;
  Timer? _countdownTimer;

  @override
  void initState() {
    super.initState();
    _fetchPreview();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  void _startCountdown() {
    setState(() { _showReceivedBanner = true; _autoStartCountdown = 3; });
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) { t.cancel(); return; }
      setState(() => _autoStartCountdown--);
      if (_autoStartCountdown <= 0) {
        t.cancel();
        _startWithoutAccount();
      }
    });
  }

  void _cancelCountdown() {
    _countdownTimer?.cancel();
    setState(() => _showReceivedBanner = false);
  }

  Future<void> _fetchPreview() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = context.read<ApiService>();
      final res = await api.get('/kiosk/preview/${widget.token}');
      if (res['success'] == true) {
        final data = res['data'] as Map<String, dynamic>;
        setState(() {
          _preview = data;
          _days = data['days'] ?? 1;
          final itin = data['itinerary'] as Map<String, dynamic>? ?? {};
          if (_days > 1) {
            _multiDay = MultiDayItinerary.fromJson(itin);
            _totalStops = _multiDay!.totalStops;
          } else {
            final stops = (itin['stops'] as List?) ?? [];
            _singleDay = DayItinerary.fromJson({...itin, 'dayNumber': 1});
            _totalStops = stops.length;
          }
        });
        // Auto-start countdown after a kiosk QR scan
        _startCountdown();
      } else {
        setState(() => _error = res['message'] ?? 'Failed to load itinerary');
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Start navigating with the itinerary immediately — no account needed.
  void _startWithoutAccount() {
    final transport = _preview?['transport_mode'] as String? ?? 'private_car';
    final destinations = _multiDay != null
        ? _multiDay!.days.expand((d) => d.stops).map((s) => s.destination).toList()
        : _singleDay?.stops.map((s) => s.destination).toList() ?? [];
    if (destinations.isEmpty) return;
    Navigator.pushAndRemoveUntil(
      context,
      FluentPageRoute(
        builder: (_) => MapScreen(
          initialDestinations: destinations,
          initialTransportMode: transport,
          isAiItinerary: true,
        ),
      ),
      (route) => route.isFirst,
    );
  }

  Future<void> _claim() async {
    final auth = context.read<AuthService>();
    if (!auth.isAuthenticated) {
      // Navigate to login, come back here after
      await Navigator.push(
        context,
        FluentPageRoute(builder: (_) => const LoginScreen()),
      );
      // After returning from login, check auth again
      if (!mounted) return;
      if (!context.read<AuthService>().isAuthenticated) return;
    }

    setState(() => _claiming = true);
    try {
      final api = context.read<ApiService>();
      final res = await api.post(
        '/kiosk/claim/${widget.token}',
        auth: true,
        body: {},
      );
      if (!mounted) return;
      if (res['success'] == true) {
        AppToast.success(context, 'Itinerary claimed! Starting your trip…');
        await Future.delayed(const Duration(milliseconds: 600));
        if (!mounted) return;

        // Navigate to MapScreen with all stops loaded
        final transport = _preview?['transport_mode'] as String? ?? 'private_car';
        final destinations = _multiDay != null
            ? _multiDay!.days.expand((d) => d.stops).map((s) => s.destination).toList()
            : _singleDay?.stops.map((s) => s.destination).toList() ?? [];
        if (destinations.isNotEmpty) {
          Navigator.pushAndRemoveUntil(
            context,
            FluentPageRoute(
              builder: (_) => MapScreen(
                initialDestinations: destinations,
                initialTransportMode: transport,
                isAiItinerary: true,
              ),
            ),
            (route) => route.isFirst,
          );
        } else {
          Navigator.popUntil(context, (r) => r.isFirst);
        }
      } else {
        AppToast.error(context, res['message'] ?? 'Claim failed');
      }
    } catch (e) {
      if (mounted) AppToast.error(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final auth = context.watch<AuthService>();

    return GradientBackground(
      child: SafeArea(
        child: Column(
          children: [
            // App bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  IconButton(
                    icon: Icon(FluentIcons.back, color: c.text),
                    onPressed: () => Navigator.pop(context),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Kiosk Itinerary',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: c.textStrong),
                  ),
                ],
              ),
            ),

            Expanded(
              child: _loading
                  ? _buildLoading(c)
                  : _error != null
                      ? _buildError(c)
                      : _buildContent(c, auth),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLoading(AppColorScheme c) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ProgressRing(strokeWidth: 3, activeColor: AppColors.red500),
        const SizedBox(height: 16),
        Text('Loading itinerary…', style: TextStyle(color: c.textMuted)),
      ],
    ),
  );

  Widget _buildError(AppColorScheme c) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(FluentIcons.error, size: 48, color: AppColors.red500),
          const SizedBox(height: 16),
          Text(
            _error!,
            style: TextStyle(color: c.textStrong, fontSize: 15),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          Button(
            onPressed: _fetchPreview,
            child: const Text('Try Again'),
          ),
        ],
      ),
    ),
  );

  Widget _buildContent(AppColorScheme c, AuthService auth) {
    final transportMode = _preview?['transport_mode'] ?? 'private_car';
    final isClaimed = _preview?['is_claimed'] == true;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Received from KIOSK banner ──────────────────────────────────
          if (_showReceivedBanner) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppColors.red500.withAlpha(220), AppColors.purple.withAlpha(200)],
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                ),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  const Text('📱', style: TextStyle(fontSize: 22)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Itinerary Received from KIOSK',
                          style: TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white,
                          ),
                        ),
                        Text(
                          'Starting in $_autoStartCountdown second${_autoStartCountdown != 1 ? "s" : ""}…',
                          style: TextStyle(fontSize: 12, color: Colors.white.withAlpha(200)),
                        ),
                      ],
                    ),
                  ),
                  Button(
                    onPressed: _cancelCountdown,
                    style: ButtonStyle(
                      padding: WidgetStateProperty.all(
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      ),
                    ),
                    child: const Text('Cancel', style: TextStyle(fontSize: 12)),
                  ),
                ],
              ),
            ).animate().fadeIn(duration: 300.ms).slideY(begin: -0.1, end: 0),
            const SizedBox(height: 12),
          ],

          // Hero card
          GlassCard(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 52, height: 52,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        gradient: LinearGradient(
                          colors: [AppColors.red500, AppColors.purple],
                          begin: Alignment.topLeft, end: Alignment.bottomRight,
                        ),
                      ),
                      child: const Center(child: Text('🗺️', style: TextStyle(fontSize: 26))),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Kiosk Itinerary',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.textStrong),
                          ),
                          Text(
                            'Token: ${widget.token}',
                            style: TextStyle(fontSize: 11, color: c.textFaint, fontFamily: 'monospace'),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Stats row
                Row(
                  children: [
                    _statBadge('📅', '$_days Day${_days > 1 ? "s" : ""}', c),
                    const SizedBox(width: 10),
                    _statBadge('📍', '$_totalStops Stop${_totalStops != 1 ? "s" : ""}', c),
                    const SizedBox(width: 10),
                    _statBadge(_transportIcon(transportMode), _transportLabel(transportMode), c),
                  ],
                ),
              ],
            ),
          ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.05, end: 0),

          const SizedBox(height: 16),

          // Day-by-day stop previews
          if (_multiDay != null) ...[
            for (final day in _multiDay!.days)
              _DayPreviewCard(day: day, c: c).animate().fadeIn(delay: Duration(milliseconds: 100 * day.dayNumber), duration: 350.ms),
          ] else if (_singleDay != null)
            _DayPreviewCard(day: _singleDay!, c: c).animate().fadeIn(delay: 100.ms, duration: 350.ms),

          const SizedBox(height: 24),

          // Claimed state
          if (isClaimed)
            GlassCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(FluentIcons.check_mark, size: 20, color: AppColors.green),
                      const SizedBox(width: 10),
                      Text(
                        'Itinerary saved to your account!',
                        style: TextStyle(color: AppColors.green, fontSize: 14, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Log in on the app with the account you created at the kiosk — your trip will appear in the Trips tab.',
                    style: TextStyle(color: c.textMuted, fontSize: 13),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: Button(
                      onPressed: () => Navigator.push(
                        context,
                        FluentPageRoute(builder: (_) => const LoginScreen()),
                      ),
                      style: ButtonStyle(
                        shape: WidgetStateProperty.all(RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                        padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 12)),
                      ),
                      child: Text(
                        auth.isAuthenticated ? '✓ Already logged in — check Trips tab' : 'Log In to See Your Trip',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.text),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _startWithoutAccount,
                      style: ButtonStyle(
                        backgroundColor: WidgetStateProperty.all(AppColors.red500),
                        shape: WidgetStateProperty.all(RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                        padding: WidgetStateProperty.all(const EdgeInsets.symmetric(vertical: 12)),
                      ),
                      child: const Text('🚀 Start Trip Now', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                    ),
                  ),
                ],
              ),
            )
          else ...[
            // Primary CTA — start immediately, no account needed
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _startWithoutAccount,
                style: ButtonStyle(
                  backgroundColor: WidgetStateProperty.all(AppColors.red500),
                  shape: WidgetStateProperty.all(
                    RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  padding: WidgetStateProperty.all(
                    const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
                child: const Text(
                  '🚀 Start Trip Now',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),

            const SizedBox(height: 10),

            // Secondary CTA — save to account
            Container(
              width: double.infinity,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: auth.isAuthenticated ? AppColors.green : c.borderLight,
                ),
              ),
              child: Button(
                onPressed: _claiming ? null : () => _claim(),
                style: ButtonStyle(
                  shape: WidgetStateProperty.all(
                    RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  padding: WidgetStateProperty.all(
                    const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
                child: _claiming
                    ? ProgressRing(strokeWidth: 2, activeColor: AppColors.green)
                    : Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            auth.isAuthenticated
                                ? FluentIcons.save
                                : FluentIcons.contact,
                            size: 15,
                            color: auth.isAuthenticated ? AppColors.green : c.textMuted,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            auth.isAuthenticated
                                ? 'Save to My Account'
                                : 'Sign In & Save',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: auth.isAuthenticated ? AppColors.green : c.textMuted,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ],

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _statBadge(String icon, String label, AppColorScheme c) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    decoration: BoxDecoration(
      color: c.surfaceElevated,
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: c.borderSubtle),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(icon, style: const TextStyle(fontSize: 14)),
        const SizedBox(width: 6),
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.text)),
      ],
    ),
  );

  String _transportIcon(String mode) {
    switch (mode) {
      case 'bus': return '🚌';
      case 'taxi': return '🚕';
      case 'ferry': return '⛴️';
      default: return '🚗';
    }
  }
  String _transportLabel(String mode) {
    switch (mode) {
      case 'bus': return 'Bus';
      case 'taxi': return 'Taxi';
      case 'ferry': return 'Ferry';
      case 'private_car': return 'Car';
      default: return mode;
    }
  }
}

// ─── Day Preview Card ─────────────────────────────────────────────────────────

class _DayPreviewCard extends StatelessWidget {
  final DayItinerary day;
  final AppColorScheme c;
  const _DayPreviewCard({required this.day, required this.c});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Day ${day.dayNumber}${day.clusterName != null ? " — ${day.clusterName}" : ""}',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.textStrong),
          ),
          const SizedBox(height: 10),
          for (int i = 0; i < day.stops.length; i++) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 22, height: 22,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.red500.withAlpha(20),
                    border: Border.all(color: AppColors.red500.withAlpha(80)),
                  ),
                  child: Center(
                    child: Text(
                      '${i + 1}',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.red500),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        day.stops[i].destination.name,
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.text),
                      ),
                      if (day.stops[i].destination.categoryName != null)
                        Text(
                          day.stops[i].destination.categoryName!,
                          style: TextStyle(fontSize: 11, color: c.textFaint),
                        ),
                    ],
                  ),
                ),
                Text(
                  '${day.stops[i].visitDuration}min',
                  style: TextStyle(fontSize: 11, color: c.textMuted),
                ),
              ],
            ),
            if (i < day.stops.length - 1)
              Padding(
                padding: const EdgeInsets.only(left: 11, top: 2, bottom: 2),
                child: Container(width: 1, height: 12, color: c.borderSubtle),
              ),
          ],
        ],
      ),
    );
  }
}
