import { useState, useEffect } from 'react';
import { Card, CardBody } from '@heroui/card';
import { Button } from '@heroui/button';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/store/auth-store';

export default function DefaultPasswordWarning() {
  const router = useRouter();
  const { admin } = useAuthStore();
  const [dismissed, setDismissed] = useState(false);

  // Check if admin is using default password
  const isDefaultPassword = admin?.is_default_password;

  // Reset dismissed state when admin changes
  useEffect(() => {
    setDismissed(false);
  }, [admin?.id]);

  // Don't show if dismissed or not using default password
  if (dismissed || !isDefaultPassword) {
    return null;
  }

  return (
    <Card className="mb-6 border-2 border-warning bg-warning-50/10">
      <CardBody className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-warning p-2">
            <svg
              className="h-5 w-5 text-warning-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-warning">Security Warning: Using Default Credentials</h3>
            <p className="text-sm text-default-600 mt-1">
              You are currently using the default password. For security reasons, please change your password
              and update your profile information immediately.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            color="warning"
            variant="flat"
            onPress={() => router.push('/admin/settings')}
          >
            Update Profile
          </Button>
          <Button
            size="sm"
            variant="light"
            onPress={() => setDismissed(true)}
          >
            Dismiss
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
