import 'destination.dart';
import 'transport_leg.dart';

class ItineraryStop {
  final Destination destination;
  final double score;
  final String reason;
  final int visitDuration;    // minutes
  final double legDistance;   // km
  final int legTravelTime;    // minutes
  final int cumulativeTime;   // minutes from start
  final int dayNumber;
  final double legFare;                  // PHP transit fare for this leg
  final List<TransportLeg>? multiModalLegs; // null for private car
  /// Route geometry for the leg leading TO this stop: [[lat, lon], ...]
  final List<List<double>>? routeGeometry;

  ItineraryStop({
    required this.destination,
    this.score = 0,
    this.reason = '',
    this.visitDuration = 60,
    this.legDistance = 0,
    this.legTravelTime = 0,
    this.cumulativeTime = 0,
    this.dayNumber = 1,
    this.legFare = 0,
    this.multiModalLegs,
    this.routeGeometry,
  });

  factory ItineraryStop.fromJson(Map<String, dynamic> json) {
    final rawLegs = json['multi_modal_legs'] as List?;
    final rawGeom = json['route_geometry'] as List?;
    return ItineraryStop(
      destination: Destination.fromJson(
        json['destination'] as Map<String, dynamic>? ?? json,
      ),
      score: (json['score'] as num?)?.toDouble() ?? 0,
      reason: json['reason'] ?? '',
      visitDuration: json['visit_duration'] ?? json['planned_duration'] ?? 60,
      legDistance: (json['leg_distance'] as num?)?.toDouble() ?? 0,
      legTravelTime: json['leg_travel_time'] ?? 0,
      cumulativeTime: json['cumulative_time'] ?? 0,
      dayNumber: json['day_number'] ?? 1,
      legFare: (json['leg_fare'] as num?)?.toDouble() ?? 0,
      multiModalLegs: rawLegs
          ?.map((l) => TransportLeg.fromJson(l as Map<String, dynamic>))
          .toList(),
      routeGeometry: rawGeom
          ?.map((c) => (c as List).map((v) => (v as num).toDouble()).toList())
          .toList(),
    );
  }
}

class DayItinerary {
  final int dayNumber;
  final List<ItineraryStop> stops;
  final double totalDistance;
  final int estimatedTravelTime;
  final int estimatedVisitTime;
  final int estimatedTotalTime;
  final double estimatedCost;
  final String? clusterName;

  DayItinerary({
    required this.dayNumber,
    required this.stops,
    this.totalDistance = 0,
    this.estimatedTravelTime = 0,
    this.estimatedVisitTime = 0,
    this.estimatedTotalTime = 0,
    this.estimatedCost = 0,
    this.clusterName,
  });

  factory DayItinerary.fromJson(Map<String, dynamic> json) {
    final itin = json['itinerary'] as Map<String, dynamic>? ?? json;
    final rawStops = (itin['stops'] as List?) ?? (json['stops'] as List?) ?? [];
    final rawLegs  = (itin['legs']  as List?) ?? (json['legs']  as List?) ?? [];
    final dayNum = json['dayNumber'] ?? json['day_number'] ?? 1;
    return DayItinerary(
      dayNumber: dayNum,
      stops: rawStops.asMap().entries.map((entry) {
        final i = entry.key;
        final s = entry.value as Map<String, dynamic>;
        final legGeom = i < rawLegs.length
            ? (rawLegs[i] as Map<String, dynamic>)['routeGeometry'] as List?
            : null;
        return ItineraryStop.fromJson({
          ...s,
          'day_number': dayNum,
          if (legGeom != null) 'route_geometry': legGeom,
        });
      }).toList(),
      totalDistance: (itin['totalDistance'] as num?)?.toDouble() ?? 0,
      estimatedTravelTime: itin['estimatedTravelTime'] ?? 0,
      estimatedVisitTime: itin['estimatedVisitTime'] ?? 0,
      estimatedTotalTime: itin['estimatedTotalTime'] ?? 0,
      estimatedCost: (itin['estimatedCost'] as num?)?.toDouble() ?? 0,
      clusterName: json['clusterName'] ?? json['cluster_name'],
    );
  }
}

class MultiDayItinerary {
  final List<DayItinerary> days;
  final int totalDays;
  final int totalStops;
  final double totalDistance;
  final int estimatedTravelTime;
  final int estimatedVisitTime;
  final int estimatedTotalTime;
  final double estimatedCost;

  MultiDayItinerary({
    required this.days,
    required this.totalDays,
    required this.totalStops,
    required this.totalDistance,
    required this.estimatedTravelTime,
    required this.estimatedVisitTime,
    required this.estimatedTotalTime,
    required this.estimatedCost,
  });

  factory MultiDayItinerary.fromJson(Map<String, dynamic> json) {
    final rawDays = json['days'] as List? ?? [];
    final parsed = rawDays.map((d) => DayItinerary.fromJson(d as Map<String, dynamic>)).toList();
    return MultiDayItinerary(
      days: parsed,
      totalDays: json['totalDays'] ?? parsed.length,
      totalStops: json['totalStops'] ?? parsed.fold<int>(0, (s, d) => s + d.stops.length),
      totalDistance: (json['totalDistance'] as num?)?.toDouble() ?? 0,
      estimatedTravelTime: json['estimatedTravelTime'] ?? 0,
      estimatedVisitTime: json['estimatedVisitTime'] ?? 0,
      estimatedTotalTime: json['estimatedTotalTime'] ?? 0,
      estimatedCost: (json['estimatedCost'] as num?)?.toDouble() ?? 0,
    );
  }
}

class SavedItinerary {
  final String id;
  final String title;
  final String? description;
  final int days;
  final List<String> clusterIds;
  final String? tripType;
  final String? transportMode;
  final String? groupType;
  final double? totalDistance;
  final int? estimatedTime;
  final double? estimatedCost;
  final int stopCount;
  final String? startDate;
  final DateTime createdAt;
  final List<DayItinerary> daysData;

  SavedItinerary({
    required this.id,
    required this.title,
    this.description,
    this.days = 1,
    this.clusterIds = const [],
    this.tripType,
    this.transportMode,
    this.groupType,
    this.totalDistance,
    this.estimatedTime,
    this.estimatedCost,
    this.stopCount = 0,
    this.startDate,
    required this.createdAt,
    this.daysData = const [],
  });

  factory SavedItinerary.fromJson(Map<String, dynamic> json) {
    final rawClusterIds = json['cluster_ids'];
    List<String> clusterIds = [];
    if (rawClusterIds is List) {
      clusterIds = rawClusterIds.cast<String>();
    } else if (rawClusterIds is String && rawClusterIds.isNotEmpty) {
      try {
        clusterIds = List<String>.from(
          (rawClusterIds.startsWith('[') ? rawClusterIds : '["$rawClusterIds"]')
              .replaceAll(RegExp(r'["\[\]]'), '')
              .split(',')
              .where((s) => s.trim().isNotEmpty),
        );
      } catch (_) {}
    }

    final rawDays = json['days_data'] as List?;
    final daysData = rawDays?.map((d) => DayItinerary.fromJson(d as Map<String, dynamic>)).toList() ?? [];

    return SavedItinerary(
      id: json['id'] ?? '',
      title: json['title'] ?? '',
      description: json['description'],
      days: json['days'] ?? 1,
      clusterIds: clusterIds,
      tripType: json['trip_type'],
      transportMode: json['transport_mode'],
      groupType: json['group_type'],
      totalDistance: (json['total_distance'] as num?)?.toDouble(),
      estimatedTime: json['estimated_time'],
      estimatedCost: (json['estimated_cost'] as num?)?.toDouble(),
      stopCount: json['stop_count'] ?? 0,
      startDate: json['start_date'],
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
      daysData: daysData,
    );
  }

  Map<String, dynamic> toSaveBody({
    required double startLat,
    required double startLon,
    required List<DayItinerary> generatedDays,
    String optimizeFor = 'time',
  }) {
    return {
      'title': title,
      'description': description,
      'start_latitude': startLat,
      'start_longitude': startLon,
      'optimize_for': optimizeFor,
      'total_distance': totalDistance,
      'estimated_time': estimatedTime,
      'estimated_cost': estimatedCost,
      'days': days,
      'cluster_ids': clusterIds,
      'trip_type': tripType,
      'transport_mode': transportMode,
      'group_type': groupType,
      'days_data': generatedDays
          .map((d) => {
                'dayNumber': d.dayNumber,
                'stops': d.stops
                    .map((s) => {
                          'destination': {'id': s.destination.id},
                          'visit_duration': s.visitDuration,
                        })
                    .toList(),
              })
          .toList(),
    };
  }
}
