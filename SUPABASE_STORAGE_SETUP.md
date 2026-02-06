# Supabase Storage Setup Guide for ARIAT-NA

Simple guide to use Supabase for storing destination images and videos.

---

## 🎯 Goal

Use Supabase Storage to upload and serve images/videos for tourist destinations instead of storing them locally.

**Benefits:**
- Free 1GB storage (upgradable to 100GB on Pro plan)
- Built-in CDN for fast image delivery
- Image transformations (resize, crop, optimize)
- No server disk space needed
- Automatic backups

---

## 🚀 Quick Setup (5 Minutes)

### Step 1: Create Supabase Project

1. Go to https://supabase.com
2. Sign up with GitHub
3. Click **"New Project"**
4. Fill in:
   - **Organization**: Create new or select existing
   - **Project Name**: `ariat-na-storage`
   - **Database Password**: (You won't need this for storage only)
   - **Region**: Choose closest to your users (e.g., Southeast Asia)
   - **Pricing Plan**: Free (1GB storage)
5. Click **"Create new project"** (takes ~2 minutes)

### Step 2: Create Storage Bucket

1. In Supabase Dashboard, go to **Storage** (left sidebar)
2. Click **"Create bucket"**
3. Fill in:
   - **Name**: `destination-media`
   - **Public bucket**: ✅ **Yes** (so images are publicly accessible)
4. Click **"Create bucket"**

### Step 3: Configure Bucket Policies

1. Click on the `destination-media` bucket
2. Click **"Policies"** tab
3. Click **"New Policy"**
4. Select **"For full customization"**
5. Policy name: `Public Access for Authenticated Uploads`
6. Add this policy:

```sql
-- Policy 1: Allow public to view images
CREATE POLICY "Public can view images"
ON storage.objects FOR SELECT
USING (bucket_id = 'destination-media');

-- Policy 2: Allow service role to upload
CREATE POLICY "Service role can upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'destination-media');

-- Policy 3: Allow service role to delete
CREATE POLICY "Service role can delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'destination-media');
```

Or use the **simplified policy template**:
- Click **"Create a policy from template"**
- Select **"Allow public read access"**
- Click **"Review"** then **"Save"**

### Step 4: Get Your Credentials

Go to **Project Settings → API**:

```
Project URL: https://xxxxxxxxxxx.supabase.co
anon (public) key: eyJhbG...  (not needed for backend)
service_role key: eyJhbG...  (SECRET - use in backend only)
```

### Step 5: Update Your Environment Variables

Edit `/home/user/ARIAT-Na/server/.env`:

```bash
# Supabase Storage Configuration
SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...your-service-role-key
SUPABASE_BUCKET=destination-media
```

**Important:** The `service_role` key has full access - keep it secret!

---

## 📦 Install Supabase Client

```bash
cd /home/user/ARIAT-Na/server
npm install @supabase/supabase-js
```

---

## 💻 Backend Implementation

### File Structure
```
server/src/
├── config/
│   └── supabase-storage.ts    (Supabase client)
├── services/
│   └── upload.service.ts      (Upload logic)
├── routes/
│   └── upload.routes.ts       (Upload endpoints)
└── middleware/
    └── multer.middleware.ts   (File upload handling)
```

I'll create these files for you next.

---

## 🎨 How It Works

### Upload Flow:
1. Admin selects image in web interface
2. File sent to backend `/api/v1/upload/image`
3. Backend validates file (type, size)
4. Backend uploads to Supabase Storage
5. Supabase returns public URL
6. URL saved to MySQL destinations table
7. Images displayed via CDN URL

### File Naming Convention:
```
destination-media/
  ├── destinations/
  │   ├── dest-uuid-1.jpg
  │   ├── dest-uuid-2.jpg
  │   └── dest-uuid-3.jpg
  └── categories/
      ├── cat-uuid-1.jpg
      └── cat-uuid-2.jpg
```

---

## 🖼️ Image URLs

After upload, you'll get URLs like:
```
https://xxxxxxxxxxx.supabase.co/storage/v1/object/public/destination-media/destinations/dest-123.jpg
```

These URLs:
- ✅ Are publicly accessible (no authentication needed)
- ✅ Served via global CDN (fast worldwide)
- ✅ Support image transformations (resize, optimize)
- ✅ Have automatic caching

### Image Transformations

You can resize/optimize images on-the-fly:

```
Original:
https://xxx.supabase.co/storage/v1/object/public/destination-media/destinations/dest-123.jpg

Thumbnail (300x300):
https://xxx.supabase.co/storage/v1/object/public/destination-media/destinations/dest-123.jpg?width=300&height=300

Optimized (WebP):
https://xxx.supabase.co/storage/v1/render/image/public/destination-media/destinations/dest-123.jpg?width=800&quality=80
```

---

## 📊 Storage Limits

### Free Tier:
- Storage: 1GB
- Bandwidth: 2GB/month
- Max file size: 50MB

### Pro Tier ($25/month):
- Storage: 100GB
- Bandwidth: 200GB/month
- Max file size: 5GB

---

## 🔧 Testing

### Test Upload with cURL:

```bash
# 1. Get a test image
curl -o test.jpg https://picsum.photos/800/600

# 2. Upload via your API
curl -X POST http://localhost:5000/api/v1/upload/image \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@test.jpg" \
  -F "folder=destinations"

# Response:
{
  "success": true,
  "data": {
    "url": "https://xxx.supabase.co/storage/v1/object/public/destination-media/destinations/uuid-123.jpg",
    "path": "destinations/uuid-123.jpg",
    "size": 124567
  }
}
```

---

## 🗑️ Delete Images

When deleting a destination, also delete its images:

```typescript
// In destinations controller
await deleteDestination(id);
// Also delete image from Supabase
await deleteFileFromSupabase(imageUrl);
```

---

## 🎯 Next Steps

After I create the implementation files:

1. **Install dependencies**: `npm install @supabase/supabase-js multer`
2. **Update .env** with your Supabase credentials
3. **Test upload** via Postman or admin interface
4. **Update destinations** to use Supabase image URLs

Ready to create the implementation files?
