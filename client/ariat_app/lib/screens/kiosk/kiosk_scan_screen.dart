import 'package:fluent_ui/fluent_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../theme/app_theme.dart';
import '../../widgets/gradient_background.dart';
import 'kiosk_claim_screen.dart';

/// Full-screen QR scanner for claiming a kiosk-generated itinerary.
///
/// Decodes `airatna://kiosk/<TOKEN>` deep-links and navigates to
/// [KioskClaimScreen] with the extracted token.
class KioskScanScreen extends StatefulWidget {
  const KioskScanScreen({super.key});

  @override
  State<KioskScanScreen> createState() => _KioskScanScreenState();
}

class _KioskScanScreenState extends State<KioskScanScreen> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
    torchEnabled: false,
  );
  bool _detected = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_detected) return;
    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue;
      if (raw == null) continue;

      // Accept:
      //  airatna://kiosk/TOKEN         — deep link (direct)
      //  https://.../open?token=TOKEN  — web handoff URL (QRHandoffModal output)
      //  plain 6-12 char token         — fallback
      String? token;
      if (raw.startsWith('airatna://kiosk/')) {
        final uri = Uri.tryParse(raw);
        token = uri?.pathSegments.isNotEmpty == true ? uri!.pathSegments.last : null;
      } else if (raw.contains('/open') && raw.contains('token=')) {
        final uri = Uri.tryParse(raw);
        token = uri?.queryParameters['token'];
      } else if (RegExp(r'^[A-Za-z0-9]{6,32}$').hasMatch(raw)) {
        token = raw;
      }

      if (token != null && token.isNotEmpty) {
        setState(() => _detected = true);
        _controller.stop();
        Navigator.pushReplacement(
          context,
          FluentPageRoute(
            builder: (_) => KioskClaimScreen(token: token!),
          ),
        );
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return GradientBackground(
      child: Stack(
        children: [
          // Camera feed
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
          ),

          // Dark overlay with cut-out window
          CustomPaint(
            painter: _ScanOverlayPainter(),
            child: const SizedBox.expand(),
          ),

          // UI chrome
          SafeArea(
            child: Column(
              children: [
                // App bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    children: [
                      IconButton(
                        icon: Icon(FluentIcons.back, color: Colors.white),
                        onPressed: () => Navigator.pop(context),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Scan Kiosk QR',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      const Spacer(),
                      // Torch toggle
                      IconButton(
                        icon: ValueListenableBuilder(
                          valueListenable: _controller,
                          builder: (_, state, child) => Icon(
                            FluentIcons.brightness,
                            color: state.torchState == TorchState.on
                                ? AppColors.amber
                                : Colors.white,
                          ),
                        ),
                        onPressed: () => _controller.toggleTorch(),
                      ),
                    ],
                  ),
                ),

                const Spacer(),

                // Instructions below viewfinder
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 40, vertical: 32),
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
                  decoration: BoxDecoration(
                    color: Colors.black.withAlpha(160),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Point your camera at the QR code\non the AIRAT-NA kiosk',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'The itinerary will be saved to your account automatically',
                        style: TextStyle(color: Colors.white.withAlpha(170), fontSize: 12),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Paints a dark overlay with a transparent square cut-out in the centre.
class _ScanOverlayPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const windowSize = 260.0;
    final cx = size.width / 2;
    final cy = size.height / 2 - 30; // slightly above centre

    final rect = Rect.fromCenter(
      center: Offset(cx, cy),
      width: windowSize,
      height: windowSize,
    );

    final paint = Paint()..color = Colors.black.withAlpha(140);

    // Fill around the window
    canvas.drawPath(
      Path.combine(
        PathOperation.difference,
        Path()..addRect(Rect.fromLTWH(0, 0, size.width, size.height)),
        Path()..addRRect(RRect.fromRectAndRadius(rect, const Radius.circular(16))),
      ),
      paint,
    );

    // Corner brackets
    final bracketPaint = Paint()
      ..color = AppColors.red500
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    const bLen = 24.0;

    // TL
    canvas.drawLine(Offset(rect.left, rect.top + bLen), Offset(rect.left, rect.top), bracketPaint);
    canvas.drawLine(Offset(rect.left, rect.top), Offset(rect.left + bLen, rect.top), bracketPaint);
    // TR
    canvas.drawLine(Offset(rect.right - bLen, rect.top), Offset(rect.right, rect.top), bracketPaint);
    canvas.drawLine(Offset(rect.right, rect.top), Offset(rect.right, rect.top + bLen), bracketPaint);
    // BL
    canvas.drawLine(Offset(rect.left, rect.bottom - bLen), Offset(rect.left, rect.bottom), bracketPaint);
    canvas.drawLine(Offset(rect.left, rect.bottom), Offset(rect.left + bLen, rect.bottom), bracketPaint);
    // BR
    canvas.drawLine(Offset(rect.right - bLen, rect.bottom), Offset(rect.right, rect.bottom), bracketPaint);
    canvas.drawLine(Offset(rect.right, rect.bottom), Offset(rect.right, rect.bottom - bLen), bracketPaint);
  }

  @override
  bool shouldRepaint(_ScanOverlayPainter old) => false;
}
