class Destination {
  final String id;
  final String name;
  final String? description;
  final String? categoryName;
  final String? categorySlug;
  final String? clusterId;
  final String? clusterName;
  final String? clusterSlug;
  final String? municipality;
  final double latitude;
  final double longitude;
  final String? address;
  final List<String> images;
  final double entranceFeeLocal;
  final double entranceFeeForeign;
  final int averageVisitDuration;
  final String budgetLevel; // 'budget' | 'mid' | 'premium'
  final List<String> tags;
  final bool familyFriendly;
  final String? bestTimeToVisit;
  final double rating;
  final int reviewCount;
  final List<String> amenities;
  final bool isFeatured;
  final bool isActive;
  final bool isIsland;
  // Contact & social
  final String? contactPhone;
  final String? contactEmail;
  final String? websiteUrl;
  final String? facebookUrl;
  final String? instagramUrl;
  // Restaurant-specific
  final List<String> menuImages;
  final List<String> cuisineTypes;
  final List<String> serviceTypes;
  final int? seatingCapacity;
  // Hotel-specific
  final int? starRating;
  final double? perNightMin;
  final double? perNightMax;
  final double? perHour;
  final String? checkInTime;
  final String? checkOutTime;

  Destination({
    required this.id,
    required this.name,
    this.description,
    this.categoryName,
    this.categorySlug,
    this.clusterId,
    this.clusterName,
    this.clusterSlug,
    this.municipality,
    required this.latitude,
    required this.longitude,
    this.address,
    this.images = const [],
    this.entranceFeeLocal = 0,
    this.entranceFeeForeign = 0,
    this.averageVisitDuration = 0,
    this.budgetLevel = 'mid',
    this.tags = const [],
    this.familyFriendly = false,
    this.bestTimeToVisit,
    this.rating = 0,
    this.reviewCount = 0,
    this.amenities = const [],
    this.isFeatured = false,
    this.isActive = true,
    this.isIsland = false,
    this.contactPhone,
    this.contactEmail,
    this.websiteUrl,
    this.facebookUrl,
    this.instagramUrl,
    this.menuImages = const [],
    this.cuisineTypes = const [],
    this.serviceTypes = const [],
    this.seatingCapacity,
    this.starRating,
    this.perNightMin,
    this.perNightMax,
    this.perHour,
    this.checkInTime,
    this.checkOutTime,
  });

  /// Safe numeric parse: handles both num and String values from the server.
  /// mysql2 may return DECIMAL columns as strings even with decimalNumbers config,
  /// so we always coerce defensively.
  static double _d(dynamic v, [double fallback = 0.0]) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? fallback;
    return fallback;
  }

  static double? _dNull(dynamic v) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }

  factory Destination.fromJson(Map<String, dynamic> json) {
    return Destination(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'],
      categoryName: json['category_name'],
      categorySlug: json['category_slug'],
      clusterId: json['cluster_id'],
      clusterName: json['cluster_name'],
      clusterSlug: json['cluster_slug'],
      municipality: json['municipality'],
      latitude: _d(json['latitude']),
      longitude: _d(json['longitude']),
      address: json['address'],
      images: (json['images'] as List?)?.cast<String>() ?? [],
      entranceFeeLocal: _d(json['entrance_fee_local']),
      entranceFeeForeign: _d(json['entrance_fee_foreign']),
      averageVisitDuration: json['average_visit_duration'] ?? 0,
      budgetLevel: json['budget_level'] ?? 'mid',
      tags: (json['tags'] as List?)?.cast<String>() ?? [],
      familyFriendly: json['family_friendly'] == true || json['family_friendly'] == 1,
      bestTimeToVisit: json['best_time_to_visit'],
      rating: _d(json['rating']),
      reviewCount: json['review_count'] ?? 0,
      amenities: (json['amenities'] as List?)?.cast<String>() ?? [],
      isFeatured: json['is_featured'] == true || json['is_featured'] == 1,
      isActive: json['is_active'] == true || json['is_active'] == 1,
      isIsland: json['is_island'] == true || json['is_island'] == 1,
      contactPhone: json['contact_phone'],
      contactEmail: json['contact_email'],
      websiteUrl: json['website_url'],
      facebookUrl: json['facebook_url'],
      instagramUrl: json['instagram_url'],
      menuImages: (json['menu_images'] as List?)?.cast<String>() ?? [],
      cuisineTypes: (json['cuisine_types'] as List?)?.cast<String>() ?? [],
      serviceTypes: (json['service_types'] as List?)?.cast<String>() ?? [],
      seatingCapacity: json['seating_capacity'] as int?,
      starRating: json['star_rating'] as int?,
      perNightMin: _dNull(json['accommodation_pricing']?['per_night_min']),
      perNightMax: _dNull(json['accommodation_pricing']?['per_night_max']),
      perHour: _dNull(json['accommodation_pricing']?['per_hour']),
      checkInTime: json['check_in_time'],
      checkOutTime: json['check_out_time'],
    );
  }

  String? get primaryImage => images.isNotEmpty ? images.first : null;

  String get areaLabel => municipality ?? clusterName ?? 'Cebu';
  String get budgetLabel => budgetLevel == 'budget' ? 'Budget-friendly' : budgetLevel == 'premium' ? 'Premium' : 'Mid-range';
}

class Cluster {
  final String id;
  final String name;
  final String slug;
  final String regionType; // metro | south | north | islands | west
  final String? description;
  final double? centerLat;
  final double? centerLng;
  final String? recommendedTripLength;
  final int destinationCount;

  Cluster({
    required this.id,
    required this.name,
    required this.slug,
    required this.regionType,
    this.description,
    this.centerLat,
    this.centerLng,
    this.recommendedTripLength,
    this.destinationCount = 0,
  });

  factory Cluster.fromJson(Map<String, dynamic> json) {
    return Cluster(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      slug: json['slug'] ?? '',
      regionType: json['region_type'] ?? 'metro',
      description: json['description'],
      centerLat: Destination._dNull(json['center_lat']),
      centerLng: Destination._dNull(json['center_lng']),
      recommendedTripLength: json['recommended_trip_length'],
      destinationCount: json['destination_count'] ?? 0,
    );
  }
}

class Category {
  final String id;
  final String name;
  final String slug;
  final String? description;
  final String? iconUrl;
  final int destinationCount;

  Category({
    required this.id,
    required this.name,
    required this.slug,
    this.description,
    this.iconUrl,
    this.destinationCount = 0,
  });

  factory Category.fromJson(Map<String, dynamic> json) {
    return Category(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      slug: json['slug'] ?? '',
      description: json['description'],
      iconUrl: json['icon_url'],
      destinationCount: json['destination_count'] ?? 0,
    );
  }
}
