class Destination {
  final String id;
  final String name;
  final String? description;
  final String? categoryName;
  final String? categorySlug;
  final double latitude;
  final double longitude;
  final String? address;
  final List<String> images;
  final double entranceFeeLocal;
  final double entranceFeeForeign;
  final int averageVisitDuration;
  final String? bestTimeToVisit;
  final double rating;
  final int reviewCount;
  final List<String> amenities;
  final bool isFeatured;
  final bool isActive;

  Destination({
    required this.id,
    required this.name,
    this.description,
    this.categoryName,
    this.categorySlug,
    required this.latitude,
    required this.longitude,
    this.address,
    this.images = const [],
    this.entranceFeeLocal = 0,
    this.entranceFeeForeign = 0,
    this.averageVisitDuration = 0,
    this.bestTimeToVisit,
    this.rating = 0,
    this.reviewCount = 0,
    this.amenities = const [],
    this.isFeatured = false,
    this.isActive = true,
  });

  factory Destination.fromJson(Map<String, dynamic> json) {
    return Destination(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'],
      categoryName: json['category_name'],
      categorySlug: json['category_slug'],
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
      address: json['address'],
      images: (json['images'] as List?)?.cast<String>() ?? [],
      entranceFeeLocal: (json['entrance_fee_local'] as num?)?.toDouble() ?? 0,
      entranceFeeForeign: (json['entrance_fee_foreign'] as num?)?.toDouble() ?? 0,
      averageVisitDuration: json['average_visit_duration'] ?? 0,
      bestTimeToVisit: json['best_time_to_visit'],
      rating: (json['rating'] as num?)?.toDouble() ?? 0,
      reviewCount: json['review_count'] ?? 0,
      amenities: (json['amenities'] as List?)?.cast<String>() ?? [],
      isFeatured: json['is_featured'] ?? false,
      isActive: json['is_active'] ?? true,
    );
  }

  String? get primaryImage => images.isNotEmpty ? images.first : null;
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
