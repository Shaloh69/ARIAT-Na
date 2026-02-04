import { pool } from '../config/database';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Seed the database with initial data
 */
export const seedDatabase = async (): Promise<void> => {
  console.log('🌱 Starting database seeding...');

  try {
    // 1. Seed Admin User
    await seedAdmin();

    // 2. Seed Categories
    await seedCategories();

    // 3. Seed Intersections from GeoJSON
    await seedIntersections();

    // 4. Seed Fare Configs
    await seedFareConfigs();

    // 5. Seed Sample Destinations
    await seedDestinations();

    console.log('✅ Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    throw error;
  }
};

/**
 * Seed admin user
 */
const seedAdmin = async (): Promise<void> => {
  console.log('📝 Seeding admin user...');

  const adminId = uuidv4();
  const hashedPassword = await bcrypt.hash(config.admin.password, 10);

  const sql = `
    INSERT INTO admins (id, email, password_hash, full_name, role, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
  `;

  await pool.execute(sql, [
    adminId,
    config.admin.email,
    hashedPassword,
    'System Administrator',
    'super_admin',
    true,
  ]);

  console.log(`✅ Admin user created: ${config.admin.email}`);
};

/**
 * Seed categories
 */
const seedCategories = async (): Promise<void> => {
  console.log('📝 Seeding categories...');

  const categories = [
    {
      id: uuidv4(),
      name: 'Beaches',
      slug: 'beaches',
      description: 'Beautiful beaches and coastal areas',
      display_order: 1,
    },
    {
      id: uuidv4(),
      name: 'Historical Sites',
      slug: 'historical-sites',
      description: 'Museums, monuments, and historical landmarks',
      display_order: 2,
    },
    {
      id: uuidv4(),
      name: 'Nature & Parks',
      slug: 'nature-parks',
      description: 'Natural attractions, parks, and gardens',
      display_order: 3,
    },
    {
      id: uuidv4(),
      name: 'Adventure & Activities',
      slug: 'adventure-activities',
      description: 'Diving, hiking, water sports, and adventures',
      display_order: 4,
    },
    {
      id: uuidv4(),
      name: 'Religious Sites',
      slug: 'religious-sites',
      description: 'Churches, temples, and spiritual landmarks',
      display_order: 5,
    },
    {
      id: uuidv4(),
      name: 'Shopping & Markets',
      slug: 'shopping-markets',
      description: 'Shopping centers, local markets, and bazaars',
      display_order: 6,
    },
    {
      id: uuidv4(),
      name: 'Food & Restaurants',
      slug: 'food-restaurants',
      description: 'Local cuisine, restaurants, and food destinations',
      display_order: 7,
    },
    {
      id: uuidv4(),
      name: 'Entertainment',
      slug: 'entertainment',
      description: 'Theme parks, shows, and entertainment venues',
      display_order: 8,
    },
  ];

  const sql = `
    INSERT INTO categories (id, name, slug, description, display_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  for (const category of categories) {
    await pool.execute(sql, [
      category.id,
      category.name,
      category.slug,
      category.description,
      category.display_order,
      true,
    ]);
  }

  console.log(`✅ Seeded ${categories.length} categories`);
};

/**
 * Seed intersections from GeoJSON file
 */
const seedIntersections = async (): Promise<void> => {
  console.log('📝 Seeding intersections from GeoJSON...');

  try {
    // Read GeoJSON file
    const geojsonPath = path.join(__dirname, '../../public/intersection_points.geojson');
    const geojsonData = fs.readFileSync(geojsonPath, 'utf-8');
    const geojson = JSON.parse(geojsonData);

    const sql = `
      INSERT INTO intersections (id, name, latitude, longitude, is_destination)
      VALUES (?, ?, ?, ?, ?)
    `;

    let count = 0;
    for (const feature of geojson.features) {
      const { properties, geometry } = feature;
      const [longitude, latitude] = geometry.coordinates;

      await pool.execute(sql, [
        uuidv4(),
        properties.name,
        latitude,
        longitude,
        properties.isDestination || false,
      ]);
      count++;
    }

    console.log(`✅ Seeded ${count} intersections from GeoJSON`);
  } catch (error) {
    console.error('Error reading GeoJSON file:', error);
    console.log('⚠️  Skipping intersection seeding');
  }
};

/**
 * Seed fare configurations
 */
const seedFareConfigs = async (): Promise<void> => {
  console.log('📝 Seeding fare configurations...');

  const fareConfigs = [
    {
      id: uuidv4(),
      transport_type: 'jeepney',
      display_name: 'Jeepney',
      description: 'Traditional Filipino public transport',
      base_fare: 12.00,
      per_km_rate: 1.50,
      minimum_fare: 12.00,
      peak_hour_multiplier: 1.0,
      display_order: 1,
    },
    {
      id: uuidv4(),
      transport_type: 'taxi',
      display_name: 'Taxi',
      description: 'Metered taxi service',
      base_fare: 40.00,
      per_km_rate: 13.50,
      minimum_fare: 40.00,
      peak_hour_multiplier: 1.2,
      display_order: 2,
    },
    {
      id: uuidv4(),
      transport_type: 'grab_car',
      display_name: 'Grab Car',
      description: 'Ride-hailing service',
      base_fare: 50.00,
      per_km_rate: 15.00,
      minimum_fare: 50.00,
      peak_hour_multiplier: 1.5,
      display_order: 3,
    },
    {
      id: uuidv4(),
      transport_type: 'tricycle',
      display_name: 'Tricycle',
      description: 'Short-distance tricycle rides',
      base_fare: 15.00,
      per_km_rate: 8.00,
      minimum_fare: 15.00,
      peak_hour_multiplier: 1.0,
      display_order: 4,
    },
    {
      id: uuidv4(),
      transport_type: 'bus',
      display_name: 'Bus',
      description: 'Long-distance bus service',
      base_fare: 25.00,
      per_km_rate: 2.00,
      minimum_fare: 25.00,
      peak_hour_multiplier: 1.0,
      display_order: 5,
    },
  ];

  const sql = `
    INSERT INTO fare_configs (
      id, transport_type, display_name, description,
      base_fare, per_km_rate, minimum_fare,
      peak_hour_multiplier, is_active, display_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const config of fareConfigs) {
    await pool.execute(sql, [
      config.id,
      config.transport_type,
      config.display_name,
      config.description,
      config.base_fare,
      config.per_km_rate,
      config.minimum_fare,
      config.peak_hour_multiplier,
      true,
      config.display_order,
    ]);
  }

  console.log(`✅ Seeded ${fareConfigs.length} fare configurations`);
};

/**
 * Seed sample destinations
 */
const seedDestinations = async (): Promise<void> => {
  console.log('📝 Seeding sample destinations...');

  // Get category IDs
  const [categories]: any = await pool.execute('SELECT id, slug FROM categories');
  const categoryMap = new Map(categories.map((c: any) => [c.slug, c.id]));

  const destinations = [
    {
      id: uuidv4(),
      name: 'Magellan\'s Cross',
      description: 'A Christian cross planted by Portuguese and Spanish explorers as ordered by Ferdinand Magellan upon arriving in Cebu in 1521.',
      category_id: categoryMap.get('historical-sites'),
      latitude: 10.293611,
      longitude: 123.902778,
      address: 'Magallanes St, Cebu City, 6000 Cebu',
      images: JSON.stringify([
        'https://example.com/magellans-cross-1.jpg',
        'https://example.com/magellans-cross-2.jpg',
      ]),
      operating_hours: JSON.stringify({
        monday: { open: '08:00', close: '17:00' },
        tuesday: { open: '08:00', close: '17:00' },
        wednesday: { open: '08:00', close: '17:00' },
        thursday: { open: '08:00', close: '17:00' },
        friday: { open: '08:00', close: '17:00' },
        saturday: { open: '08:00', close: '17:00' },
        sunday: { open: '08:00', close: '17:00' },
      }),
      entrance_fee_local: 0,
      entrance_fee_foreign: 0,
      average_visit_duration: 30,
      rating: 4.5,
      popularity_score: 95,
      amenities: JSON.stringify(['Parking', 'Restrooms', 'Souvenir Shop']),
    },
    {
      id: uuidv4(),
      name: 'Basilica del Santo Niño',
      description: 'The oldest Roman Catholic church in the Philippines, housing the revered image of Santo Niño de Cebu.',
      category_id: categoryMap.get('religious-sites'),
      latitude: 10.294444,
      longitude: 123.901111,
      address: 'Osmena Blvd, Cebu City, 6000 Cebu',
      images: JSON.stringify([
        'https://example.com/basilica-1.jpg',
        'https://example.com/basilica-2.jpg',
      ]),
      operating_hours: JSON.stringify({
        monday: { open: '06:00', close: '18:00' },
        tuesday: { open: '06:00', close: '18:00' },
        wednesday: { open: '06:00', close: '18:00' },
        thursday: { open: '06:00', close: '18:00' },
        friday: { open: '06:00', close: '18:00' },
        saturday: { open: '06:00', close: '18:00' },
        sunday: { open: '06:00', close: '18:00' },
      }),
      entrance_fee_local: 0,
      entrance_fee_foreign: 0,
      average_visit_duration: 60,
      rating: 4.8,
      popularity_score: 98,
      amenities: JSON.stringify(['Parking', 'Restrooms', 'Museum', 'Gift Shop']),
    },
    {
      id: uuidv4(),
      name: 'Fort San Pedro',
      description: 'A military defense structure built by Spanish conquistadors in the 17th century.',
      category_id: categoryMap.get('historical-sites'),
      latitude: 10.291944,
      longitude: 123.905278,
      address: 'A. Pigafetta Street, Cebu City, 6000 Cebu',
      images: JSON.stringify([
        'https://example.com/fort-san-pedro-1.jpg',
        'https://example.com/fort-san-pedro-2.jpg',
      ]),
      operating_hours: JSON.stringify({
        monday: { open: '08:00', close: '19:00' },
        tuesday: { open: '08:00', close: '19:00' },
        wednesday: { open: '08:00', close: '19:00' },
        thursday: { open: '08:00', close: '19:00' },
        friday: { open: '08:00', close: '19:00' },
        saturday: { open: '08:00', close: '19:00' },
        sunday: { open: '08:00', close: '19:00' },
      }),
      entrance_fee_local: 30,
      entrance_fee_foreign: 30,
      average_visit_duration: 45,
      rating: 4.3,
      popularity_score: 85,
      amenities: JSON.stringify(['Parking', 'Restrooms', 'Garden']),
    },
  ];

  const sql = `
    INSERT INTO destinations (
      id, name, description, category_id, latitude, longitude,
      address, images, operating_hours, entrance_fee_local,
      entrance_fee_foreign, average_visit_duration, rating,
      popularity_score, amenities, is_active, is_featured
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const destination of destinations) {
    await pool.execute(sql, [
      destination.id,
      destination.name,
      destination.description,
      destination.category_id,
      destination.latitude,
      destination.longitude,
      destination.address,
      destination.images,
      destination.operating_hours,
      destination.entrance_fee_local,
      destination.entrance_fee_foreign,
      destination.average_visit_duration,
      destination.rating,
      destination.popularity_score,
      destination.amenities,
      true,
      true,
    ]);
  }

  console.log(`✅ Seeded ${destinations.length} sample destinations`);
};

// Run seeding if executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
