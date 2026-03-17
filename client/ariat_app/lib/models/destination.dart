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
  });

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
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
      address: json['address'],
      images: (json['images'] as List?)?.cast<String>() ?? [],
      entranceFeeLocal: (json['entrance_fee_local'] as num?)?.toDouble() ?? 0,
      entranceFeeForeign: (json['entrance_fee_foreign'] as num?)?.toDouble() ?? 0,
      averageVisitDuration: json['average_visit_duration'] ?? 0,
      budgetLevel: json['budget_level'] ?? 'mid',
      tags: (json['tags'] as List?)?.cast<String>() ?? [],
      familyFriendly: json['family_friendly'] == true || json['family_friendly'] == 1,
      bestTimeToVisit: json['best_time_to_visit'],
      rating: (json['rating'] as num?)?.toDouble() ?? 0,
      reviewCount: json['review_count'] ?? 0,
      amenities: (json['amenities'] as List?)?.cast<String>() ?? [],
      isFeatured: json['is_featured'] == true || json['is_featured'] == 1,
      isActive: json['is_active'] == true || json['is_active'] == 1,
      isIsland: json['is_island'] == true || json['is_island'] == 1,
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
      centerLat: (json['center_lat'] as num?)?.toDouble(),
      centerLng: (json['center_lng'] as num?)?.toDouble(),
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
