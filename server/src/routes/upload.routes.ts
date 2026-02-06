import { Router, Request, Response } from 'express';
import {
  uploadSingleImage,
  uploadMultipleImages,
  uploadSingleVideo,
  handleMulterError,
} from '../middleware/multer.middleware';
import {
  uploadFile,
  uploadMultipleFiles,
  deleteFileByUrl,
  UPLOAD_CONFIGS,
  validateFileType,
  validateFileSize,
} from '../services/upload.service';
import { authenticateAdmin } from '../middleware/auth.middleware';

const router = Router();

/**
 * @route   POST /api/v1/upload/image
 * @desc    Upload a single image
 * @access  Private (Admin only)
 */
router.post(
  '/image',
  authenticateAdmin,
  uploadSingleImage,
  handleMulterError,
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
      }

      // Validate file type
      if (
        !validateFileType(req.file.mimetype, UPLOAD_CONFIGS.IMAGE.allowedTypes)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only images are allowed.',
        });
      }

      // Validate file size
      if (
        !validateFileSize(req.file.size, UPLOAD_CONFIGS.IMAGE.maxSizeInMB)
      ) {
        return res.status(400).json({
          success: false,
          message: `File too large. Maximum size is ${UPLOAD_CONFIGS.IMAGE.maxSizeInMB}MB`,
        });
      }

      // Get folder from request body (optional)
      const folder = req.body.folder || UPLOAD_CONFIGS.IMAGE.folder;

      // Upload to Supabase
      const result = await uploadFile(req.file.buffer, req.file.originalname, {
        folder,
        contentType: req.file.mimetype,
      });

      return res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        data: result,
      });
    } catch (error: any) {
      console.error('Image upload error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload image',
      });
    }
  }
);

/**
 * @route   POST /api/v1/upload/images
 * @desc    Upload multiple images
 * @access  Private (Admin only)
 */
router.post(
  '/images',
  authenticateAdmin,
  uploadMultipleImages,
  handleMulterError,
  async (req: Request, res: Response) => {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files uploaded',
        });
      }

      // Get folder from request body (optional)
      const folder = req.body.folder || UPLOAD_CONFIGS.IMAGE.folder;

      // Validate all files
      for (const file of req.files) {
        if (
          !validateFileType(file.mimetype, UPLOAD_CONFIGS.IMAGE.allowedTypes)
        ) {
          return res.status(400).json({
            success: false,
            message: `Invalid file type for ${file.originalname}. Only images are allowed.`,
          });
        }

        if (!validateFileSize(file.size, UPLOAD_CONFIGS.IMAGE.maxSizeInMB)) {
          return res.status(400).json({
            success: false,
            message: `File ${file.originalname} is too large. Maximum size is ${UPLOAD_CONFIGS.IMAGE.maxSizeInMB}MB`,
          });
        }
      }

      // Upload all files
      const results = await uploadMultipleFiles(req.files, { folder });

      return res.status(200).json({
        success: true,
        message: `${results.length} images uploaded successfully`,
        data: results,
      });
    } catch (error: any) {
      console.error('Multiple images upload error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload images',
      });
    }
  }
);

/**
 * @route   POST /api/v1/upload/video
 * @desc    Upload a single video
 * @access  Private (Admin only)
 */
router.post(
  '/video',
  authenticateAdmin,
  uploadSingleVideo,
  handleMulterError,
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
      }

      // Validate file type
      if (
        !validateFileType(req.file.mimetype, UPLOAD_CONFIGS.VIDEO.allowedTypes)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only videos are allowed.',
        });
      }

      // Validate file size
      if (
        !validateFileSize(req.file.size, UPLOAD_CONFIGS.VIDEO.maxSizeInMB)
      ) {
        return res.status(400).json({
          success: false,
          message: `File too large. Maximum size is ${UPLOAD_CONFIGS.VIDEO.maxSizeInMB}MB`,
        });
      }

      // Get folder from request body (optional)
      const folder = req.body.folder || UPLOAD_CONFIGS.VIDEO.folder;

      // Upload to Supabase
      const result = await uploadFile(req.file.buffer, req.file.originalname, {
        folder,
        contentType: req.file.mimetype,
      });

      return res.status(200).json({
        success: true,
        message: 'Video uploaded successfully',
        data: result,
      });
    } catch (error: any) {
      console.error('Video upload error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload video',
      });
    }
  }
);

/**
 * @route   DELETE /api/v1/upload
 * @desc    Delete a file by URL
 * @access  Private (Admin only)
 */
router.delete(
  '/',
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          message: 'File URL is required',
        });
      }

      await deleteFileByUrl(url);

      return res.status(200).json({
        success: true,
        message: 'File deleted successfully',
      });
    } catch (error: any) {
      console.error('File deletion error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete file',
      });
    }
  }
);

export default router;
