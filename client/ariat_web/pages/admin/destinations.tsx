import { useState, useEffect } from 'react';
import AdminLayout from '@/layouts/admin';
import Head from 'next/head';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Button } from '@heroui/button';
import { Input, Textarea } from '@heroui/input';
import { Select, SelectItem } from '@heroui/select';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Chip } from '@heroui/chip';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants';

interface Destination {
  id: string;
  name: string;
  description?: string;
  category_id: string;
  latitude: number;
  longitude: number;
  address?: string;
  entrance_fee_local: number;
  entrance_fee_foreign: number;
  average_visit_duration: number;
  rating: number;
  review_count: number;
  is_active: boolean;
  is_featured: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function DestinationsPage() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDestination, setEditingDestination] = useState<Destination | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category_id: '',
    latitude: '',
    longitude: '',
    address: '',
    entrance_fee_local: '0',
    entrance_fee_foreign: '0',
    average_visit_duration: '120',
  });

  useEffect(() => {
    fetchDestinations();
    fetchCategories();
  }, []);

  const fetchDestinations = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<Destination[]>(API_ENDPOINTS.DESTINATIONS);
      if (response.success && response.data) {
        setDestinations(response.data);
      }
    } catch (error) {
      toast.error('Failed to fetch destinations');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await apiClient.get<Category[]>(API_ENDPOINTS.CATEGORIES);
      if (response.success && response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      toast.error('Failed to fetch categories');
    }
  };

  const handleOpenModal = (destination?: Destination) => {
    if (destination) {
      setEditingDestination(destination);
      setFormData({
        name: destination.name,
        description: destination.description || '',
        category_id: destination.category_id,
        latitude: destination.latitude.toString(),
        longitude: destination.longitude.toString(),
        address: destination.address || '',
        entrance_fee_local: destination.entrance_fee_local.toString(),
        entrance_fee_foreign: destination.entrance_fee_foreign.toString(),
        average_visit_duration: destination.average_visit_duration.toString(),
      });
    } else {
      setEditingDestination(null);
      setFormData({
        name: '',
        description: '',
        category_id: '',
        latitude: '',
        longitude: '',
        address: '',
        entrance_fee_local: '0',
        entrance_fee_foreign: '0',
        average_visit_duration: '120',
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingDestination(null);
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        ...formData,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        entrance_fee_local: parseFloat(formData.entrance_fee_local),
        entrance_fee_foreign: parseFloat(formData.entrance_fee_foreign),
        average_visit_duration: parseInt(formData.average_visit_duration),
      };

      if (editingDestination) {
        // Update
        const response = await apiClient.put(
          `${API_ENDPOINTS.DESTINATIONS}/${editingDestination.id}`,
          payload
        );
        if (response.success) {
          toast.success('Destination updated successfully');
          fetchDestinations();
          handleCloseModal();
        }
      } else {
        // Create
        const response = await apiClient.post(API_ENDPOINTS.DESTINATIONS, payload);
        if (response.success) {
          toast.success('Destination created successfully');
          fetchDestinations();
          handleCloseModal();
        }
      }
    } catch (error) {
      toast.error('Failed to save destination');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this destination?')) return;

    try {
      const response = await apiClient.delete(`${API_ENDPOINTS.DESTINATIONS}/${id}`);
      if (response.success) {
        toast.success('Destination deleted successfully');
        fetchDestinations();
      }
    } catch (error) {
      toast.error('Failed to delete destination');
    }
  };

  const handleToggleFeatured = async (destination: Destination) => {
    try {
      const response = await apiClient.put(`${API_ENDPOINTS.DESTINATIONS}/${destination.id}`, {
        is_featured: !destination.is_featured,
      });
      if (response.success) {
        toast.success(`Destination ${destination.is_featured ? 'unfeatured' : 'featured'} successfully`);
        fetchDestinations();
      }
    } catch (error) {
      toast.error('Failed to update destination');
    }
  };

  return (
    <AdminLayout>
      <Head>
        <title>Destinations - ARIAT-NA Admin</title>
      </Head>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Destinations</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage tourist destinations ({destinations.length} total)
            </p>
          </div>
          <Button color="primary" onClick={() => handleOpenModal()}>
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Destination
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardBody className="text-center py-12">
              <p className="text-gray-600">Loading destinations...</p>
            </CardBody>
          </Card>
        ) : destinations.length === 0 ? (
          <Card>
            <CardBody className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              <p className="text-gray-600 dark:text-gray-400 mb-2">No destinations yet</p>
              <p className="text-sm text-gray-500">Click "Add Destination" to create your first destination</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {destinations.map((destination) => (
              <Card key={destination.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex-col items-start gap-2 pb-0">
                  <div className="flex items-start justify-between w-full">
                    <h3 className="font-semibold text-lg">{destination.name}</h3>
                    <div className="flex gap-1">
                      {destination.is_featured && (
                        <Chip size="sm" color="warning" variant="flat">
                          Featured
                        </Chip>
                      )}
                      {destination.is_active ? (
                        <Chip size="sm" color="success" variant="flat">
                          Active
                        </Chip>
                      ) : (
                        <Chip size="sm" color="default" variant="flat">
                          Inactive
                        </Chip>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {destination.description || 'No description'}
                  </p>
                </CardHeader>
                <CardBody className="pt-2">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      <span className="text-gray-600 dark:text-gray-400">
                        {destination.latitude.toFixed(4)}, {destination.longitude.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-gray-600 dark:text-gray-400">
                        ₱{destination.entrance_fee_local} / ${destination.entrance_fee_foreign}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-gray-600 dark:text-gray-400">
                        {destination.rating.toFixed(1)} ({destination.review_count} reviews)
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" color="primary" variant="flat" onClick={() => handleOpenModal(destination)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      color="warning"
                      variant="flat"
                      onClick={() => handleToggleFeatured(destination)}
                    >
                      {destination.is_featured ? 'Unfeature' : 'Feature'}
                    </Button>
                    <Button size="sm" color="danger" variant="flat" onClick={() => handleDelete(destination.id)}>
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
      <Modal isOpen={isModalOpen} onClose={handleCloseModal} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{editingDestination ? 'Edit Destination' : 'Add Destination'}</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Name"
                placeholder="Enter destination name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                isRequired
              />
              <Textarea
                label="Description"
                placeholder="Enter description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                minRows={3}
              />
              <Select
                label="Category"
                placeholder="Select a category"
                selectedKeys={formData.category_id ? [formData.category_id] : []}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                isRequired
              >
                {categories.map((category) => (
                  <SelectItem key={category.id}>{category.name}</SelectItem>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Latitude"
                  type="number"
                  step="0.000001"
                  placeholder="10.3157"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                  isRequired
                />
                <Input
                  label="Longitude"
                  type="number"
                  step="0.000001"
                  placeholder="123.8854"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                  isRequired
                />
              </div>
              <Input
                label="Address"
                placeholder="Enter address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Entrance Fee (Local)"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.entrance_fee_local}
                  onChange={(e) => setFormData({ ...formData, entrance_fee_local: e.target.value })}
                  startContent={<span className="text-gray-500">₱</span>}
                />
                <Input
                  label="Entrance Fee (Foreign)"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.entrance_fee_foreign}
                  onChange={(e) => setFormData({ ...formData, entrance_fee_foreign: e.target.value })}
                  startContent={<span className="text-gray-500">$</span>}
                />
              </div>
              <Input
                label="Average Visit Duration (minutes)"
                type="number"
                placeholder="120"
                value={formData.average_visit_duration}
                onChange={(e) => setFormData({ ...formData, average_visit_duration: e.target.value })}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="flat" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button color="primary" onClick={handleSubmit}>
              {editingDestination ? 'Update' : 'Create'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
}
