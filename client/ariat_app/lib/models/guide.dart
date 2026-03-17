class CuratedGuide {
  final String id;
  final String title;
  final String slug;
  final String? description;
  final String? coverImage;
  final List<String> tags;
  final List<String> clusters;
  final List<String> interests;
  final String? durationLabel;
  final int days;
  final String difficulty; // easy | moderate | challenging
  final bool isFeatured;
  final List<String> destinationIds;

  CuratedGuide({
    required this.id,
    required this.title,
    required this.slug,
    this.description,
    this.coverImage,
    this.tags = const [],
    this.clusters = const [],
    this.interests = const [],
    this.durationLabel,
    this.days = 1,
    this.difficulty = 'easy',
    this.isFeatured = false,
    this.destinationIds = const [],
  });

  factory CuratedGuide.fromJson(Map<String, dynamic> json) {
    List<String> parseList(dynamic v) {
      if (v is List) return v.cast<String>();
      if (v is String && v.isNotEmpty) {
        try {
          // Already-parsed JSON arrays arrive as List from Dart's JSON decoder
          return <String>[];
        } catch (_) {
          return <String>[];
        }
      }
      return <String>[];
    }

    return CuratedGuide(
      id: json['id'] ?? '',
      title: json['title'] ?? '',
      slug: json['slug'] ?? '',
      description: json['description'],
      coverImage: json['cover_image'],
      tags: parseList(json['tags']),
      clusters: parseList(json['clusters']),
      interests: parseList(json['interests']),
      durationLabel: json['duration_label'],
      days: json['days'] ?? 1,
      difficulty: json['difficulty'] ?? 'easy',
      isFeatured: json['is_featured'] == true || json['is_featured'] == 1,
      destinationIds: parseList(json['destination_ids']),
    );
  }

  String get difficultyLabel => difficulty == 'challenging' ? 'Challenging' : difficulty == 'moderate' ? 'Moderate' : 'Easy';
  String get dayLabel => days == 1 ? '1 day' : '$days days';
}
