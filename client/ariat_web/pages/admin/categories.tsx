import AdminLayout from '@/layouts/admin';
// Split imports - heroui uses individual packages
import Head from 'next/head';
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";

export default function CategoriesPage() {
  return (
    <AdminLayout>
      <Head>
        <title>Categories - ARIAT-NA Admin</title>
      </Head>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Categories</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage destination categories</p>
          </div>
          <Button color="primary">
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Category
          </Button>
        </div>

        <Card>
          <CardBody className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <p className="text-gray-600 dark:text-gray-400 mb-2">Category management coming soon</p>
            <p className="text-sm text-gray-500">Full CRUD interface for managing categories</p>
          </CardBody>
        </Card>
      </div>
    </AdminLayout>
  );
}
