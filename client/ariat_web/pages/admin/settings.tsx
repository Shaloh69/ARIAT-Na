import { useState, useEffect } from 'react';
import AdminLayout from '@/layouts/admin';
import Head from 'next/head';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { toast } from '@/lib/toast';
import { apiClient } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants';
import { useAuthStore } from '@/lib/store/auth-store';

interface AdminProfile {
  id: string;
  email: string;
  full_name: string;
  profile_image_url: string | null;
  role: string;
  is_default_password: boolean;
  created_at: string;
}

export default function SettingsPage() {
  const { admin, fetchAdminProfile } = useAuthStore();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Image upload
  const [imageUploading, setImageUploading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<AdminProfile>(API_ENDPOINTS.ADMIN_PROFILE);
      if (response.success && response.data) {
        setProfile(response.data);
        setFullName(response.data.full_name);
        setEmail(response.data.email);
      }
    } catch (error) {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!fullName.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }

    try {
      setProfileSaving(true);
      const response = await apiClient.put<AdminProfile>(API_ENDPOINTS.ADMIN_PROFILE, {
        full_name: fullName.trim(),
        email: email.trim(),
      });

      if (response.success && response.data) {
        setProfile(response.data);
        toast.success('Profile updated successfully');
        await fetchAdminProfile();
      } else {
        throw new Error('Failed to update profile');
      }
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || 'Failed to update profile';
      toast.error(message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error('Current password is required');
      return;
    }
    if (!newPassword) {
      toast.error('New password is required');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      setPasswordSaving(true);
      const response = await apiClient.put(API_ENDPOINTS.ADMIN_CHANGE_PASSWORD, {
        current_password: currentPassword,
        new_password: newPassword,
      });

      if (response.success) {
        toast.success('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        await loadProfile();
      } else {
        throw new Error('Failed to change password');
      }
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || 'Failed to change password';
      toast.error(message);
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    try {
      setImageUploading(true);
      const formData = new FormData();
      formData.append('image', file);

      const response = await apiClient.post<{ profile_image_url: string }>(
        API_ENDPOINTS.ADMIN_PROFILE_IMAGE,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      if (response.success && response.data) {
        setProfile((prev) => prev ? { ...prev, profile_image_url: response.data!.profile_image_url } : prev);
        toast.success('Profile image updated');
        await fetchAdminProfile();
      }
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to upload image';
      toast.error(message);
    } finally {
      setImageUploading(false);
    }
  };

  const handleDeleteImage = async () => {
    try {
      setImageUploading(true);
      const response = await apiClient.delete(API_ENDPOINTS.ADMIN_PROFILE_IMAGE);
      if (response.success) {
        setProfile((prev) => prev ? { ...prev, profile_image_url: null } : prev);
        toast.success('Profile image removed');
        await fetchAdminProfile();
      }
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to delete image';
      toast.error(message);
    } finally {
      setImageUploading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <Head>
          <title>Settings - AIRAT-NA Admin</title>
        </Head>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading settings...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <Head>
        <title>Settings - AIRAT-NA Admin</title>
      </Head>

      <div className="space-y-6 max-w-3xl">
        {/* Profile Image */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Profile Image</h3>
          </CardHeader>
          <CardBody>
            <div className="flex items-center gap-6">
              <div className="flex-shrink-0">
                {profile?.profile_image_url ? (
                  <img
                    src={profile.profile_image_url}
                    alt={profile.full_name}
                    className="h-20 w-20 rounded-full object-cover ring-2 ring-primary/20"
                  />
                ) : (
                  <div
                    className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold"
                    style={{
                      backgroundColor: 'rgba(244, 63, 94, 0.1)',
                      color: 'var(--red-600)',
                    }}
                  >
                    {profile?.full_name?.charAt(0).toUpperCase() || 'A'}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <label>
                    <Button
                      as="span"
                      size="sm"
                      color="primary"
                      isLoading={imageUploading}
                      className="cursor-pointer"
                    >
                      Upload Image
                    </Button>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={imageUploading}
                    />
                  </label>
                  {profile?.profile_image_url && (
                    <Button
                      size="sm"
                      color="danger"
                      variant="flat"
                      isLoading={imageUploading}
                      onClick={handleDeleteImage}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  JPG, PNG or GIF. Max 5MB.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Profile Info */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Profile Information</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
            />
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Role: <span className="font-medium" style={{ color: 'var(--text-strong)' }}>{profile?.role?.replace('_', ' ').toUpperCase()}</span>
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                color="primary"
                onClick={handleUpdateProfile}
                isLoading={profileSaving}
              >
                Save Changes
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-lg font-semibold">Change Password</h3>
              {profile?.is_default_password && (
                <p className="text-sm mt-1" style={{ color: 'var(--amber-500)' }}>
                  You are using the default password. Please change it for security.
                </p>
              )}
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 8 characters)"
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
            <div className="flex justify-end pt-2">
              <Button
                color="primary"
                onClick={handleChangePassword}
                isLoading={passwordSaving}
              >
                Change Password
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Account Information</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Account ID</span>
                <span className="font-mono text-sm">{profile?.id}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Created</span>
                <span>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Default Password</span>
                <span style={{ color: profile?.is_default_password ? 'var(--amber-500)' : 'var(--green-600)' }}>
                  {profile?.is_default_password ? 'Yes - Please change' : 'No'}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </AdminLayout>
  );
}
