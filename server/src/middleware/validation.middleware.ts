import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';
import { AppError } from '../types';

/**
 * Middleware to handle validation errors
 */
export const validate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors
      .array()
      .map((error: ValidationError) => {
        if (error.type === 'field') {
          return `${error.path}: ${error.msg}`;
        }
        return error.msg;
      })
      .join(', ');

    throw new AppError(errorMessages, 400);
  }

  next();
};
