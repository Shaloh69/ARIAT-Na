import 'package:flutter_test/flutter_test.dart';
import 'package:ariat_na/main.dart';

void main() {
  testWidgets('App starts', (WidgetTester tester) async {
    await tester.pumpWidget(const AriatNaApp());
  });
}
