class RouteResult {
  final List<RoutePoint> path;
  final double totalDistance;
  final int estimatedTime;
  final List<RouteStep> steps;
  final List<List<double>>? routeGeometry;

  RouteResult({
    required this.path,
    required this.totalDistance,
    required this.estimatedTime,
    required this.steps,
    this.routeGeometry,
  });

  factory RouteResult.fromJson(Map<String, dynamic> json) {
    return RouteResult(
      path: (json['path'] as List?)?.map((p) => RoutePoint.fromJson(p)).toList() ?? [],
      totalDistance: (json['totalDistance'] as num?)?.toDouble() ?? 0,
      estimatedTime: (json['estimatedTime'] as num?)?.toInt() ?? 0,
      steps: (json['steps'] as List?)?.map((s) => RouteStep.fromJson(s)).toList() ?? [],
      routeGeometry: (json['routeGeometry'] as List?)
          ?.map((c) => [(c[0] as num).toDouble(), (c[1] as num).toDouble()])
          .toList(),
    );
  }
}

class RoutePoint {
  final String id;
  final String name;
  final double latitude;
  final double longitude;

  RoutePoint({required this.id, required this.name, required this.latitude, required this.longitude});

  factory RoutePoint.fromJson(Map<String, dynamic> json) {
    return RoutePoint(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
    );
  }
}

class RouteStep {
  final String instruction;
  final String roadName;
  final double distance;
  final double time;
  final String from;
  final String to;

  RouteStep({
    required this.instruction,
    required this.roadName,
    required this.distance,
    required this.time,
    required this.from,
    required this.to,
  });

  factory RouteStep.fromJson(Map<String, dynamic> json) {
    return RouteStep(
      instruction: json['instruction'] ?? '',
      roadName: json['roadName'] ?? '',
      distance: (json['distance'] as num?)?.toDouble() ?? 0,
      time: (json['time'] as num?)?.toDouble() ?? 0,
      from: json['from'] ?? '',
      to: json['to'] ?? '',
    );
  }
}
