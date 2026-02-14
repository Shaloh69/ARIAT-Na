import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  static Future<void> init() async {
    if (_initialized) return;

    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidSettings);

    await _plugin.initialize(initSettings);
    _initialized = true;
  }

  static Future<void> show({
    required String title,
    required String body,
    int id = 0,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      'ariat_na_channel',
      'AIRAT-NA Notifications',
      channelDescription: 'Navigation and destination notifications',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
    );
    const details = NotificationDetails(android: androidDetails);
    await _plugin.show(id, title, body, details);
  }

  static Future<void> showDestinationArrived(String name) async {
    await show(
      title: 'Destination Arrived!',
      body: 'You have arrived at $name',
      id: 100,
    );
  }

  static Future<void> showApproaching(String name) async {
    await show(
      title: 'Almost There!',
      body: 'You are approaching $name',
      id: 101,
    );
  }

  static Future<void> showDataUpdated(String dataType) async {
    await show(
      title: 'Data Updated',
      body: '$dataType has been refreshed with latest data',
      id: 200,
    );
  }

  static Future<void> showBackOnline() async {
    await show(
      title: 'Back Online',
      body: 'Internet connection restored. Syncing data...',
      id: 300,
    );
  }
}
