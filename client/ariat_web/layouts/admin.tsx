import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Button } from '@heroui/button';
import { useAuthStore } from '@/lib/store/auth-store';
import { ThemeSwitch } from '@/components/theme-switch';
import AnimatedBackground from '@/components/animated-background';
import DefaultPasswordWarning from '@/components/default-password-warning';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const { isAuthenticated, admin, logout, fetchAdminProfile } = useAuthStore();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      fetchAdminProfile().then(() => {
        if (!useAuthStore.getState().isAuthenticated) {
          router.push('/login');
        }
      });
    }
  }, [isAuthenticated, router, fetchAdminProfile]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const navigation = [
    {
      name: 'Dashboard',
      href: '/admin/dashboard',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Map Manager',
      href: '/admin/map',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
    },
    {
      name: 'Destinations',
      href: '/admin/destinations',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      name: 'Categories',
      href: '/admin/categories',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
    },
    {
      name: 'Roads',
      href: '/admin/roads',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      name: 'Navigation',
      href: '/admin/navigation',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
      ),
    },
    {
      name: 'Settings',
      href: '/admin/settings',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AnimatedBackground />
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            isSidebarCollapsed ? 'w-20' : 'w-64'
          } flex flex-col glass-sidebar transition-all duration-300`}
        >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4" style={{ borderBottom: '1px solid var(--border)' }}>
          {!isSidebarCollapsed && (
            <span className="text-xl font-bold" style={{ color: 'var(--red-600)' }}>AIRAT-NA</span>
          )}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="rounded-lg p-2 hover:bg-white/20"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isSidebarCollapsed ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = router.pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 glass-nav-item ${
                  isActive ? 'active' : ''
                }`}
                style={{
                  color: isActive ? 'white' : 'var(--text-strong)'
                }}
              >
                {item.icon}
                {!isSidebarCollapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
          {!isSidebarCollapsed ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {admin?.profile_image_url ? (
                  <img
                    src={admin.profile_image_url}
                    alt={admin.full_name}
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/20"
                  />
                ) : (
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full font-semibold"
                    style={{
                      backgroundColor: 'rgba(244, 63, 94, 0.1)',
                      color: 'var(--red-600)'
                    }}
                  >
                    {admin?.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-strong)' }}>{admin?.full_name}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{admin?.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <ThemeSwitch />
                <Button
                  size="sm"
                  color="danger"
                  variant="flat"
                  onClick={handleLogout}
                >
                  Logout
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {admin?.profile_image_url ? (
                <img
                  src={admin.profile_image_url}
                  alt={admin.full_name}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/20"
                  title={admin.full_name}
                />
              ) : (
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full font-semibold"
                  style={{
                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                    color: 'var(--red-600)'
                  }}
                  title={admin?.full_name}
                >
                  {admin?.full_name.charAt(0).toUpperCase()}
                </div>
              )}
              <ThemeSwitch />
              <button
                onClick={handleLogout}
                className="rounded-lg p-2 hover:bg-white/20"
                style={{ color: 'var(--danger)' }}
                title="Logout"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-16 items-center justify-between glass-topbar px-6">
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-strong)' }}>
              {navigation.find((item) => item.href === router.pathname)?.name || 'Admin Panel'}
            </h1>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto glass-main p-6">
            <DefaultPasswordWarning />
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
