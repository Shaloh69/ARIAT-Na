import { supabase, STORAGE_BUCKET } from '../config/supabase-storage';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

export interface UploadResult {
  url: string;
  path: string;
  size: number;
  contentType: string;
}

export interface UploadOptions {
  folder?: string;
  filename?: string;
  contentType?: string;
  upsert?: boolean;
}

/**
 * Upload a file to Supabase Storage
 */
export const uploadFile = async (
  fileBuffer: Buffer,
  originalFilename: string,
  options: UploadOptions = {}
): Promise<UploadResult> => {
  try {
    // Extract file extension
    const ext = path.extname(originalFilename).toLowerCase();

    // Generate unique filename or use provided one
    const filename = options.filename || `${uuidv4()}${ext}`;

    // Construct storage path
    const folder = options.folder || 'uploads';
    const storagePath = `${folder}/${filename}`;

    // Determine content type
    const contentType = options.contentType || getContentType(ext);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: options.upsert || false,
        duplex: 'half',
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    return {
      url: publicUrl,
      path: storagePath,
      size: fileBuffer.length,
      contentType,
    };
  } catch (error: any) {
    throw new Error(`File upload error: ${error.message}`);
  }
};

/**
 * Upload multiple files
 */
export const uploadMultipleFiles = async (
  files: Array<{ buffer: Buffer; originalname: string }>,
  options: UploadOptions = {}
): Promise<UploadResult[]> => {
  const uploadPromises = files.map(file =>
    uploadFile(file.buffer, file.originalname, options)
  );

  return await Promise.all(uploadPromises);
};

/**
 * Delete a file from Supabase Storage
 */
export const deleteFile = async (filePath: string): Promise<void> => {
  try {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);

    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  } catch (error: any) {
    throw new Error(`File deletion error: ${error.message}`);
  }
};

/**
 * Delete a file by its full URL
 */
export const deleteFileByUrl = async (publicUrl: string): Promise<void> => {
  try {
    // Extract path from URL
    // URL format: https://xxx.supabase.co/storage/v1/object/public/bucket-name/path/to/file.jpg
    const urlParts = publicUrl.split(`/storage/v1/object/public/${STORAGE_BUCKET}/`);

    if (urlParts.length < 2) {
      throw new Error('Invalid Supabase Storage URL');
    }

    const filePath = urlParts[1];
    await deleteFile(filePath);
  } catch (error: any) {
    throw new Error(`URL deletion error: ${error.message}`);
  }
};

/**
 * Delete multiple files
 */
export const deleteMultipleFiles = async (filePaths: string[]): Promise<void> => {
  try {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(filePaths);

    if (error) {
      throw new Error(`Batch delete failed: ${error.message}`);
    }
  } catch (error: any) {
    throw new Error(`Multiple files deletion error: ${error.message}`);
  }
};

/**
 * Get public URL for a file
 */
export const getPublicUrl = (filePath: string): string => {
  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);

  return publicUrl;
};

/**
 * List files in a folder
 */
export const listFiles = async (folderPath: string = '') => {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(folderPath, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      throw new Error(`List failed: ${error.message}`);
    }

    return data;
  } catch (error: any) {
    throw new Error(`File listing error: ${error.message}`);
  }
};

/**
 * Get file metadata
 */
export const getFileMetadata = async (filePath: string) => {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(path.dirname(filePath), {
        search: path.basename(filePath),
      });

    if (error || !data || data.length === 0) {
      throw new Error('File not found');
    }

    return data[0];
  } catch (error: any) {
    throw new Error(`Metadata fetch error: ${error.message}`);
  }
};

/**
 * Determine content type from file extension
 */
function getContentType(ext: string): string {
  const contentTypes: Record<string, string> = {
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',

    // Videos
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',

    // Documents
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Validate file type
 */
export const validateFileType = (
  mimetype: string,
  allowedTypes: string[]
): boolean => {
  return allowedTypes.some(type => mimetype.startsWith(type));
};

/**
 * Validate file size
 */
export const validateFileSize = (
  fileSize: number,
  maxSizeInMB: number
): boolean => {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  return fileSize <= maxSizeInBytes;
};

// Preset configurations for different upload types
export const UPLOAD_CONFIGS = {
  IMAGE: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSizeInMB: 5,
    folder: 'destinations',
  },
  VIDEO: {
    allowedTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    maxSizeInMB: 50,
    folder: 'videos',
  },
  CATEGORY_ICON: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    maxSizeInMB: 2,
    folder: 'categories',
  },
};
