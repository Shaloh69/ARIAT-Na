import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is not defined in environment variables');
}

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_KEY is not defined in environment variables');
}

// Service role client (for backend operations)
export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Public client (for frontend operations)
export const supabasePublic: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey || supabaseServiceKey
);

// ===== Authentication Functions =====

/**
 * Sign up a new user
 */
export const signUpUser = async (email: string, password: string, metadata?: any) => {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });

  if (error) throw error;
  return data;
};

/**
 * Sign in user
 */
export const signInUser = async (email: string, password: string) => {
  const { data, error } = await supabasePublic.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
};

/**
 * Get user by ID
 */
export const getUserById = async (userId: string) => {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (error) throw error;
  return data;
};

/**
 * Delete user
 */
export const deleteUser = async (userId: string) => {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) throw error;
};

// ===== Storage Functions =====

/**
 * Upload file to Supabase Storage
 */
export const uploadFile = async (
  bucket: string,
  path: string,
  file: Buffer | Blob,
  contentType?: string
) => {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, file, {
      contentType,
      upsert: false,
    });

  if (error) throw error;

  // Get public URL
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(path);

  return { ...data, publicUrl };
};

/**
 * Delete file from Supabase Storage
 */
export const deleteFile = async (bucket: string, path: string) => {
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .remove([path]);

  if (error) throw error;
};

/**
 * Get public URL for a file
 */
export const getPublicUrl = (bucket: string, path: string): string => {
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(path);

  return publicUrl;
};

// ===== Database Functions =====

/**
 * Insert record
 */
export const insertRecord = async <T>(table: string, data: any): Promise<T> => {
  const { data: result, error } = await supabaseAdmin
    .from(table)
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return result as T;
};

/**
 * Update record
 */
export const updateRecord = async <T>(
  table: string,
  id: string,
  data: any
): Promise<T> => {
  const { data: result, error } = await supabaseAdmin
    .from(table)
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return result as T;
};

/**
 * Delete record
 */
export const deleteRecord = async (table: string, id: string): Promise<void> => {
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('id', id);

  if (error) throw error;
};

/**
 * Get record by ID
 */
export const getRecordById = async <T>(table: string, id: string): Promise<T | null> => {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return data as T | null;
};

/**
 * List records with pagination
 */
export const listRecords = async <T>(
  table: string,
  options?: {
    limit?: number;
    offset?: number;
    orderBy?: string;
    ascending?: boolean;
    filters?: Record<string, any>;
  }
): Promise<T[]> => {
  let query = supabaseAdmin.from(table).select('*');

  // Apply filters
  if (options?.filters) {
    Object.entries(options.filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
  }

  // Apply ordering
  if (options?.orderBy) {
    query = query.order(options.orderBy, {
      ascending: options.ascending ?? true,
    });
  }

  // Apply pagination
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(
      options.offset,
      options.offset + (options.limit || 10) - 1
    );
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as T[];
};

// ===== Real-time Subscriptions =====

/**
 * Subscribe to table changes
 */
export const subscribeToTable = (
  table: string,
  callback: (payload: any) => void
) => {
  return supabasePublic
    .channel(`public:${table}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      callback
    )
    .subscribe();
};

// Export default client
export default supabaseAdmin;
