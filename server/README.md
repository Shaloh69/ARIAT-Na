# ARIAT-NA Server API

Backend API server for the ARIAT-NA travel planning system. Built with Node.js, Express, TypeScript, and MySQL.

## 🚀 Quick Start

### Prerequisites
- Node.js v18 or higher
- MySQL 8.0 or higher
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and configuration
   ```

3. **Set up MySQL database:**
   ```bash
   # Create database and run schema
   npm run db:init

   # Seed initial data (admin user, categories, intersections, etc.)
   npm run db:seed
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

## 📁 Project Structure

```
server/
├── src/
│   ├── config/
│   │   ├── database.ts          # MySQL connection pool
│   │   └── env.ts                # Environment configuration
│   ├── controllers/
│   │   ├── auth.controller.ts    # Authentication logic
│   │   ├── category.controller.ts # Category CRUD
│   │   └── destination.controller.ts # Destination CRUD
│   ├── database/
│   │   ├── init.ts               # Database initialization script
│   │   ├── schema.sql            # MySQL schema
│   │   └── seed.ts               # Data seeding script
│   ├── middleware/
│   │   ├── auth.middleware.ts    # JWT authentication
│   │   ├── error.middleware.ts   # Error handling
│   │   └── validation.middleware.ts # Request validation
│   ├── routes/
│   │   ├── auth.routes.ts        # Auth endpoints
│   │   ├── category.routes.ts    # Category endpoints
│   │   └── destination.routes.ts # Destination endpoints
│   ├── types/
│   │   └── index.ts              # TypeScript interfaces
│   ├── utils/
│   │   ├── auth.ts               # JWT utilities
│   │   ├── logger.ts             # Winston logger
│   │   └── validators.ts         # Express validators
│   └── app.ts                    # Express app entry point
├── public/
│   └── intersection_points.geojson # Road network data
├── .env                          # Environment variables
├── .env.example                  # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## 🗄️ Database Setup

### Manual Setup

```bash
# 1. Create MySQL database
mysql -u root -p
CREATE DATABASE ariat_na;
exit;

# 2. Run initialization script
npm run db:init

# 3. Seed data
npm run db:seed
```

### Database Schema

The system includes the following tables:
- **users** - Flutter app users
- **admins** - Web console administrators
- **refresh_tokens** - JWT refresh tokens
- **categories** - Destination categories
- **destinations** - Tourist destinations
- **intersections** - Road network nodes (from GeoJSON)
- **fare_configs** - Transportation fare settings
- **itineraries** - User saved itineraries
- **itinerary_destinations** - Itinerary-destination relationships
- **reviews** - User destination reviews
- **favorite_destinations** - User favorites

## 🔐 Authentication

### Two Authentication Systems

1. **User Authentication (Flutter App)**
   - Register: `POST /api/v1/auth/user/register`
   - Login: `POST /api/v1/auth/user/login`
   - Get Profile: `GET /api/v1/auth/user/me`

2. **Admin Authentication (Web Console)**
   - Login: `POST /api/v1/auth/admin/login`
   - Get Profile: `GET /api/v1/auth/admin/me`

### Default Admin Credentials
```
Email: admin@airat-na.com
Password: Admin123!
```
**⚠️ Change these credentials immediately in production!**

### JWT Token Flow

1. Login returns `accessToken` (7 days) and `refreshToken` (30 days)
2. Include `accessToken` in requests: `Authorization: Bearer <token>`
3. Refresh expired tokens: `POST /api/v1/auth/refresh`
4. Logout: `POST /api/v1/auth/logout` (revokes refresh token)

## 📡 API Endpoints

### Authentication Endpoints

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/auth/user/register` | Public | Register new user |
| POST | `/api/v1/auth/user/login` | Public | User login |
| GET | `/api/v1/auth/user/me` | User | Get current user |
| POST | `/api/v1/auth/admin/login` | Public | Admin login |
| GET | `/api/v1/auth/admin/me` | Admin | Get current admin |
| POST | `/api/v1/auth/refresh` | Public | Refresh access token |
| POST | `/api/v1/auth/logout` | Public | Logout (revoke token) |
| POST | `/api/v1/auth/logout-all` | Auth | Logout from all devices |

### Destination Endpoints

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/v1/destinations` | Public | List all destinations |
| GET | `/api/v1/destinations/featured` | Public | Featured destinations |
| GET | `/api/v1/destinations/popular` | Public | Popular destinations |
| GET | `/api/v1/destinations/:id` | Public | Get single destination |
| POST | `/api/v1/destinations` | Admin | Create destination |
| PUT | `/api/v1/destinations/:id` | Admin | Update destination |
| DELETE | `/api/v1/destinations/:id` | Admin | Delete destination |

### Category Endpoints

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/v1/categories` | Public | List all categories |
| GET | `/api/v1/categories/:id` | Public | Get single category |
| POST | `/api/v1/categories` | Admin | Create category |
| PUT | `/api/v1/categories/:id` | Admin | Update category |
| DELETE | `/api/v1/categories/:id` | Admin | Delete category |

### GeoJSON Data

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/v1/intersections/geojson` | Public | Get all intersection points |

## 📝 Request Examples

### User Registration
```bash
POST /api/v1/auth/user/register
Content-Type: application/json

{
  "email": "tourist@example.com",
  "password": "SecurePass123!",
  "full_name": "John Doe",
  "phone_number": "+639123456789"
}
```

### User Login
```bash
POST /api/v1/auth/user/login
Content-Type: application/json

{
  "email": "tourist@example.com",
  "password": "SecurePass123!"
}
```

### Get Destinations (with filters)
```bash
GET /api/v1/destinations?page=1&limit=20&category=UUID&minRating=4&featured=true
```

### Create Destination (Admin)
```bash
POST /api/v1/destinations
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "Magellan's Cross",
  "description": "Historic Christian cross planted in 1521",
  "category_id": "category-uuid",
  "latitude": 10.293611,
  "longitude": 123.902778,
  "address": "Magallanes St, Cebu City",
  "images": [
    "https://example.com/image1.jpg",
    "https://example.com/image2.jpg"
  ],
  "operating_hours": {
    "monday": { "open": "08:00", "close": "17:00" },
    "tuesday": { "open": "08:00", "close": "17:00" }
  },
  "entrance_fee_local": 0,
  "entrance_fee_foreign": 0,
  "average_visit_duration": 30,
  "amenities": ["Parking", "Restrooms"],
  "is_featured": true
}
```

## 🗂️ GeoJSON Data Storage

The intersection points are stored in **two places**:

1. **File System** (`public/intersection_points.geojson`):
   - Served via `/api/v1/intersections/geojson`
   - Used for initial data loading
   - 88 road intersection points in Cebu Province

2. **MySQL Database** (`intersections` table):
   - Imported during seed process
   - Queryable and modifiable via SQL
   - Linked to destinations via `nearest_intersection_id`

### GeoJSON Structure
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "name": "int1",
        "id": "int1",
        "isDestination": false
      },
      "geometry": {
        "type": "Point",
        "coordinates": [123.9798952, 10.2604043]
      }
    }
  ]
}
```

## 🔧 NPM Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm start            # Run production server
npm run db:init      # Initialize database (create schema)
npm run db:seed      # Seed database with initial data
```

## 🌍 Environment Variables

See `.env.example` for all configuration options:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=ariat_na

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Admin
ADMIN_EMAIL=admin@airat-na.com
ADMIN_PASSWORD=Admin123!

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:8080
```

## 📦 Seeded Data

After running `npm run db:seed`, you'll have:

- ✅ 1 Super Admin user
- ✅ 8 Categories (Beaches, Historical Sites, Nature & Parks, etc.)
- ✅ 88 Intersection points from GeoJSON
- ✅ 5 Fare configurations (Jeepney, Taxi, Grab, Tricycle, Bus)
- ✅ 3 Sample destinations (Magellan's Cross, Basilica, Fort San Pedro)

## 🛡️ Security Features

- ✅ JWT authentication (access + refresh tokens)
- ✅ Password hashing with bcrypt
- ✅ Helmet.js security headers
- ✅ CORS configuration
- ✅ Rate limiting (100 requests per 15 minutes)
- ✅ Request validation with express-validator
- ✅ SQL injection protection (parameterized queries)
- ✅ Error handling and logging

## 📊 Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message"
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## 🚧 Future Endpoints (To Be Implemented)

- [ ] **Route Optimization** - `POST /api/v1/routes/optimize`
- [ ] **Fare Calculation** - `POST /api/v1/fares/calculate`
- [ ] **Itineraries** - CRUD for user itineraries
- [ ] **Reviews** - User reviews for destinations
- [ ] **Favorites** - Save favorite destinations
- [ ] **Analytics** - Admin dashboard statistics

## 🧪 Testing

```bash
# Install testing dependencies
npm install --save-dev jest supertest @types/jest @types/supertest

# Run tests (to be configured)
npm test
```

## 📝 Development Notes

- Use `asyncHandler` wrapper for all async route handlers
- All dates are stored in UTC
- JSON fields in MySQL: `images`, `operating_hours`, `amenities`, `optimized_route`
- Soft deletes not implemented - use `is_active` flag instead
- File uploads not yet implemented (use external URLs for images)

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/new-feature`
2. Make changes and test
3. Commit: `git commit -m "Add new feature"`
4. Push: `git push origin feature/new-feature`
5. Create pull request

## 📄 License

MIT License - see LICENSE file for details

---

**Built with ❤️ for ARIAT-NA Travel Planning System**
