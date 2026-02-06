# ARIAT-NA: Aiven + Supabase Setup Guide

Complete guide for deploying your ARIAT-NA travel planning system to production with managed databases and services.

---

## 🎯 Architecture Overview

**Current Setup:**
- MySQL (localhost) for all data storage
- Express.js backend with JWT authentication
- Next.js admin frontend

**Production Setup Options:**

### **Option A: Aiven MySQL Only**
- Use Aiven for managed MySQL database
- Keep existing authentication system
- Simple migration path

### **Option B: Aiven + Supabase (Recommended)**
- **Aiven MySQL**: Main application database
- **Supabase PostgreSQL**: User authentication, reviews, real-time features
- **Supabase Storage**: Image uploads for destinations
- **Supabase Auth**: Built-in authentication for Flutter app

---

## 📋 Option A: Aiven MySQL Setup

### Step 1: Create Aiven Account

1. Visit https://aiven.io
2. Sign up for free account (includes $300 free credits)
3. Verify your email

### Step 2: Create MySQL Service

1. Click **"Create Service"**
2. Select **MySQL** version 8.0
3. Choose your cloud provider:
   - **AWS** (recommended for stability)
   - **Google Cloud** (good global coverage)
   - **Azure** (if using Microsoft ecosystem)
4. Select region closest to your users
5. Choose plan:
   - **Hobbyist** (Free - 1GB storage, limited connections)
   - **Startup-4** ($29/month - 4GB storage, recommended for production)
   - **Business-4** ($89/month - High availability)
6. Service name: `airat-na-mysql`
7. Click **"Create Service"** (takes 5-10 minutes)

### Step 3: Get Connection Details

Once service is running, go to **Overview** tab:

```
Host: airat-na-mysql-yourproject.aivencloud.com
Port: 25060
User: avnadmin
Password: [auto-generated]
Database: defaultdb
SSL Mode: REQUIRED
```

### Step 4: Download SSL Certificate

1. Go to service **Overview** tab
2. Scroll to **Connection information**
3. Click **"Download CA Certificate"**
4. Save as `ca.pem`

```bash
# Create certs directory in your server
mkdir -p /home/user/ARIAT-Na/server/certs
# Move downloaded ca.pem to certs/ca.pem
```

### Step 5: Update Environment Variables

Edit `/home/user/ARIAT-Na/server/.env`:

```bash
# Aiven MySQL Configuration
DB_HOST=airat-na-mysql-yourproject.aivencloud.com
DB_PORT=25060
DB_USER=avnadmin
DB_PASSWORD=your_aiven_password_here
DB_NAME=defaultdb

# SSL Configuration
DB_SSL_CA=/home/user/ARIAT-Na/server/certs/ca.pem
DB_SSL_REJECT_UNAUTHORIZED=true
```

### Step 6: Update Database Connection

Edit `/home/user/ARIAT-Na/server/src/config/database.ts`:

```typescript
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// SSL Configuration for Aiven
const sslConfig = process.env.DB_SSL_CA
  ? {
      ca: fs.readFileSync(path.resolve(process.env.DB_SSL_CA)),
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    }
  : undefined;

// Database connection pool configuration
const poolConfig: mysql.PoolOptions = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ariat_na',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Add SSL configuration
  ssl: sslConfig,
};

// Rest of the file remains the same...
export const pool = mysql.createPool(poolConfig);
```

### Step 7: Import Database Schema

```bash
cd /home/user/ARIAT-Na/server

# Connect to Aiven MySQL using SSL
mysql --host=airat-na-mysql-yourproject.aivencloud.com \
      --port=25060 \
      --user=avnadmin \
      --password=your_password \
      --database=defaultdb \
      --ssl-ca=certs/ca.pem \
      < src/database/schema_v2.sql

# Or using Node.js script:
node -e "
const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
      ca: fs.readFileSync(process.env.DB_SSL_CA),
    },
  });

  const schema = fs.readFileSync('src/database/schema_v2.sql', 'utf8');
  await connection.query(schema);
  console.log('✅ Schema imported successfully');
  await connection.end();
})();
"
```

### Step 8: Test Connection

```bash
cd /home/user/ARIAT-Na/server
npm start

# Should see:
# ✅ Database connected successfully
# Server running on port 5000
```

---

## 📋 Option B: Aiven + Supabase Setup (Recommended)

This option gives you the best of both worlds: Aiven for your core MySQL database and Supabase for modern features.

### Part 1: Aiven MySQL (Follow Option A Steps 1-8)

Complete the Aiven MySQL setup above first.

### Part 2: Supabase Setup

#### Step 1: Create Supabase Project

1. Visit https://supabase.com
2. Sign up with GitHub (free tier: 500MB database, 1GB storage)
3. Click **"New Project"**
4. Fill in:
   - **Name**: `airat-na`
   - **Database Password**: Strong password (save this!)
   - **Region**: Choose closest to your users
   - **Plan**: Free (upgrade to Pro $25/month for production)
5. Click **"Create Project"** (takes 2-3 minutes)

#### Step 2: Get Supabase Credentials

Go to **Project Settings → API**:

```
Project URL: https://your-project.supabase.co
Anon (public) key: eyJh... (safe to use in Flutter app)
Service Role key: eyJh... (SECRET - use only in backend)
```

#### Step 3: Use Supabase for Additional Features

**3a. User Authentication (Alternative to JWT)**

Supabase provides built-in authentication:

```typescript
// Install Supabase JS client
npm install @supabase/supabase-js

// server/src/config/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Use for authentication
export const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
};
```

**3b. Image Storage for Destinations**

```typescript
// Upload destination images
export const uploadDestinationImage = async (file: Buffer, fileName: string) => {
  const { data, error } = await supabase.storage
    .from('destination-images')
    .upload(fileName, file, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw error;

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('destination-images')
    .getPublicUrl(fileName);

  return publicUrl;
};
```

**3c. Real-time Reviews (PostgreSQL)**

Create a reviews table in Supabase for real-time updates:

```sql
-- Run in Supabase SQL Editor
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  destination_id VARCHAR(36) NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  images JSONB,
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read approved reviews
CREATE POLICY "Anyone can read approved reviews"
ON reviews FOR SELECT
USING (is_approved = TRUE);

-- Policy: Users can insert their own reviews
CREATE POLICY "Users can insert reviews"
ON reviews FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

**3d. Real-time Subscriptions (Flutter)**

```dart
// In Flutter app
import 'package:supabase_flutter/supabase_flutter.dart';

// Listen for new reviews
final subscription = supabase
  .from('reviews')
  .stream(primaryKey: ['id'])
  .eq('destination_id', destinationId)
  .eq('is_approved', true)
  .listen((List<Map<String, dynamic>> data) {
    // Update UI with new reviews
    setState(() {
      reviews = data;
    });
  });
```

#### Step 4: Update Environment Variables

```bash
# Add to /home/user/ARIAT-Na/server/.env

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJh...your-anon-key
SUPABASE_SERVICE_KEY=eyJh...your-service-role-key

# Storage Configuration
SUPABASE_STORAGE_BUCKET=destination-images
```

#### Step 5: Update Frontend Environment

```bash
# /home/user/ARIAT-Na/client/ariat_web/.env.local

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...your-anon-key
```

---

## 🔒 Security Best Practices

### 1. Environment Variables

**Never commit .env files to git!**

```bash
# Ensure .env is in .gitignore
echo ".env" >> /home/user/ARIAT-Na/server/.gitignore
echo ".env.local" >> /home/user/ARIAT-Na/client/ariat_web/.gitignore
```

### 2. Database Access

- **Aiven**: Enable IP whitelist in service settings
- **Supabase**: Enable Row Level Security (RLS) on all tables
- Use service role keys only in backend, never in Flutter app

### 3. SSL Certificates

```bash
# Protect SSL certificates
chmod 600 /home/user/ARIAT-Na/server/certs/ca.pem
```

### 4. API Keys Rotation

- Rotate Aiven password every 90 days
- Regenerate Supabase service keys if compromised
- Use Aiven's "Reset password" feature

---

## 🚀 Deployment Checklist

### Pre-deployment

- [ ] Aiven MySQL service created and running
- [ ] SSL certificate downloaded and configured
- [ ] Database schema imported successfully
- [ ] Environment variables updated with Aiven credentials
- [ ] Backend can connect to Aiven MySQL
- [ ] Supabase project created (if using Option B)
- [ ] Supabase authentication configured
- [ ] Storage buckets created

### Testing

```bash
# Test Aiven connection
cd /home/user/ARIAT-Na/server
npm start

# Test API endpoints
curl http://localhost:5000/api/v1/health

# Test database query
curl http://localhost:5000/api/v1/destinations
```

### Production Environment

```bash
# Update .env for production
NODE_ENV=production
DB_HOST=airat-na-mysql-yourproject.aivencloud.com
# ... all other production values

# Build frontend
cd /home/user/ARIAT-Na/client/ariat_web
npm run build

# Start production server
cd /home/user/ARIAT-Na/server
npm run build
npm run start:prod
```

---

## 💰 Cost Estimate

### Option A: Aiven Only

| Service | Plan | Cost |
|---------|------|------|
| Aiven MySQL | Startup-4 | $29/month |
| **Total** | | **$29/month** |

### Option B: Aiven + Supabase

| Service | Plan | Cost |
|---------|------|------|
| Aiven MySQL | Startup-4 | $29/month |
| Supabase | Pro | $25/month |
| **Total** | | **$54/month** |

**Free Tiers:**
- Aiven: $300 credits (3-10 months free)
- Supabase: Free forever (with limitations)

---

## 📚 Additional Resources

### Aiven Documentation
- MySQL SSL Connection: https://docs.aiven.io/docs/products/mysql/howto/connect-with-ssl
- Connection Pooling: https://docs.aiven.io/docs/products/mysql/howto/manage-connection-pooling
- Backup & Restore: https://docs.aiven.io/docs/products/mysql/howto/manage-backups

### Supabase Documentation
- Authentication: https://supabase.com/docs/guides/auth
- Storage: https://supabase.com/docs/guides/storage
- Real-time: https://supabase.com/docs/guides/realtime
- Row Level Security: https://supabase.com/docs/guides/auth/row-level-security

---

## 🆘 Troubleshooting

### Issue: Cannot connect to Aiven MySQL

```
Error: ER_ACCESS_DENIED_ERROR: Access denied for user 'avnadmin'
```

**Solution:**
1. Check password is correct (copy from Aiven console)
2. Verify SSL certificate path is correct
3. Check if IP is whitelisted (if enabled)

### Issue: SSL Certificate Error

```
Error: unable to get local issuer certificate
```

**Solution:**
```bash
# Verify CA certificate exists
ls -l /home/user/ARIAT-Na/server/certs/ca.pem

# Re-download from Aiven console if missing
```

### Issue: Connection timeout

```
Error: connect ETIMEDOUT
```

**Solution:**
1. Check your internet connection
2. Verify firewall isn't blocking port 25060
3. Try different network (some corporate networks block MySQL ports)

### Issue: Supabase RLS blocking queries

```
Error: new row violates row-level security policy
```

**Solution:**
```sql
-- Temporarily disable RLS for testing (not recommended for production)
ALTER TABLE your_table DISABLE ROW LEVEL SECURITY;

-- Or create proper policies
CREATE POLICY "Allow all for service role"
ON your_table
FOR ALL
TO service_role
USING (true);
```

---

## 🎉 Next Steps

After setup is complete:

1. **Backup Strategy**
   - Configure Aiven automatic backups
   - Test restore procedure
   - Setup Supabase backup (automatic on Pro plan)

2. **Monitoring**
   - Setup Aiven alerts for high CPU/memory
   - Monitor Supabase usage in dashboard
   - Setup application performance monitoring (APM)

3. **Scaling**
   - Monitor connection pool usage
   - Upgrade Aiven plan if hitting limits
   - Consider Aiven read replicas for high traffic

4. **Flutter App Integration**
   - Update API base URL in Flutter app
   - Integrate Supabase Auth SDK
   - Setup image upload with Supabase Storage

---

**Questions?** Check the Aiven and Supabase community forums or contact support.

Good luck with your deployment! 🚀
