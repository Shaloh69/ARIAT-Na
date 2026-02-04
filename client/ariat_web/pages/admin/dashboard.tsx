import { useEffect } from 'react';
// Split imports - heroui uses individual packages
import { useQuery } from '@tanstack/react-query';
import { Card, CardBody, CardHeader } from "@heroui/card";
import AdminLayout from '@/layouts/admin';
import { apiClient } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants';
import type { Destination, Category } from '@/types/api';
import Head from 'next/head';

export default function DashboardPage() {
  const { data: destinations } = useQuery({
    queryKey: ['destinations'],
    queryFn: async () => {
      const response = await apiClient.get<Destination[]>(API_ENDPOINTS.DESTINATIONS);
      return response.data || [];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await apiClient.get<Category[]>(API_ENDPOINTS.CATEGORIES);
      return response.data || [];
    },
  });

  const stats = [
    {
      title: 'Total Destinations',
      value: destinations?.length || 0,
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        </svg>
      ),
      color: 'bg-blue-500',
    },
    {
      title: 'Categories',
      value: categories?.length || 0,
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
      color: 'bg-green-500',
    },
    {
      title: 'Featured',
      value: destinations?.filter(d => d.is_featured).length || 0,
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
      color: 'bg-yellow-500',
    },
    {
      title: 'Active',
      value: destinations?.filter(d => d.is_active).length || 0,
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'bg-purple-500',
    },
  ];

  return (
    <AdminLayout>
      <Head>
        <title>Dashboard - ARIAT-NA Admin</title>
      </Head>

      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{stat.title}</p>
                    <p className="text-3xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`${stat.color} rounded-full p-3 text-white`}>
                    {stat.icon}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Recent Destinations */}
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Recent Destinations</h2>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {destinations?.slice(0, 5).map((destination) => (
                <div
                  key={destination.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">{destination.name}</p>
                      <p className="text-sm text-gray-500">{destination.category_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {destination.is_featured && (
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                        Featured
                      </span>
                    )}
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      destination.is_active
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {destination.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Quick Actions */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="cursor-pointer hover:border-primary transition-colors">
            <CardBody className="flex items-center gap-4">
              <div className="rounded-full bg-primary/10 p-4 text-primary">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg">Add New Destination</h3>
                <p className="text-sm text-gray-500">Create a new tourist destination</p>
              </div>
            </CardBody>
          </Card>

          <Card className="cursor-pointer hover:border-primary transition-colors">
            <CardBody className="flex items-center gap-4">
              <div className="rounded-full bg-green-500/10 p-4 text-green-600">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg">Manage Map</h3>
                <p className="text-sm text-gray-500">Add points, terminals, and roads</p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
