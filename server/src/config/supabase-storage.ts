import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseBucket = process.env.SUPABASE_BUCKET || 'destination-media';

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is not defined in environment variables');
}

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_KEY is not defined in environment variables');
}

// Create Supabase client with service role key (full access)
export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export const STORAGE_BUCKET = supabaseBucket;

// Test Supabase Storage connection
export const testStorageConnection = async (): Promise<void> => {
  try {
    const { data, error } = await supabase.storage.listBuckets();

    if (error) {
      throw error;
    }

    const bucketExists = data.some(bucket => bucket.name === STORAGE_BUCKET);

    if (bucketExists) {
      console.log(`✅ Supabase Storage connected successfully`);
      console.log(`   Bucket: ${STORAGE_BUCKET}`);
    } else {
      console.warn(`⚠️  Bucket "${STORAGE_BUCKET}" not found`);
      console.warn(`   Available buckets: ${data.map(b => b.name).join(', ')}`);
    }
  } catch (error: any) {
    console.error('❌ Supabase Storage connection failed:', error.message);
  }
};

export default supabase;
