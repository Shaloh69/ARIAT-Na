import { useState, useEffect } from 'react';
import AdminLayout from '@/layouts/admin';
import Head from 'next/head';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Button } from '@heroui/button';
import { Input, Textarea } from '@heroui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Chip } from '@heroui/chip';
import { Switch } from '@heroui/switch';
import { toast } from '@/lib/toast';
import { modalClassNames } from '@/lib/modal-styles';
import { apiClient } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon_url?: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    icon_url: '',
    display_order: '0',
    is_active: true,
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<Category[]>(API_ENDPOINTS.CATEGORIES);
      if (response.success && response.data) {
        setCategories(response.data.sort((a, b) => a.display_order - b.display_order));
      }
    } catch (error) {
      toast.error('Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        slug: category.slug,
        description: category.description || '',
        icon_url: category.icon_url || '',
        display_order: category.display_order.toString(),
        is_active: category.is_active,
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: '',
        slug: '',
        description: '',
        icon_url: '',
        display_order: '0',
        is_active: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: editingCategory ? formData.slug : generateSlug(name),
    });
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      const payload = {
        ...formData,
        display_order: parseInt(formData.display_order),
      };

      if (editingCategory) {
        const response = await apiClient.put(`${API_ENDPOINTS.CATEGORIES}/${editingCategory.id}`, payload);
        if (response.success) {
          toast.success('Category updated successfully');
          fetchCategories();
          handleCloseModal();
        }
      } else {
        const response = await apiClient.post(API_ENDPOINTS.CATEGORIES, payload);
        if (response.success) {
          toast.success('Category created successfully');
          fetchCategories();
          handleCloseModal();
        }
      }
    } catch (error) {
      toast.error('Failed to save category');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category? This will affect all destinations in this category.')) {
      return;
    }

    try {
      const response = await apiClient.delete(`${API_ENDPOINTS.CATEGORIES}/${id}`);
      if (response.success) {
        toast.success('Category deleted successfully');
        fetchCategories();
      }
    } catch (error) {
      toast.error('Failed to delete category');
    }
  };

  const handleToggleActive = async (category: Category) => {
    try {
      const response = await apiClient.put(`${API_ENDPOINTS.CATEGORIES}/${category.id}`, {
        is_active: !category.is_active,
      });
      if (response.success) {
        toast.success(`Category ${category.is_active ? 'deactivated' : 'activated'} successfully`);
        fetchCategories();
      }
    } catch (error) {
      toast.error('Failed to update category');
    }
  };

  return (
    <AdminLayout>
      <Head>
        <title>Categories - AIRAT-NA Admin</title>
      </Head>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Categories</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage destination categories ({categories.length} total)
            </p>
          </div>
          <Button color="primary" onClick={() => handleOpenModal()}>
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Category
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardBody className="text-center py-12">
              <p className="text-gray-600">Loading categories...</p>
            </CardBody>
          </Card>
        ) : categories.length === 0 ? (
          <Card>
            <CardBody className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <p className="text-gray-600 dark:text-gray-400 mb-2">No categories yet</p>
              <p className="text-sm text-gray-500">Click "Add Category" to create your first category</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => (
              <Card key={category.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex-col items-start gap-2 pb-2">
                  <div className="flex items-start justify-between w-full">
                    <div className="flex items-center gap-2">
                      {category.icon_url ? (
                        <img src={category.icon_url} alt={category.name} className="h-8 w-8 object-contain" />
                      ) : (
                        <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                          <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                        </div>
                      )}
                      <h3 className="font-semibold text-lg">{category.name}</h3>
                    </div>
                    <Chip size="sm" color={category.is_active ? 'success' : 'default'} variant="flat">
                      {category.is_active ? 'Active' : 'Inactive'}
                    </Chip>
                  </div>
                </CardHeader>
                <CardBody className="pt-0">
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                    {category.description || 'No description'}
                  </p>
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Slug:</span>
                      <code className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                        {category.slug}
                      </code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Display Order:</span>
                      <span className="font-medium">{category.display_order}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" color="primary" variant="flat" onClick={() => handleOpenModal(category)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      color={category.is_active ? 'warning' : 'success'}
                      variant="flat"
                      onClick={() => handleToggleActive(category)}
                    >
                      {category.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button size="sm" color="danger" variant="flat" onClick={() => handleDelete(category.id)}>
                      Delete
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={handleCloseModal} size="2xl" classNames={modalClassNames}>
        <ModalContent>
          <ModalHeader>{editingCategory ? 'Edit Category' : 'Add Category'}</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Name"
                placeholder="Enter category name"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                isRequired
              />
              <Input
                label="Slug"
                placeholder="category-slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                description="URL-friendly identifier (auto-generated from name)"
                isRequired
              />
              <Textarea
                label="Description"
                placeholder="Enter description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                minRows={3}
              />
              <Input
                label="Icon URL"
                placeholder="https://example.com/icon.png"
                value={formData.icon_url}
                onChange={(e) => setFormData({ ...formData, icon_url: e.target.value })}
                description="Optional icon image URL"
              />
              <Input
                label="Display Order"
                type="number"
                placeholder="0"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                description="Lower numbers appear first"
              />
              <Switch
                isSelected={formData.is_active}
                onValueChange={(value) => setFormData({ ...formData, is_active: value })}
              >
                Active
              </Switch>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="flat" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button color="primary" onClick={handleSubmit}>
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
}
