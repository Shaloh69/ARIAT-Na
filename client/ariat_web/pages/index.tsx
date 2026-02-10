import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AnimatedBackground from '@/components/animated-background';

export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/dashboard');
  }, [router]);

  return (
    <>
      <Head>
        <title>AIRAT-NA Admin Console</title>
      </Head>
      <AnimatedBackground />
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <img
              src="/android-chrome-192x192.png"
              alt="AIRAT-NA"
              className="h-20 w-20 object-contain animate-pulse"
            />
            <div
              className="absolute inset-[-8px] rounded-full border-3 border-transparent animate-spin"
              style={{ borderTopColor: '#f43f5e', borderRightColor: '#fda4af' }}
            />
          </div>
          <p style={{ color: 'var(--text-muted)' }}>Redirecting to Admin Console...</p>
        </div>
      </div>
    </>
  );
}
