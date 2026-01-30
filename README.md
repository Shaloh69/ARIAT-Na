# AIRAT-NA: Smart Tourist Guide and Fare Estimation System

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react)](https://reactjs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.x-000000?logo=next.js)](https://nextjs.org/)
[![Flutter](https://img.shields.io/badge/Flutter-3.x-02569B?logo=flutter)](https://flutter.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?logo=node.js)](https://nodejs.org/)

> An AI-powered tourism assistant providing transparent fare estimation, route optimization, and comprehensive travel guidance for Cebu Province, Philippines.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Development](#development)
- [Research Background](#research-background)
- [Contributors](#contributors)
- [License](#license)

---

## 🌟 Overview

**AIRAT-NA (Artificial Intelligence Route and Travel – Navigation Assistance)** is a comprehensive smart tourism system designed to address transportation challenges faced by tourists visiting Cebu Province. The system combines AI-powered route optimization with transparent fare estimation to provide tourists with reliable, fair, and efficient travel planning.

### The Problem

Tourists in Cebu Province face several challenges:
- ❌ Unclear and inconsistent transportation fares
- ❌ Risk of overcharging by local operators
- ❌ Difficulty navigating between destinations
- ❌ Lack of integrated travel information
- ❌ Information asymmetry about local transport options

### The Solution

AIRAT-NA provides:
- ✅ Transparent, upfront fare estimates
- ✅ AI-optimized travel routes (nearest-to-farthest sequencing)
- ✅ Comprehensive destination database
- ✅ Multiple transportation mode options
- ✅ Mobile-friendly itinerary export via QR code
- ✅ Interactive map visualization

---

## ✨ Features

### 🗺️ Destination Discovery
- Browse 100+ tourist destinations across Cebu Province
- Filter by region: Cebu City, North Cebu, South Cebu, Cordova, Lapu-Lapu City
- Filter by category: Beach, Resort, Hotel, Mall, Landmark, Natural Attractions
- Real-time search with autocomplete
- AI-generated recommendations based on selected areas

### 🤖 AI-Powered Route Optimization
- Automatically sequences up to 10 destinations
- Minimizes travel time and distance
- Starts routing from Mactan International Airport
- Considers available transportation options
- Reduces backtracking and inefficient routes

### 💰 Transparent Fare Estimation
- Real-time fare calculations based on:
  - Base fare by transport type
  - Per-kilometer rates
  - Actual route distances
- Supports multiple transport modes:
  - 🚕 Taxi
  - 🚌 Bus
  - 🚐 Jeepney/Van
  - 🛺 Tricycle
- Detailed fare breakdown (base + distance charge)

### 📱 Mobile App Integration
- **Promotional Kiosk**: Displays QR code to download Flutter mobile app
- **Flutter Mobile App**: Full-featured travel companion for on-the-go planning
- Offline itinerary access
- Real-time navigation support
- Save multiple itineraries

### 🗺️ Interactive Mapping
- Powered by GeoJSON data
- Visual route display with waypoints
- Zoom and pan controls
- Distance markers between destinations
- Route overview per travel leg

### 📄 Itinerary Export
- Generate QR codes containing complete trip details
- Scan-to-save functionality for mobile devices
- Includes all destinations, fares, distances, and transport modes
- Shareable itineraries

---

## 🏗️ System Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    AIRAT-NA ECOSYSTEM                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐          ┌──────────────┐                │
│  │   KIOSK WEB  │          │  FLUTTER APP │                │
│  │   (Next.js)  │◄────────►│  (Mobile)    │                │
│  │              │  QR Code  │              │                │
│  │ - Promotion  │          │ - Full Guide │                │
│  │ - QR Display │          │ - Navigation │                │
│  └──────┬───────┘          └──────┬───────┘                │
│         │                          │                         │
│         │                          │                         │
│         └──────────┬───────────────┘                        │
│                    │                                         │
│         ┌──────────▼──────────┐                            │
│         │   API SERVER        │                            │
│         │   (Node/Express)    │                            │
│         │                     │                            │
│         │ - Route Calculation │                            │
│         │ - Fare Estimation   │                            │
│         │ - GeoJSON Processing│                            │
│         └──────────┬──────────┘                            │
│                    │                                         │
│         ┌──────────▼──────────┐                            │
│         │   DATABASE          │                            │
│         │   (PostgreSQL/JSON) │                            │
│         │                     │                            │
│         │ - Destinations      │                            │
│         │ - Routes (GeoJSON)  │                            │
│         │ - Fares             │                            │
│         │ - Transport Options │                            │
│         └─────────────────────┘                            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Architecture
```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Kiosk Display  │      │  Web Browser    │      │  Mobile Device  │
│  (Raspberry Pi) │      │  (Tourist)      │      │  (iOS/Android)  │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │
                        ┌──────────▼───────────┐
                        │   Cloud Server       │
                        │   (Next.js/Express)  │
                        └──────────────────────┘
```

---

## 🛠️ Technology Stack

### Frontend - Web Kiosk (Promotional Display)

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 14.x | React framework for server-side rendering |
| **React** | 18.x | UI component library |
| **TypeScript** | 5.x | Type-safe JavaScript |
| **Tailwind CSS** | 3.x | Utility-first CSS framework |
| **Leaflet.js** | 1.9.x | Interactive maps |
| **React-Leaflet** | 4.x | React components for Leaflet |
| **QRCode.react** | 3.x | QR code generation |

### Mobile App (Main Application)

| Technology | Version | Purpose |
|------------|---------|---------|
| **Flutter** | 3.x | Cross-platform mobile framework |
| **Dart** | 3.x | Programming language for Flutter |
| **flutter_map** | 6.x | Map display widget |
| **http** | 1.x | HTTP requests |
| **provider** | 6.x | State management |
| **qr_flutter** | 4.x | QR code generation |
| **shared_preferences** | 2.x | Local data persistence |

### Backend API

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 18.x | JavaScript runtime |
| **Express.js** | 4.x | Web application framework |
| **PostgreSQL** | 15.x | Relational database (optional) |
| **GeoJSON** | - | Geographic data format |
| **Turf.js** | 6.x | Geospatial analysis library |
| **CORS** | 2.x | Cross-origin resource sharing |
| **dotenv** | 16.x | Environment configuration |

### Hardware (Kiosk)

| Component | Specification |
|-----------|--------------|
| **Processing** | Raspberry Pi 4 Model B (4GB RAM) |
| **Display** | 7" Capacitive Touchscreen (800×480) |
| **Storage** | 32/64GB microSD Card |
| **Power** | 5V 3A USB-C Adapter |
| **Enclosure** | Custom kiosk stand (115cm height) |

### Development Tools

| Tool | Purpose |
|------|---------|
| **Git** | Version control |
| **Figma** | UI/UX design |
| **VS Code** | Code editor |
| **Postman** | API testing |
| **Android Studio** | Flutter development |

---

## 📁 Project Structure
```
AIRAT-NA/
├── client/
│   ├── ariat_app/                  # Flutter Mobile Application
│   │   ├── lib/
│   │   │   ├── main.dart           # App entry point
│   │   │   ├── models/             # Data models
│   │   │   ├── services/           # API services
│   │   │   ├── screens/            # App screens
│   │   │   ├── widgets/            # Reusable components
│   │   │   └── utils/              # Helper functions
│   │   ├── android/                # Android configuration
│   │   ├── ios/                    # iOS configuration
│   │   ├── pubspec.yaml            # Flutter dependencies
│   │   └── README.md
│   │
│   └── ariat_web/                  # Next.js Web Kiosk (Promotional)
│       ├── app/                    # Next.js 14 app directory
│       │   ├── page.tsx            # Home page (QR display)
│       │   ├── layout.tsx          # Root layout
│       │   └── api/                # API routes
│       ├── components/             # React components
│       │   ├── DestinationCard.tsx
│       │   ├── QRDisplay.tsx       # Promotional QR code
│       │   └── MapView.tsx
│       ├── public/                 # Static assets
│       ├── styles/                 # Global styles
│       ├── lib/                    # Utilities
│       ├── types/                  # TypeScript types
│       ├── next.config.js
│       ├── tailwind.config.js
│       ├── package.json
│       └── README.md
│
├── server/                         # Node.js/Express Backend
│   ├── src/
│   │   ├── controllers/            # Request handlers
│   │   │   ├── destinationController.js
│   │   │   ├── routeController.js
│   │   │   └── fareController.js
│   │   ├── models/                 # Data models
│   │   ├── routes/                 # API routes
│   │   │   ├── destinations.js
│   │   │   ├── routes.js
│   │   │   └── fares.js
│   │   ├── services/               # Business logic
│   │   │   ├── routeOptimizer.js   # AI route sequencing
│   │   │   ├── fareCalculator.js
│   │   │   └── geoService.js       # GeoJSON processing
│   │   ├── middleware/             # Express middleware
│   │   ├── utils/                  # Helper functions
│   │   ├── config/                 # Configuration
│   │   │   ├── database.js
│   │   │   └── constants.js
│   │   └── app.js                  # Express app setup
│   ├── data/
│   │   ├── destinations.json       # Destination database
│   │   ├── routes.geojson          # Route geometries
│   │   ├── fares.json              # Fare matrices
│   │   └── transport.json          # Transport options
│   ├── .env.example                # Environment template
│   ├── package.json
│   └── README.md
│
├── docs/                           # Documentation
│   ├── API.md                      # API documentation
│   ├── SETUP.md                    # Setup instructions
│   ├── DEPLOYMENT.md               # Deployment guide
│   └── thesis/                     # Research papers
│       └── AIRAT-NA_manuscript.pdf
│
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🚀 Installation

### Prerequisites

- **Node.js** 18.x or higher
- **Flutter** 3.x SDK
- **Git**
- **PostgreSQL** (optional, can use JSON files)
- **Raspberry Pi 4** (for kiosk deployment)

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/AIRAT-NA.git
cd AIRAT-NA
```

### 2. Backend Setup
```bash
cd server
npm install

# Create environment file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start development server
npm run dev
```

**Environment Variables (.env):**
```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/airat_na
CORS_ORIGIN=http://localhost:3000
API_KEY=your_api_key_here
```

### 3. Web Kiosk Setup (Next.js)
```bash
cd client/ariat_web
npm install

# Create environment file
cp .env.local.example .env.local

# Edit with your API endpoint
nano .env.local

# Start development server
npm run dev
```

**Environment Variables (.env.local):**
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_APP_DOWNLOAD_URL=https://yourapp.com/download
```

### 4. Flutter App Setup
```bash
cd client/ariat_app

# Get dependencies
flutter pub get

# Run on connected device/emulator
flutter run

# Build APK
flutter build apk --release
```

**Configuration (lib/config/api_config.dart):**
```dart
class ApiConfig {
  static const String baseUrl = 'http://your-api-server.com/api';
  static const String apiVersion = 'v1';
}
```

---

## 💻 Usage

### Running the Complete System

1. **Start the Backend API:**
```bash
   cd server
   npm run dev
```
   API will run on `http://localhost:5000`

2. **Start the Web Kiosk (Promotional):**
```bash
   cd client/ariat_web
   npm run dev
```
   Kiosk interface will run on `http://localhost:3000`

3. **Run the Flutter Mobile App:**
```bash
   cd client/ariat_app
   flutter run
```

### Kiosk Mode (Promotional Display)

The web kiosk serves as a **promotional interface** that:
- Displays information about the AIRAT-NA system
- Shows featured destinations and system capabilities
- **Prominently displays a QR code** for users to download the full Flutter mobile app
- Provides a "taste" of the system's features
- Encourages tourists to download the mobile app for complete functionality

**To run in kiosk fullscreen mode:**
```bash
npm run build
npm start

# For Raspberry Pi
chromium-browser --kiosk --app=http://localhost:3000
```

### Mobile App (Primary User Interface)

The Flutter app provides the **complete AIRAT-NA experience**:
- Full destination browsing and filtering
- AI-powered itinerary planning
- Fare estimation and route optimization
- Offline itinerary access
- Turn-by-turn navigation integration
- Save and manage multiple trips

---

## 📡 API Documentation

### Base URL
```
http://localhost:5000/api/v1
```

### Endpoints

#### **Destinations**

**GET** `/destinations`
- Get all destinations with optional filters
- Query params: `?region=cebu-city&category=beach&search=malapascua`

**GET** `/destinations/:id`
- Get single destination details

**POST** `/destinations/recommend`
- Get AI-recommended destinations based on user preferences
- Body: `{ "region": "cebu-city", "interests": ["beach", "diving"] }`

#### **Routes**

**POST** `/routes/optimize`
- Get optimized route for multiple destinations
- Body:
```json
  {
    "start": "Mactan International Airport",
    "destinations": ["Destination 1", "Destination 2", "Destination 3"],
    "preferences": {
      "optimize_for": "distance" // or "time"
    }
  }
```
- Response includes sequenced route with distances and travel times

**GET** `/routes/geojson/:routeId`
- Get GeoJSON geometry for route visualization

#### **Fares**

**POST** `/fares/estimate`
- Calculate fare for a route
- Body:
```json
  {
    "from": "Location A",
    "to": "Location B",
    "transport_type": "taxi", // taxi, jeepney, van, bus, tricycle
    "distance_km": 15.5
  }
```
- Response:
```json
  {
    "base_fare": 40,
    "distance_charge": 155,
    "total_fare": 195,
    "transport_type": "taxi",
    "currency": "PHP"
  }
```

**GET** `/fares/transport-options`
- Get available transport types with base rates

#### **Itinerary**

**POST** `/itinerary/generate`
- Generate complete itinerary with routes and fares
- Body:
```json
  {
    "destinations": ["Dest1", "Dest2", "Dest3"],
    "transport_preferences": {
      "Dest1->Dest2": "taxi",
      "Dest2->Dest3": "van"
    }
  }
```

**GET** `/itinerary/qr/:itineraryId`
- Get QR code data for saved itinerary

For complete API documentation, see [docs/API.md](docs/API.md)

---

## 🧑‍💻 Development

### Project Development Workflow
```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create pull request
git push origin feature/your-feature-name
```

### Code Style

- **TypeScript/JavaScript:** ESLint + Prettier
- **Dart:** Flutter official style guide
- **Commits:** Conventional Commits format

### Testing
```bash
# Backend tests
cd server
npm test

# Frontend tests
cd client/ariat_web
npm test

# Flutter tests
cd client/ariat_app
flutter test
```

### Building for Production

**Backend:**
```bash
npm run build
npm run start:prod
```

**Web Kiosk:**
```bash
npm run build
npm start
```

**Flutter APK:**
```bash
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk
```

**Flutter iOS:**
```bash
flutter build ios --release
```

---

## 🎓 Research Background

This system was developed as a thesis project for the Bachelor of Science in Computer Engineering program at the University of Cebu Lapu-Lapu and Mandaue.

### Research Team

- **Joshua E. Jumao-as** - Lead Researcher
- **Catherine Faye M. Montajes** - Co-Researcher
- **Xydric Cleve V. Niere** - Co-Researcher

**Adviser:** Engr. Diego V. Abad Jr.

### Theoretical Framework

The system design is grounded in:

1. **UTAUT2** (Unified Theory of Acceptance and Use of Technology 2)
   - Analyzes user adoption factors
   - Measures perceived usefulness and ease of use

2. **Information Asymmetry Theory**
   - Addresses knowledge gaps in fare pricing
   - Promotes transparency in tourism services

3. **DeLone & McLean IS Success Model**
   - Evaluates system quality and effectiveness
   - Measures user satisfaction and net benefits

4. **Route Optimization Theory**
   - AI-based nearest-neighbor sequencing
   - Minimizes total travel distance

### Research Methodology

- **Design:** Quantitative research
- **Respondents:** 35 participants
  - 10 local tourists
  - 10 foreign tourists
  - 10 Lapu-Lapu City Tourism Office personnel
  - 5 local transportation operators
- **Instruments:** Survey questionnaire, structured interviews
- **Analysis:** Descriptive statistics, weighted means

### Key Findings

- **Mean satisfaction:** 3.68/4.0 (Strongly Agree)
- **Top desired features:**
  - Fare estimation (3.77)
  - Transportation mode suggestions (3.74)
  - Clear route guidance (3.71)
- **Primary challenges addressed:**
  - Unclear fare structures (Mean: 2.70)
  - Difficulty finding reliable transport (Mean: 2.85)
  - Risk of overcharging

For the complete research paper, see [docs/thesis/AIRAT-NA_manuscript.pdf](docs/thesis/AIRAT-NA_manuscript.pdf)

---

## 👥 Contributors

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/joshuajumaoas">
        <img src="https://github.com/joshuajumaoas.png" width="100px;" alt="Joshua Jumao-as"/>
        <br />
        <sub><b>Joshua E. Jumao-as</b></sub>
      </a>
      <br />
      <sub>Lead Developer</sub>
    </td>
    <td align="center">
      <a href="https://github.com/catherinemontajes">
        <img src="https://github.com/catherinemontajes.png" width="100px;" alt="Catherine Montajes"/>
        <br />
        <sub><b>Catherine Faye M. Montajes</b></sub>
      </a>
      <br />
      <sub>Backend & Database</sub>
    </td>
    <td align="center">
      <a href="https://github.com/xydricniere">
        <img src="https://github.com/xydricniere.png" width="100px;" alt="Xydric Niere"/>
        <br />
        <sub><b>Xydric Cleve V. Niere</b></sub>
      </a>
      <br />
      <sub>Frontend & Mobile</sub>
    </td>
  </tr>
</table>

### Acknowledgments

- **Engr. Diego V. Abad Jr.** - Research Adviser
- **Miss Catherine Rivera** - Research Instructor
- **Dr. Roland Fernandez** - Dean, College of Engineering
- **Lapu-Lapu City Tourism Office** - Research support
- **Mactan-Cebu International Airport Authority (MCIAA)** - Deployment permission
- **Survey Respondents** - Valuable feedback and insights

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📞 Contact & Support

### Project Links

- **GitHub Repository:** https://github.com/yourusername/AIRAT-NA
- **Documentation:** https://docs.airat-na.com
- **Issue Tracker:** https://github.com/yourusername/AIRAT-NA/issues

### Contact Information

- **Email:** jumaoas.joshua322@gmail.com
- **Institution:** University of Cebu Lapu-Lapu and Mandaue
- **Location:** Mandaue City, Cebu, Philippines

### Reporting Issues

Found a bug or have a feature request? Please open an issue on GitHub:
```
https://github.com/yourusername/AIRAT-NA/issues/new
```

---

## 🗺️ Roadmap

### Current Version: v1.0.0 (December 2025)

- [x] Core destination database (100+ locations)
- [x] AI route optimization algorithm
- [x] Fare estimation engine
- [x] Web kiosk promotional interface
- [x] Flutter mobile app (MVP)
- [x] QR code itinerary export
- [x] GeoJSON route visualization

### Planned Features (v2.0)

- [ ] Real-time traffic integration
- [ ] Multi-language support (English, Cebuano, Mandarin, Korean)
- [ ] User accounts and saved preferences
- [ ] Hotel/accommodation booking integration
- [ ] Weather-aware recommendations
- [ ] Offline map data for mobile app
- [ ] Voice-guided navigation
- [ ] Accessibility features (screen reader support)

### Future Enhancements (v3.0+)

- [ ] AR navigation overlay
- [ ] Social features (share itineraries, reviews)
- [ ] Integration with Grab/local ride-sharing
- [ ] Tourist emergency assistance
- [ ] Events and festivals calendar
- [ ] Restaurant and dining recommendations
- [ ] Machine learning for personalized suggestions

---

## 📊 Project Statistics

![Lines of Code](https://img.shields.io/badge/Lines%20of%20Code-50k%2B-blue)
![Destinations](https://img.shields.io/badge/Destinations-100%2B-green)
![Transport Options](https://img.shields.io/badge/Transport%20Options-5-orange)
![Coverage Area](https://img.shields.io/badge/Coverage-Cebu%20Province-red)

---

## 🙏 Special Thanks

This project would not have been possible without the support of:

- The University of Cebu Lapu-Lapu and Mandaue College of Engineering
- The Department of Tourism - Central Visayas
- The Lapu-Lapu City Government
- The tourism industry stakeholders of Cebu Province
- All survey participants who provided valuable insights

---

<div align="center">

**Made with ❤️ for Cebu Tourism**

*Empowering tourists with transparent, intelligent travel guidance*

[⬆ Back to Top](#airat-na-smart-tourist-guide-and-fare-estimation-system)

</div>
