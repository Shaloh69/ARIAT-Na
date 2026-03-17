class TripSetupParams {
  final List<String> clusterIds;
  final String? tripType;       // beach, nature, heritage, food, adventure
  final String? groupType;      // solo, couple, family, barkada
  final String? transportMode;  // car, bus, van, motorbike
  final double budget;
  final int days;
  final double hoursPerDay;
  final int maxStopsPerDay;
  final List<String> interests;
  final String optimizeFor;     // time | distance

  const TripSetupParams({
    this.clusterIds = const [],
    this.tripType,
    this.groupType,
    this.transportMode,
    this.budget = 0,
    this.days = 1,
    this.hoursPerDay = 8,
    this.maxStopsPerDay = 4,
    this.interests = const [],
    this.optimizeFor = 'time',
  });

  TripSetupParams copyWith({
    List<String>? clusterIds,
    String? tripType,
    String? groupType,
    String? transportMode,
    double? budget,
    int? days,
    double? hoursPerDay,
    int? maxStopsPerDay,
    List<String>? interests,
    String? optimizeFor,
  }) {
    return TripSetupParams(
      clusterIds: clusterIds ?? this.clusterIds,
      tripType: tripType ?? this.tripType,
      groupType: groupType ?? this.groupType,
      transportMode: transportMode ?? this.transportMode,
      budget: budget ?? this.budget,
      days: days ?? this.days,
      hoursPerDay: hoursPerDay ?? this.hoursPerDay,
      maxStopsPerDay: maxStopsPerDay ?? this.maxStopsPerDay,
      interests: interests ?? this.interests,
      optimizeFor: optimizeFor ?? this.optimizeFor,
    );
  }

  Map<String, dynamic> toGenerateBody(double startLat, double startLon) {
    return {
      'start': {'lat': startLat, 'lon': startLon},
      'days': days,
      'hours_per_day': hoursPerDay,
      'available_hours': hoursPerDay,
      'budget': budget,
      'interests': interests,
      'max_stops': maxStopsPerDay,
      'optimize_for': optimizeFor,
      'cluster_ids': clusterIds,
      'group_type': groupType,
      'trip_type': tripType,
      'transport_mode': transportMode,
    };
  }
}
