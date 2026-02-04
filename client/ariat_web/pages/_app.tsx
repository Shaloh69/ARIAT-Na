import type { AppProps } from "next/app";

import { HeroUIProvider } from "@heroui/system";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Toaster } from "sonner";
import { useState } from "react";

import { fontSans, fontMono } from "@/config/fonts";
import "@/styles/globals.css";
import 'leaflet/dist/leaflet.css';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <HeroUIProvider navigate={router.push}>
        <NextThemesProvider attribute="class" defaultTheme="light">
          <Component {...pageProps} />
          <Toaster position="top-right" richColors />
        </NextThemesProvider>
      </HeroUIProvider>
    </QueryClientProvider>
  );
}

export const fonts = {
  sans: fontSans.style.fontFamily,
  mono: fontMono.style.fontFamily,
};
