import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Card, CardBody, CardHeader } from "@heroui/card";
import Head from "next/head";

import { useAuthStore } from "@/lib/store/auth-store";
import { toast } from "@/lib/toast";
import AnimatedBackground from "@/components/animated-background";

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, isAuthenticated, error, clearError } =
    useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/admin/dashboard");
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
      toast.error("Please enter email and password");

      return;
    }

    try {
      await login({ email, password });
      toast.success("Login successful!");
      router.push("/admin/dashboard");
    } catch {
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
              <img
                alt="AIRAT-NA"
                className="h-16 w-16 object-contain"
                src="/android-chrome-192x192.png"
              />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold">AIRAT-NA Admin</h1>
              <p className="text-sm text-default-500">
                Sign in to manage the travel platform
              </p>
            </div>
          </CardHeader>

          <CardBody className="px-6 pb-6">
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <Input
                isRequired
                autoComplete="email"
                label="Email"
                placeholder="admin@airat-na.com"
                type="email"
                value={email}
                variant="bordered"
                onChange={(e) => setEmail(e.target.value)}
              />

              <Input
                isRequired
                autoComplete="current-password"
                label="Password"
                placeholder="Enter your password"
                type="password"
                value={password}
                variant="bordered"
                onChange={(e) => setPassword(e.target.value)}
              />

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input className="rounded" type="checkbox" />
                  <span className="text-default-600">Remember me</span>
                </label>
                <button className="text-primary hover:underline" type="button">
                  Forgot password?
                </button>
              </div>

              <Button
                className="w-full"
                color="primary"
                isLoading={isLoading}
                size="lg"
                type="submit"
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
