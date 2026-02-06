import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { useAuthStore } from '@/lib/store/auth-store';
import { toast } from 'sonner';
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
              <div className="rounded-full bg-primary/10 p-3">
                <svg
                  className="h-8 w-8 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
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
                placeholder="admin@ariat-na.com"
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
                <p>Email: admin@ariat-na.com</p>
                <p>Password: Admin123!</p>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
