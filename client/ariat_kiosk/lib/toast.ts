import { addToast } from "@heroui/toast";

export const toast = {
  success: (message: string) => {
    addToast({
      color: "success",
      description: message,
      timeout: 4000,
      title: "Success",
      variant: "flat",
    });
  },

  error: (message: string) => {
    addToast({
      color: "danger",
      description: message,
      shouldShowTimeoutProgress: true,
      timeout: 7000,
      title: "Error",
      variant: "flat",
    });
  },

  info: (message: string) => {
    addToast({
      color: "primary",
      description: message,
      timeout: 5000,
      title: "Info",
      variant: "flat",
    });
  },
};
