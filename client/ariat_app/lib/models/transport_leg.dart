class TransportLegPoint {
  final String name;
  final double lat;
  final double lon;
  final String? type;

  TransportLegPoint({
    required this.name,
    required this.lat,
    required this.lon,
    this.type,
  });

  factory TransportLegPoint.fromJson(Map<String, dynamic> json) {
    return TransportLegPoint(
      name: json['name'] ?? '',
      lat: (json['lat'] as num?)?.toDouble() ?? 0,
      lon: (json['lon'] as num?)?.toDouble() ?? 0,
      type: json['type'],
    );
  }
}

class TransportLeg {
  final String mode; // walk | bus | jeepney | tricycle | taxi | private_car | ferry | hired_van | motorbike | habal_habal
  final TransportLegPoint from;
  final TransportLegPoint to;
  final double distance; // km
  final int duration; // minutes
  final double fare; // PHP
  final String instruction;
  final List<List<double>> geometry; // [[lat, lon], ...]

  TransportLeg({
    required this.mode,
    required this.from,
    required this.to,
    required this.distance,
    required this.duration,
    required this.fare,
    required this.instruction,
    this.geometry = const [],
  });

  factory TransportLeg.fromJson(Map<String, dynamic> json) {
    final rawGeometry = json['geometry'] as List?;
    final geometry = rawGeometry
            ?.map((pt) => (pt as List).map((v) => (v as num).toDouble()).toList())
            .toList() ??
        [];

    return TransportLeg(
      mode: json['mode'] ?? 'walk',
      from: TransportLegPoint.fromJson(json['from'] as Map<String, dynamic>),
      to: TransportLegPoint.fromJson(json['to'] as Map<String, dynamic>),
      distance: (json['distance'] as num?)?.toDouble() ?? 0,
      duration: (json['duration'] as num?)?.toInt() ?? 0,
      fare: (json['fare'] as num?)?.toDouble() ?? 0,
      instruction: json['instruction'] ?? '',
      geometry: geometry,
    );
  }
}

class MultiModalRoute {
  final List<TransportLeg> legs;
  final double totalDistance;
  final int totalDuration;
  final double totalFare;
  final String summary;
  final List<String> warnings;

  MultiModalRoute({
    required this.legs,
    required this.totalDistance,
    required this.totalDuration,
    required this.totalFare,
    required this.summary,
    this.warnings = const [],
  });

  factory MultiModalRoute.fromJson(Map<String, dynamic> json) {
    return MultiModalRoute(
      legs: (json['legs'] as List?)
              ?.map((l) => TransportLeg.fromJson(l as Map<String, dynamic>))
              .toList() ??
          [],
      totalDistance: (json['totalDistance'] as num?)?.toDouble() ?? 0,
      totalDuration: (json['totalDuration'] as num?)?.toInt() ?? 0,
      totalFare: (json['totalFare'] as num?)?.toDouble() ?? 0,
      summary: json['summary'] ?? '',
      warnings:
          (json['warnings'] as List?)?.map((w) => w.toString()).toList() ?? [],
    );
  }
}
