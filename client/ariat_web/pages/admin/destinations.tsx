import AdminLayout from '@/layouts/admin';
// Split imports - heroui uses individual packages
import Head from 'next/head';
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";

export default function DestinationsPage() {
  return (
    <AdminLayout>
      <Head>
        <title>Destinations - ARIAT-NA Admin</title>
      </Head>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Destinations</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage tourist destinations</p>
          </div>
          <Button color="primary">
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Destination
          </Button>
        </div>

        <Card>
          <CardBody className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            <p className="text-gray-600 dark:text-gray-400 mb-2">Destination management coming soon</p>
            <p className="text-sm text-gray-500">Full CRUD interface for managing destinations</p>
          </CardBody>
        </Card>
      </div>
    </AdminLayout>
  );
}
