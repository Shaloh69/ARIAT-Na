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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Redirecting to Admin Console...</p>
        </div>
      </div>
    </>
  );
}
