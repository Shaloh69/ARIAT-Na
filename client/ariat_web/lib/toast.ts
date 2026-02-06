import { addToast } from '@heroui/toast';

/**
 * Toast utility using HeroUI's native toast system.
 * Replaces sonner with longer durations and progress indicators.
 */
export const toast = {
  success: (message: string) => {
    addToast({
      title: 'Success',
      description: message,
      color: 'success',
      variant: 'flat',
      timeout: 4000,
    });
  },

  error: (message: string) => {
    addToast({
      title: 'Error',
      description: message,
      color: 'danger',
      variant: 'flat',
      timeout: 7000,
      shouldShowTimeoutProgress: true,
    });
  },

  info: (message: string) => {
    addToast({
      title: 'Info',
      description: message,
      color: 'primary',
      variant: 'flat',
      timeout: 5000,
    });
  },

  warning: (message: string) => {
    addToast({
      title: 'Warning',
      description: message,
      color: 'warning',
      variant: 'flat',
      timeout: 6000,
      shouldShowTimeoutProgress: true,
    });
  },
};
