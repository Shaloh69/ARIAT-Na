import { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/layouts/admin';
import Head from 'next/head';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Button } from '@heroui/button';
import { Input, Textarea } from '@heroui/input';
import { Select, SelectItem } from '@heroui/select';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Chip } from '@heroui/chip';
import { toast } from '@/lib/toast';
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
  best_time_to_visit?: string;
  rating: number;
  review_count: number;
  is_active: boolean;
  is_featured: boolean;
  images?: string[];
  operating_hours?: Record<string, string> | null;
  amenities?: string[];
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

  // Form state
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
    best_time_to_visit: '',
    amenities: '',
  });
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formVideos, setFormVideos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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

  const isVideoUrl = (url: string) => /\.(mp4|webm|mov|avi)$/i.test(url);

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
        best_time_to_visit: destination.best_time_to_visit || '',
        amenities: destination.amenities?.join(', ') || '',
      });
      const existingMedia = destination.images || [];
      setFormVideos(existingMedia.filter(isVideoUrl));
      setFormImages(existingMedia.filter((u) => !isVideoUrl(u)));
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
        best_time_to_visit: '',
        amenities: '',
      });
      setFormImages([]);
      setFormVideos([]);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingDestination(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast.error(`"${file.name}" is not an image`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`"${file.name}" exceeds 5MB limit`);
        return;
      }
    }

    try {
      setUploading(true);
      const uploadData = new FormData();
      for (const file of Array.from(files)) {
        uploadData.append('files', file);
      }
      uploadData.append('folder', 'destinations');

      const response = await apiClient.post<any>(
        API_ENDPOINTS.UPLOAD_IMAGES,
        uploadData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      if (response.success && response.data) {
        const urls = Array.isArray(response.data)
          ? response.data.map((r: any) => r.url)
          : [response.data.url];
        setFormImages((prev) => [...prev, ...urls]);
        toast.success(`${urls.length} image(s) uploaded`);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to upload images');
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast.error('Please select a video file');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Video must be less than 50MB');
      return;
    }

    try {
      setUploading(true);
      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('folder', 'destinations');

      const response = await apiClient.post<any>(
        API_ENDPOINTS.UPLOAD_VIDEO,
        uploadData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      if (response.success && response.data) {
        setFormVideos((prev) => [...prev, response.data.url]);
        toast.success('Video uploaded');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to upload video');
    } finally {
      setUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleRemoveImage = async (url: string) => {
    try {
      await apiClient.delete(API_ENDPOINTS.UPLOAD_DELETE, { data: { url } });
    } catch {
      // Still remove from form even if server delete fails
    }
    setFormImages((prev) => prev.filter((u) => u !== url));
  };

  const handleRemoveVideo = async (url: string) => {
    try {
      await apiClient.delete(API_ENDPOINTS.UPLOAD_DELETE, { data: { url } });
    } catch {
      // Still remove from form
    }
    setFormVideos((prev) => prev.filter((u) => u !== url));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!formData.category_id) {
      toast.error('Category is required');
      return;
    }

    try {
      const allMedia = [...formImages, ...formVideos];
      const amenitiesList = formData.amenities
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const payload = {
        name: formData.name,
        description: formData.description,
        category_id: formData.category_id,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        address: formData.address || undefined,
        entrance_fee_local: parseFloat(formData.entrance_fee_local),
        entrance_fee_foreign: parseFloat(formData.entrance_fee_foreign),
        average_visit_duration: parseInt(formData.average_visit_duration),
        best_time_to_visit: formData.best_time_to_visit || undefined,
        images: allMedia.length > 0 ? allMedia : undefined,
        amenities: amenitiesList.length > 0 ? amenitiesList : undefined,
      };

      if (editingDestination) {
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
        <title>Destinations - AIRAT-NA Admin</title>
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
                {/* Thumbnail */}
                {destination.images && destination.images.filter((u) => !isVideoUrl(u)).length > 0 && (
                  <div className="h-40 overflow-hidden rounded-t-xl">
                    <img
                      src={destination.images.filter((u) => !isVideoUrl(u))[0]}
                      alt={destination.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
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
                    {destination.images && destination.images.length > 0 && (
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-gray-600 dark:text-gray-400">
                          {destination.images.length} media file(s)
                        </span>
                      </div>
                    )}
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
      <Modal isOpen={isModalOpen} onClose={handleCloseModal} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{editingDestination ? 'Edit Destination' : 'Add Destination'}</ModalHeader>
          <ModalBody>
            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="font-medium mb-3">Basic Information</h4>
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
                    placeholder="Write a complete description of this destination. Include history, things to do, what makes it special, tips for visitors..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    minRows={5}
                    maxRows={12}
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
                </div>
              </div>

              {/* Images */}
              <div>
                <h4 className="font-medium mb-3">Images</h4>
                <div className="space-y-3">
                  {formImages.length > 0 && (
                    <div className="grid grid-cols-3 gap-3">
                      {formImages.map((url, idx) => (
                        <div key={idx} className="relative group rounded-lg overflow-hidden h-32">
                          <img src={url} alt={`Image ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            onClick={() => handleRemoveImage(url)}
                            className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            X
                          </button>
                          {idx === 0 && (
                            <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                              Cover
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <label>
                      <Button
                        as="span"
                        size="sm"
                        color="primary"
                        variant="flat"
                        isLoading={uploading}
                        className="cursor-pointer"
                      >
                        <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Upload Images
                      </Button>
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={uploading}
                      />
                    </label>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      JPG, PNG, GIF. Max 5MB each. First image is the cover photo.
                    </p>
                  </div>
                </div>
              </div>

              {/* Videos */}
              <div>
                <h4 className="font-medium mb-3">Videos</h4>
                <div className="space-y-3">
                  {formVideos.length > 0 && (
                    <div className="space-y-2">
                      {formVideos.map((url, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-2 rounded-lg" style={{ background: 'var(--bg-3)' }}>
                          <svg className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm truncate flex-1">{url.split('/').pop()}</span>
                          <Button size="sm" color="danger" variant="flat" onClick={() => handleRemoveVideo(url)}>
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <label>
                      <Button
                        as="span"
                        size="sm"
                        color="primary"
                        variant="flat"
                        isLoading={uploading}
                        className="cursor-pointer"
                      >
                        <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Upload Video
                      </Button>
                      <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handleVideoUpload}
                        disabled={uploading}
                      />
                    </label>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      MP4, WebM, MOV. Max 50MB.
                    </p>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div>
                <h4 className="font-medium mb-3">Location</h4>
                <div className="space-y-4">
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
                    placeholder="Full address of the destination"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
              </div>

              {/* Fees & Visiting Info */}
              <div>
                <h4 className="font-medium mb-3">Fees & Visiting Info</h4>
                <div className="space-y-4">
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
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Average Visit Duration (minutes)"
                      type="number"
                      placeholder="120"
                      value={formData.average_visit_duration}
                      onChange={(e) => setFormData({ ...formData, average_visit_duration: e.target.value })}
                    />
                    <Input
                      label="Best Time to Visit"
                      placeholder="e.g. Morning, 6AM-10AM, Dry season"
                      value={formData.best_time_to_visit}
                      onChange={(e) => setFormData({ ...formData, best_time_to_visit: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Amenities */}
              <div>
                <h4 className="font-medium mb-3">Amenities</h4>
                <Textarea
                  label="Amenities"
                  placeholder="Comma-separated: Parking, Restroom, Restaurant, WiFi, Gift Shop, Tour Guide..."
                  value={formData.amenities}
                  onChange={(e) => setFormData({ ...formData, amenities: e.target.value })}
                  minRows={2}
                />
                {formData.amenities && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.amenities.split(',').map((a) => a.trim()).filter(Boolean).map((amenity, idx) => (
                      <Chip key={idx} size="sm" variant="flat" color="primary">
                        {amenity}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
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
