import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { useAuthStore } from '@/lib/store/auth-store';
import { toast } from '@/lib/toast';
import Head from 'next/head';
import AnimatedBackground from '@/components/animated-background';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, isAuthenticated, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/admin/dashboard');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    try {
      await login({ email, password });
      toast.success('Login successful!');
      router.push('/admin/dashboard');
    } catch (error: any) {
      // Error is already handled by the store and toast
    }
  };

  return (
    <>
      <Head>
        <title>Admin Login - AIRAT-NA</title>
      </Head>

      <AnimatedBackground />
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="flex flex-col gap-3 px-6 pt-6">
            <div className="flex items-center justify-center">
              <img src="/android-chrome-192x192.png" alt="AIRAT-NA" className="h-16 w-16 object-contain" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold">AIRAT-NA Admin</h1>
              <p className="text-sm text-default-500">Sign in to manage the travel platform</p>
            </div>
          </CardHeader>

          <CardBody className="px-6 pb-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                type="email"
                label="Email"
                placeholder="admin@airat-na.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                isRequired
                autoComplete="email"
                variant="bordered"
              />

              <Input
                type="password"
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                isRequired
                autoComplete="current-password"
                variant="bordered"
              />

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded" />
                  <span className="text-default-600">Remember me</span>
                </label>
                <a href="#" className="text-primary hover:underline">
                  Forgot password?
                </a>
              </div>

              <Button
                type="submit"
                color="primary"
                size="lg"
                isLoading={isLoading}
                className="w-full"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>

              <div className="mt-2 rounded-lg bg-default-100 p-3 text-xs">
                <p className="font-semibold mb-1">Demo Credentials:</p>
                <p>Email: admin@airat-na.com</p>
                <p>Password: Admin123!</p>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
