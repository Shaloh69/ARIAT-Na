import 'dart:ui';
import 'package:fluent_ui/fluent_ui.dart';
import 'package:flutter/material.dart' show showModalBottomSheet;
import '../../theme/app_theme.dart';

/// Parameters returned when the user taps "Generate".
/// Matches the POST /ai/itinerary/generate request body.
class ItineraryParams {
  final double availableHours;
  final double budget;
  final int days;
  final List<String> interests;
  final int maxStops;
  final String optimizeFor;
  final String transportMode;

  ItineraryParams({
    required this.availableHours,
    required this.budget,
    required this.days,
    required this.interests,
    required this.maxStops,
    required this.optimizeFor,
    this.transportMode = 'private_car',
  });

  Map<String, dynamic> toJson() => {
    'available_hours': availableHours,
    'budget': budget,
    'days': days,
    'interests': interests,
    'max_stops': maxStops,
    'optimize_for': optimizeFor,
    'transport_mode': transportMode,
  };
}

/// Shows the AI itinerary generation bottom sheet.
/// Returns [ItineraryParams] on confirm, or null on dismiss.
Future<ItineraryParams?> showItinerarySheet(BuildContext context) {
  return showModalBottomSheet<ItineraryParams>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Color(0x00000000), // transparent
    builder: (_) => const _ItineraryBottomSheet(),
  );
}

class _ItineraryBottomSheet extends StatefulWidget {
  const _ItineraryBottomSheet();

  @override
  State<_ItineraryBottomSheet> createState() => _ItineraryBottomSheetState();
}

class _ItineraryBottomSheetState extends State<_ItineraryBottomSheet> {
  double _hours = 4;
  double _budget = 0;
  int _days = 1;
  int _maxStops = 3;
  String _optimizeFor = 'time';
  String _transportMode = 'private_car';
  final Set<String> _interests = {};
  final TextEditingController _budgetCtrl = TextEditingController(text: '0');

  static const _interestOptions = [
    'nature', 'heritage', 'food', 'adventure',
    'shopping', 'beach', 'culture', 'religion',
  ];

  static final _transportOptions = [
    ('private_car', 'Private',   FluentIcons.car),
    ('bus_commute', 'Bus',       FluentIcons.bus_solid),
    ('taxi',        'Grab/Taxi', FluentIcons.taxi),
  ];

  @override
  void dispose() {
    _budgetCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.appColors;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
          child: Container(
            padding: EdgeInsets.fromLTRB(
              20, 16, 20, MediaQuery.of(context).padding.bottom + 16,
            ),
            decoration: BoxDecoration(
              color: c.surfaceCard.withAlpha(240),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
              border: Border(top: BorderSide(color: c.borderLight)),
            ),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Handle bar
                  Center(
                    child: Container(
                      width: 36, height: 4,
                      decoration: BoxDecoration(
                        color: c.borderStrong,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  SizedBox(height: 16),

                  // Title
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [AppColors.gradientStart, AppColors.gradientMid],
                          ),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(FluentIcons.lightbulb, size: 16, color: Colors.white),
                      ),
                      SizedBox(width: 10),
                      Text(
                        'AI Itinerary Generator',
                        style: TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w700, color: c.textStrong,
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 4),
                  Text(
                    "We'll pick and route the best stops for you.",
                    style: TextStyle(fontSize: 12, color: c.textFaint),
                  ),
                  SizedBox(height: 20),

                  // Transport Mode
                  _label('Transport Mode'),
                  SizedBox(height: 8),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: _transportOptions.map((opt) {
                        final (value, label, icon) = opt;
                        final selected = _transportMode == value;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: GestureDetector(
                            onTap: () => setState(() => _transportMode = value),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                color: selected ? AppColors.red500 : c.surfaceElevated,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: selected ? AppColors.red500 : c.borderSubtle,
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(icon, size: 14, color: selected ? Colors.white : c.textMuted),
                                  SizedBox(width: 6),
                                  Text(
                                    label,
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                                      color: selected ? Colors.white : c.textMuted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  SizedBox(height: 16),

                  // Days
                  _label('Number of Days: $_days'),
                  SizedBox(height: 8),
                  Row(
                    children: [1, 2, 3, 4, 5, 6, 7].map((d) {
                      final sel = _days == d;
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: GestureDetector(
                          onTap: () => setState(() => _days = d),
                          child: Container(
                            width: 36, height: 36,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: sel ? AppColors.red500 : c.surfaceElevated,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: sel ? AppColors.red500 : c.borderSubtle,
                              ),
                            ),
                            child: Text(
                              '$d',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: sel ? FontWeight.w700 : FontWeight.w400,
                                color: sel ? Colors.white : c.textMuted,
                              ),
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  SizedBox(height: 14),

                  // Hours
                  _label(_days > 1
                      ? 'Hours per Day: ${_hours.toStringAsFixed(1)} hrs'
                      : 'Available Hours: ${_hours.toStringAsFixed(1)} hrs'),
                  Slider(
                    value: _hours,
                    min: 1,
                    max: 12,
                    onChanged: (v) => setState(() => _hours = v),
                  ),
                  SizedBox(height: 14),

                  // Max stops
                  _label('Max Stops: $_maxStops'),
                  Slider(
                    value: _maxStops.toDouble(),
                    min: 1,
                    max: 8,
                    onChanged: (v) => setState(() => _maxStops = v.round()),
                  ),
                  SizedBox(height: 14),

                  // Budget
                  _label('Budget in PHP (0 = no limit)'),
                  SizedBox(height: 6),
                  TextBox(
                    controller: _budgetCtrl,
                    placeholder: '0',
                    keyboardType: TextInputType.number,
                    onChanged: (v) => _budget = double.tryParse(v) ?? 0,
                  ),
                  SizedBox(height: 16),

                  // Optimize for — only for private car
                  if (_transportMode == 'private_car') ...[
                    _label('Optimize For'),
                    SizedBox(height: 8),
                    Row(
                      children: [
                        _optionChip('time', 'Fastest', FluentIcons.timer),
                        SizedBox(width: 8),
                        _optionChip('distance', 'Shortest', FluentIcons.map_directions),
                      ],
                    ),
                    SizedBox(height: 16),
                  ],

                  // Interests
                  _label('Interests (optional)'),
                  SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _interestOptions.map((interest) {
                      final selected = _interests.contains(interest);
                      return GestureDetector(
                        onTap: () => setState(() {
                          if (selected) {
                            _interests.remove(interest);
                          } else {
                            _interests.add(interest);
                          }
                        }),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                          decoration: BoxDecoration(
                            color: selected ? AppColors.red500 : c.surfaceElevated,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: selected ? AppColors.red500 : c.borderSubtle,
                            ),
                          ),
                          child: Text(
                            interest,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                              color: selected ? Colors.white : c.textMuted,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  SizedBox(height: 24),

                  // Generate button
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _onGenerate,
                      style: ButtonStyle(
                        backgroundColor: WidgetStateProperty.all(AppColors.red500),
                        shape: WidgetStateProperty.all(
                          RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        padding: WidgetStateProperty.all(
                          const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(FluentIcons.lightbulb, size: 16, color: Colors.white),
                          SizedBox(width: 8),
                          Text(
                            'Generate Itinerary',
                            style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _label(String text) {
    final c = context.appColors;
    return Text(text, style: TextStyle(fontSize: 12, color: c.textFaint, fontWeight: FontWeight.w500));
  }

  Widget _optionChip(String value, String label, IconData icon) {
    final c = context.appColors;
    final selected = _optimizeFor == value;
    return GestureDetector(
      onTap: () => setState(() => _optimizeFor = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.red500 : c.surfaceElevated,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? AppColors.red500 : c.borderSubtle,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: selected ? Colors.white : c.textMuted),
            SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                color: selected ? Colors.white : c.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _onGenerate() async {
    if (_interests.length == 1) {
      final c = context.appColors;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => ContentDialog(
          title: const Text('Only 1 Interest Selected'),
          content: Text(
            'You selected only "${_interests.first}" as your interest.\n\n'
            'With a single interest, the AI can only suggest destinations that match that one category. '
            'Selecting more interests (e.g. adventure + nature + beach) gives the AI a wider pool to build '
            'a more varied and enjoyable itinerary.\n\n'
            'Are you sure you want to continue with just one?',
            style: TextStyle(fontSize: 13, color: c.textMuted),
          ),
          actions: [
            Button(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Add More'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: ButtonStyle(
                backgroundColor: WidgetStateProperty.all(AppColors.red500),
              ),
              child: const Text('Continue Anyway'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }
    if (!mounted) return;
    Navigator.of(context).pop(ItineraryParams(
      availableHours: _hours,
      budget: _budget,
      days: _days,
      interests: _interests.toList(),
      maxStops: _maxStops,
      optimizeFor: _optimizeFor,
      transportMode: _transportMode,
    ));
  }
}
