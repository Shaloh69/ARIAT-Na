import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Switch } from "@heroui/switch";
import { Tooltip } from "@heroui/tooltip";

import AdminLayout from "@/layouts/admin";
import { toast } from "@/lib/toast";
import { modalClassNames } from "@/lib/modal-styles";
import { apiClient } from "@/lib/api";
import { API_ENDPOINTS } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Destination {
  id: string;
  name: string;
  description?: string;
  category_id?: string;
  category_name?: string;
  category_slug?: string;
  categories?: { id: string; name: string; slug: string }[];
  cluster_id?: string;
  municipality?: string;
  budget_level?: string;
  tags?: string[];
  family_friendly?: boolean;
  latitude: number;
  longitude: number;
  address?: string;
  contact_phone?: string;
  contact_email?: string;
  website_url?: string;
  facebook_url?: string;
  instagram_url?: string;
  entrance_fee_local: number;
  entrance_fee_foreign: number;
  average_visit_duration: number;
  best_time_to_visit?: string;
  rating: number;
  review_count: number;
  is_active: boolean;
  is_featured: boolean;
  is_island?: boolean;
  images?: string[];
  menu_images?: string[];
  operating_hours?: Record<
    string,
    { open: string; close: string; closed: boolean }
  > | null;
  amenities?: string[];
  cuisine_types?: string[];
  service_types?: string[];
  seating_capacity?: number;
  accommodation_pricing?: {
    per_night_min?: number;
    per_night_max?: number;
    per_hour?: number;
  } | null;
  star_rating?: number;
  check_in_time?: string;
  check_out_time?: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Cluster {
  id: string;
  name: string;
  slug: string;
}

type DayHours = { open: string; close: string; closed: boolean };

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DEFAULT_HOURS = (): Record<string, DayHours> =>
  Object.fromEntries(
    DAYS.map(({ key }) => [
      key,
      { open: "08:00", close: "18:00", closed: key === "sun" },
    ]),
  );

const SERVICE_TYPE_LABELS: Record<string, string> = {
  dine_in: "Dine-in",
  takeout: "Takeout",
  delivery: "Delivery",
};

// Detect category type from slug or name
function detectCatType(slug: string, name: string) {
  const s = (slug + " " + name).toLowerCase();
  const isRestaurant =
    /restaurant|food|cafe|caf|dining|bar|bistro|eatery|kitchen|restobar|fastfood|fast.food/.test(
      s,
    );
  const isHotel =
    /hotel|resort|lodge|accommodation|hostel|pension|villa|inn|motel|bed.and|b&b|airbnb/.test(
      s,
    );

  return { isRestaurant, isHotel };
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|avi)$/i.test(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DestinationsPage() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDestination, setEditingDestination] =
    useState<Destination | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Basic form fields ──────────────────────────────────────────────────────
  const [formCategoryIds, setFormCategoryIds] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    latitude: "",
    longitude: "",
    address: "",
    entrance_fee_local: "0",
    entrance_fee_foreign: "0",
    average_visit_duration: "120",
    best_time_to_visit: "",
    amenities: "",
  });

  // ── Classification ─────────────────────────────────────────────────────────
  const [formClusterId, setFormClusterId] = useState("");
  const [formMunicipality, setFormMunicipality] = useState("");
  const [formBudgetLevel, setFormBudgetLevel] = useState("mid");
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formTagInput, setFormTagInput] = useState("");
  const [formFamilyFriendly, setFormFamilyFriendly] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsIsland, setFormIsIsland] = useState(false);
  const [formIsFeatured, setFormIsFeatured] = useState(false);

  // ── Media ──────────────────────────────────────────────────────────────────
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formVideos, setFormVideos] = useState<string[]>([]);
  const [formMenuImages, setFormMenuImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const menuImageInputRef = useRef<HTMLInputElement>(null);

  // ── Operating hours ────────────────────────────────────────────────────────
  const [formHoursEnabled, setFormHoursEnabled] = useState(false);
  const [formHours, setFormHours] =
    useState<Record<string, DayHours>>(DEFAULT_HOURS());

  // ── Contact & social ──────────────────────────────────────────────────────
  const [formContact, setFormContact] = useState({
    contact_phone: "",
    contact_email: "",
    website_url: "",
    facebook_url: "",
    instagram_url: "",
  });

  // ── Restaurant ─────────────────────────────────────────────────────────────
  const [formCuisineTypes, setFormCuisineTypes] = useState("");
  const [formServiceTypes, setFormServiceTypes] = useState<string[]>([]);
  const [formSeatingCapacity, setFormSeatingCapacity] = useState("");

  // ── Hotel ─────────────────────────────────────────────────────────────────
  const [formStarRating, setFormStarRating] = useState(0);
  const [formPerNightMin, setFormPerNightMin] = useState("");
  const [formPerNightMax, setFormPerNightMax] = useState("");
  const [formPerHour, setFormPerHour] = useState("");
  const [formCheckIn, setFormCheckIn] = useState("14:00");
  const [formCheckOut, setFormCheckOut] = useState("12:00");

  // ── Derived ────────────────────────────────────────────────────────────────
  const primaryCategory = categories.find((c) => formCategoryIds[0] === c.id);
  const { isRestaurant, isHotel } = detectCatType(
    primaryCategory?.slug ?? "",
    primaryCategory?.name ?? "",
  );

  // ─── Data fetching ────────────────────────────────────────────────────────

  useEffect(() => {
    fetchDestinations();
    fetchCategories();
    fetchClusters();
  }, []);

  const fetchDestinations = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<any>(
        `${API_ENDPOINTS.DESTINATIONS}?limit=500&active=false`,
      );

      if (res.success) {
        // Server returns { success, data: [...], pagination: {...} }
        const list = Array.isArray(res.data) ? res.data : [];

        setDestinations(list);
      }
    } catch {
      toast.error("Failed to fetch destinations");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await apiClient.get<Category[]>(API_ENDPOINTS.CATEGORIES);

      if (res.success && res.data) setCategories(res.data);
    } catch {
      toast.error("Failed to fetch categories");
    }
  };

  const fetchClusters = async () => {
    try {
      const res = await apiClient.get<Cluster[]>("/clusters");

      if (res.success && res.data) setClusters(res.data);
    } catch {
      // clusters optional — not critical
    }
  };

  // ─── Modal helpers ────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setFormCategoryIds([]);
    setFormData({
      name: "",
      description: "",
      latitude: "",
      longitude: "",
      address: "",
      entrance_fee_local: "0",
      entrance_fee_foreign: "0",
      average_visit_duration: "120",
      best_time_to_visit: "",
      amenities: "",
    });
    setFormClusterId("");
    setFormMunicipality("");
    setFormBudgetLevel("mid");
    setFormTags([]);
    setFormTagInput("");
    setFormFamilyFriendly(false);
    setFormIsActive(true);
    setFormIsIsland(false);
    setFormIsFeatured(false);
    setFormImages([]);
    setFormVideos([]);
    setFormMenuImages([]);
    setFormHoursEnabled(false);
    setFormHours(DEFAULT_HOURS());
    setFormContact({
      contact_phone: "",
      contact_email: "",
      website_url: "",
      facebook_url: "",
      instagram_url: "",
    });
    setFormCuisineTypes("");
    setFormServiceTypes([]);
    setFormSeatingCapacity("");
    setFormStarRating(0);
    setFormPerNightMin("");
    setFormPerNightMax("");
    setFormPerHour("");
    setFormCheckIn("14:00");
    setFormCheckOut("12:00");
  }, []);

  const handleOpenModal = (destination?: Destination) => {
    if (destination) {
      setEditingDestination(destination);
      setFormCategoryIds(
        destination.categories?.map((c) => c.id) ??
          (destination.category_id ? [destination.category_id] : []),
      );
      setFormData({
        name: destination.name,
        description: destination.description || "",
        latitude: String(destination.latitude),
        longitude: String(destination.longitude),
        address: destination.address || "",
        entrance_fee_local: String(destination.entrance_fee_local ?? 0),
        entrance_fee_foreign: String(destination.entrance_fee_foreign ?? 0),
        average_visit_duration: String(
          destination.average_visit_duration ?? 120,
        ),
        best_time_to_visit: destination.best_time_to_visit || "",
        amenities: (destination.amenities ?? []).join(", "),
      });
      setFormClusterId(destination.cluster_id || "");
      setFormMunicipality(destination.municipality || "");
      setFormBudgetLevel(destination.budget_level || "mid");
      setFormTags(destination.tags ?? []);
      setFormTagInput("");
      setFormFamilyFriendly(
        destination.family_friendly === true ||
          (destination.family_friendly as any) === 1,
      );
      setFormIsActive(destination.is_active !== false);
      setFormIsIsland(
        destination.is_island === true || (destination.is_island as any) === 1,
      );
      setFormIsFeatured(
        destination.is_featured === true ||
          (destination.is_featured as any) === 1,
      );
      const allMedia = destination.images || [];

      setFormImages(allMedia.filter((u) => !isVideoUrl(u)));
      setFormVideos(allMedia.filter(isVideoUrl));
      setFormMenuImages(destination.menu_images || []);
      const oh = destination.operating_hours;

      if (oh && typeof oh === "object" && Object.keys(oh).length > 0) {
        setFormHoursEnabled(true);
        setFormHours({ ...DEFAULT_HOURS(), ...oh });
      } else {
        setFormHoursEnabled(false);
        setFormHours(DEFAULT_HOURS());
      }
      setFormContact({
        contact_phone: destination.contact_phone || "",
        contact_email: destination.contact_email || "",
        website_url: destination.website_url || "",
        facebook_url: destination.facebook_url || "",
        instagram_url: destination.instagram_url || "",
      });
      setFormCuisineTypes((destination.cuisine_types ?? []).join(", "));
      setFormServiceTypes(destination.service_types ?? []);
      setFormSeatingCapacity(
        destination.seating_capacity
          ? String(destination.seating_capacity)
          : "",
      );
      setFormStarRating(destination.star_rating ?? 0);
      const ap = destination.accommodation_pricing;

      setFormPerNightMin(ap?.per_night_min ? String(ap.per_night_min) : "");
      setFormPerNightMax(ap?.per_night_max ? String(ap.per_night_max) : "");
      setFormPerHour(ap?.per_hour ? String(ap.per_hour) : "");
      setFormCheckIn(destination.check_in_time || "14:00");
      setFormCheckOut(destination.check_out_time || "12:00");
    } else {
      setEditingDestination(null);
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingDestination(null);
  };

  // ─── Upload handlers ──────────────────────────────────────────────────────

  const uploadImages = async (
    files: FileList,
    onDone: (urls: string[]) => void,
  ) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`"${file.name}" is not an image`);

        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`"${file.name}" exceeds 5MB`);

        return;
      }
    }
    try {
      setUploading(true);
      const fd = new FormData();

      Array.from(files).forEach((f) => fd.append("files", f));
      fd.append("folder", "destinations");
      const res = await apiClient.post<any>(API_ENDPOINTS.UPLOAD_IMAGES, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.success && res.data) {
        const urls = Array.isArray(res.data)
          ? res.data.map((r: any) => r.url)
          : [res.data.url];

        onDone(urls);
        toast.success(`${urls.length} image(s) uploaded`);
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    uploadImages(e.target.files, (urls) =>
      setFormImages((p) => [...p, ...urls]),
    );
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleMenuImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    uploadImages(e.target.files, (urls) =>
      setFormMenuImages((p) => [...p, ...urls]),
    );
    if (menuImageInputRef.current) menuImageInputRef.current.value = "";
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Please select a video file");

      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Video must be less than 50MB");

      return;
    }
    try {
      setUploading(true);
      const fd = new FormData();

      fd.append("file", file);
      fd.append("folder", "destinations");
      const res = await apiClient.post<any>(API_ENDPOINTS.UPLOAD_VIDEO, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.success && res.data) {
        setFormVideos((p) => [...p, res.data.url]);
        toast.success("Video uploaded");
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Video upload failed");
    } finally {
      setUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const removeMedia = async (
    url: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    try {
      await apiClient.delete(API_ENDPOINTS.UPLOAD_DELETE, { data: { url } });
    } catch {
      toast.warning("Could not delete from server, removed from form");
    }
    setter((p) => p.filter((u) => u !== url));
  };

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");

      return;
    }
    if (formCategoryIds.length === 0) {
      toast.error("At least one category is required");

      return;
    }
    if (!formData.latitude || !formData.longitude) {
      toast.error("Latitude and longitude are required");

      return;
    }

    const amenitiesList = formData.amenities
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const tagsList = formTags.filter(Boolean);
    const cuisineList = formCuisineTypes
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const allMedia = [...formImages, ...formVideos];

    const payload: Record<string, any> = {
      name: formData.name.trim(),
      description: formData.description || undefined,
      category_ids: formCategoryIds,
      latitude: parseFloat(formData.latitude),
      longitude: parseFloat(formData.longitude),
      address: formData.address || undefined,
      entrance_fee_local: parseFloat(formData.entrance_fee_local) || 0,
      entrance_fee_foreign: parseFloat(formData.entrance_fee_foreign) || 0,
      average_visit_duration: parseInt(formData.average_visit_duration) || 120,
      best_time_to_visit: formData.best_time_to_visit || undefined,
      images: allMedia.length > 0 ? allMedia : undefined,
      amenities: amenitiesList.length > 0 ? amenitiesList : undefined,
      is_active: formIsActive,
      is_featured: formIsFeatured,
      is_island: formIsIsland,
      family_friendly: formFamilyFriendly,
      cluster_id: formClusterId || undefined,
      municipality: formMunicipality || undefined,
      budget_level: formBudgetLevel,
      tags: tagsList.length > 0 ? tagsList : undefined,
      // Contact
      contact_phone: formContact.contact_phone || undefined,
      contact_email: formContact.contact_email || undefined,
      website_url: formContact.website_url || undefined,
      facebook_url: formContact.facebook_url || undefined,
      instagram_url: formContact.instagram_url || undefined,
      // Operating hours
      operating_hours: formHoursEnabled ? formHours : undefined,
      // Restaurant
      cuisine_types: cuisineList.length > 0 ? cuisineList : undefined,
      service_types: formServiceTypes.length > 0 ? formServiceTypes : undefined,
      seating_capacity: formSeatingCapacity
        ? parseInt(formSeatingCapacity)
        : undefined,
      menu_images: formMenuImages.length > 0 ? formMenuImages : undefined,
      // Hotel
      star_rating: formStarRating > 0 ? formStarRating : undefined,
      accommodation_pricing:
        formPerNightMin || formPerNightMax || formPerHour
          ? {
              per_night_min: formPerNightMin
                ? parseFloat(formPerNightMin)
                : undefined,
              per_night_max: formPerNightMax
                ? parseFloat(formPerNightMax)
                : undefined,
              per_hour: formPerHour ? parseFloat(formPerHour) : undefined,
            }
          : undefined,
      check_in_time: formCheckIn || undefined,
      check_out_time: formCheckOut || undefined,
    };

    try {
      setSaving(true);
      if (editingDestination) {
        const res = await apiClient.put(
          `${API_ENDPOINTS.DESTINATIONS}/${editingDestination.id}`,
          payload,
        );

        if (res.success) {
          toast.success("Destination updated");
          fetchDestinations();
          handleCloseModal();
        } else {
          toast.error((res as any).message || "Update failed");
        }
      } else {
        const res = await apiClient.post(API_ENDPOINTS.DESTINATIONS, payload);

        if (res.success) {
          toast.success("Destination created");
          fetchDestinations();
          handleCloseModal();
        } else {
          toast.error((res as any).message || "Create failed");
        }
      }
    } catch (error: any) {
      const msg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Failed to save destination";

      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this destination permanently?")) return;
    try {
      const res = await apiClient.delete(`${API_ENDPOINTS.DESTINATIONS}/${id}`);

      if (res.success) {
        toast.success("Destination deleted");
        fetchDestinations();
      }
    } catch {
      toast.error("Failed to delete destination");
    }
  };

  const handleToggleFeatured = async (destination: Destination) => {
    try {
      const res = await apiClient.put(
        `${API_ENDPOINTS.DESTINATIONS}/${destination.id}`,
        { is_featured: !destination.is_featured },
      );

      if (res.success) {
        toast.success(destination.is_featured ? "Unfeatured" : "Featured");
        fetchDestinations();
      }
    } catch {
      toast.error("Failed to update destination");
    }
  };

  const toggleServiceType = (type: string) => {
    setFormServiceTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const updateDayHour = (
    day: string,
    field: keyof DayHours,
    value: string | boolean,
  ) => {
    setFormHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  // ─── Render helpers ───────────────────────────────────────────────────────

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h4
      className="font-semibold text-sm uppercase tracking-wider mb-3"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </h4>
  );

  const UploadButton = ({
    label,
    icon,
    onClick,
    disabled,
  }: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50"
      disabled={disabled}
      style={{
        borderColor: "var(--border-medium)",
        color: "var(--text)",
        background: "var(--bg-3)",
      }}
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );

  // ─── Page ─────────────────────────────────────────────────────────────────

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
          <div className="flex gap-2">
            <Tooltip
              showArrow
              classNames={{
                content:
                  "bg-slate-800 text-white border border-white/10 shadow-lg text-xs",
              }}
              content="Add a destination manually without placing it on the map"
              delay={700}
              placement="left"
            >
              <Button
                color="default"
                variant="flat"
                onClick={() => handleOpenModal()}
              >
                <svg
                  className="h-4 w-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M12 4v16m8-8H4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                </svg>
                Add Destination
              </Button>
            </Tooltip>
            <Tooltip
              showArrow
              classNames={{
                content:
                  "bg-slate-800 text-white border border-white/10 shadow-lg text-xs",
              }}
              content="Open Map Manager to place a new destination on the map"
              delay={700}
              placement="left"
            >
              <Button
                color="primary"
                onClick={() => (window.location.href = "/admin/map")}
              >
                <svg
                  className="h-4 w-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                </svg>
                Add on Map
              </Button>
            </Tooltip>
          </div>
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
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                No destinations yet
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Use the Map Manager to create destinations
              </p>
              <Button
                color="primary"
                size="sm"
                onClick={() => (window.location.href = "/admin/map")}
              >
                Go to Map Manager
              </Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {destinations.map((dest) => {
              const cover = (dest.images || []).filter(
                (u) => !isVideoUrl(u),
              )[0];
              const { isRestaurant: isR, isHotel: isH } = detectCatType(
                dest.category_slug ?? "",
                dest.category_name ?? "",
              );

              return (
                <Card
                  key={dest.id}
                  className="hover:shadow-lg transition-shadow"
                >
                  {cover && (
                    <div className="h-40 overflow-hidden rounded-t-xl">
                      <img
                        alt={dest.name}
                        className="w-full h-full object-cover"
                        src={cover}
                      />
                    </div>
                  )}
                  <CardHeader className="flex-col items-start gap-1 pb-0">
                    <div className="flex items-start justify-between w-full gap-2">
                      <h3 className="font-semibold text-base leading-snug">
                        {dest.name}
                      </h3>
                      <div className="flex gap-1 flex-shrink-0">
                        {dest.is_featured && (
                          <Chip color="warning" size="sm" variant="flat">
                            Featured
                          </Chip>
                        )}
                        <Chip
                          color={dest.is_active ? "success" : "default"}
                          size="sm"
                          variant="flat"
                        >
                          {dest.is_active ? "Active" : "Inactive"}
                        </Chip>
                      </div>
                    </div>
                    {dest.category_name && (
                      <p className="text-xs text-gray-400">
                        {dest.category_name}
                        {dest.municipality ? ` · ${dest.municipality}` : ""}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {dest.description || "No description"}
                    </p>
                  </CardHeader>
                  <CardBody className="pt-2">
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs">📍</span>
                        <span className="text-gray-600 dark:text-gray-400 text-xs">
                          {Number(dest.latitude).toFixed(4)},{" "}
                          {Number(dest.longitude).toFixed(4)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">
                          ₱{Number(dest.entrance_fee_local).toFixed(0)} local
                        </span>
                        <span className="text-yellow-500 text-xs">
                          ★ {Number(dest.rating).toFixed(1)}
                        </span>
                        {isR && (
                          <span className="text-xs text-orange-400">
                            🍽 Restaurant
                          </span>
                        )}
                        {isH && (
                          <span className="text-xs text-blue-400">
                            🏨 Hotel
                          </span>
                        )}
                        {dest.is_island && (
                          <span className="text-xs text-purple-400">
                            ⛴ Island
                          </span>
                        )}
                      </div>
                      {dest.contact_phone && (
                        <p className="text-xs text-gray-500">
                          📞 {dest.contact_phone}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <Tooltip
                        showArrow
                        classNames={{
                          content:
                            "bg-slate-800 text-white border border-white/10 shadow-lg text-xs",
                        }}
                        content="Edit all destination details"
                        delay={700}
                        placement="top"
                      >
                        <Button
                          color="primary"
                          size="sm"
                          variant="flat"
                          onClick={() => handleOpenModal(dest)}
                        >
                          Edit
                        </Button>
                      </Tooltip>
                      <Tooltip
                        showArrow
                        classNames={{
                          content:
                            "bg-slate-800 text-white border border-white/10 shadow-lg text-xs",
                        }}
                        content={
                          dest.is_featured
                            ? "Remove from featured"
                            : "Highlight in featured section"
                        }
                        delay={700}
                        placement="top"
                      >
                        <Button
                          color="warning"
                          size="sm"
                          variant="flat"
                          onClick={() => handleToggleFeatured(dest)}
                        >
                          {dest.is_featured ? "Unfeature" : "Feature"}
                        </Button>
                      </Tooltip>
                      <Tooltip
                        showArrow
                        classNames={{
                          content:
                            "bg-slate-800 text-white border border-white/10 shadow-lg text-xs",
                        }}
                        color="danger"
                        content="Permanently delete"
                        delay={700}
                        placement="top"
                      >
                        <Button
                          color="danger"
                          size="sm"
                          variant="flat"
                          onClick={() => handleDelete(dest.id)}
                        >
                          Delete
                        </Button>
                      </Tooltip>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Add / Edit Modal ─────────────────────────────────────────────────── */}
      <Modal
        classNames={modalClassNames}
        isOpen={isModalOpen}
        scrollBehavior="inside"
        size="4xl"
        onClose={handleCloseModal}
      >
        <ModalContent>
          <ModalHeader>
            {editingDestination ? "Edit Destination" : "Add Destination"}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-8">
              {/* ── Basic Information ───────────────────────────────────────── */}
              <div>
                <SectionTitle>Basic Information</SectionTitle>
                <div className="space-y-4">
                  <Input
                    isRequired
                    label="Name"
                    placeholder="Destination name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                  <Textarea
                    label="Description"
                    maxRows={10}
                    minRows={4}
                    placeholder="Complete description — history, what to do, tips for visitors..."
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                  <Select
                    isRequired
                    label="Categories"
                    placeholder="Select one or more categories"
                    selectedKeys={new Set(formCategoryIds)}
                    selectionMode="multiple"
                    onSelectionChange={(keys) =>
                      setFormCategoryIds(
                        keys === "all"
                          ? categories.map((c) => c.id)
                          : Array.from(keys as Set<string>),
                      )
                    }
                  >
                    {categories.map((c) => (
                      <SelectItem key={c.id}>{c.name}</SelectItem>
                    ))}
                  </Select>
                </div>
              </div>

              {/* ── Classification ──────────────────────────────────────────── */}
              <div>
                <SectionTitle>Classification</SectionTitle>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {clusters.length > 0 && (
                      <Select
                        label="Cluster / Region"
                        placeholder="Select cluster"
                        selectedKeys={formClusterId ? [formClusterId] : []}
                        onChange={(e) => setFormClusterId(e.target.value)}
                      >
                        {clusters.map((cl) => (
                          <SelectItem key={cl.id}>{cl.name}</SelectItem>
                        ))}
                      </Select>
                    )}
                    <Input
                      label="Municipality"
                      placeholder="e.g. Cebu City, Lapu-Lapu"
                      value={formMunicipality}
                      onChange={(e) => setFormMunicipality(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Budget Level"
                      selectedKeys={[formBudgetLevel]}
                      onChange={(e) => setFormBudgetLevel(e.target.value)}
                    >
                      <SelectItem key="budget">💰 Budget-friendly</SelectItem>
                      <SelectItem key="mid">💰💰 Mid-range</SelectItem>
                      <SelectItem key="premium">💰💰💰 Premium</SelectItem>
                    </Select>
                    <div>
                      <p className="text-xs text-default-500 mb-1 font-medium">Tags</p>
                      {/* chip display */}
                      <div className="flex flex-wrap gap-1 mb-2 min-h-[28px]">
                        {formTags.map((tag, i) => (
                          <Chip
                            key={i}
                            color="secondary"
                            size="sm"
                            variant="flat"
                            onClose={() =>
                              setFormTags((prev) => prev.filter((_, idx) => idx !== i))
                            }
                          >
                            {tag}
                          </Chip>
                        ))}
                      </div>
                      {/* text input — Enter or comma commits a tag */}
                      <Input
                        placeholder="Type a tag then press Enter (e.g. adventure, falls, heritage…)"
                        size="sm"
                        value={formTagInput}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v.endsWith(",")) {
                            const tag = v.slice(0, -1).trim().toLowerCase();
                            if (tag && !formTags.includes(tag))
                              setFormTags((prev) => [...prev, tag]);
                            setFormTagInput("");
                          } else {
                            setFormTagInput(v);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const tag = formTagInput.trim().toLowerCase();
                            if (tag && !formTags.includes(tag))
                              setFormTags((prev) => [...prev, tag]);
                            setFormTagInput("");
                          } else if (
                            e.key === "Backspace" &&
                            formTagInput === "" &&
                            formTags.length > 0
                          ) {
                            setFormTags((prev) => prev.slice(0, -1));
                          }
                        }}
                      />
                      {/* quick-add suggestions */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {["nature","heritage","food","adventure","shopping","beach","culture","religion","falls","island","hiking","diving","historical","nightlife","hotel","resort","scenic","wildlife","entertainment"].filter(
                          (s) => !formTags.includes(s)
                        ).map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="text-xs px-2 py-0.5 rounded-full border border-default-300 text-default-500 hover:bg-default-100 transition-colors"
                            onClick={() => setFormTags((prev) => [...prev, s])}
                          >
                            +{s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <Switch
                      isSelected={formFamilyFriendly}
                      onValueChange={setFormFamilyFriendly}
                    >
                      Family-friendly
                    </Switch>
                    <Switch
                      isSelected={formIsActive}
                      onValueChange={setFormIsActive}
                    >
                      Active (visible in app)
                    </Switch>
                    <Switch
                      isSelected={formIsFeatured}
                      onValueChange={setFormIsFeatured}
                    >
                      Featured
                    </Switch>
                  </div>
                </div>
              </div>

              {/* ── Destination Images ──────────────────────────────────────── */}
              <div>
                <SectionTitle>Destination Images</SectionTitle>
                <div className="space-y-3">
                  {formImages.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {formImages.map((url, i) => (
                        <div
                          key={i}
                          className="relative group rounded-lg overflow-hidden h-24"
                        >
                          <img
                            alt=""
                            className="w-full h-full object-cover"
                            src={url}
                          />
                          <button
                            className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeMedia(url, setFormImages)}
                          >
                            ×
                          </button>
                          {i === 0 && (
                            <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                              Cover
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <label>
                    <UploadButton
                      disabled={uploading}
                      icon={
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                          />
                        </svg>
                      }
                      label="Upload Images"
                      onClick={() => imageInputRef.current?.click()}
                    />
                    <input
                      ref={imageInputRef}
                      multiple
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      type="file"
                      onChange={handleImageUpload}
                    />
                  </label>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    JPG, PNG, GIF · Max 5MB each · First image is the cover
                  </p>
                </div>
              </div>

              {/* ── Videos ──────────────────────────────────────────────────── */}
              <div>
                <SectionTitle>Videos</SectionTitle>
                {formVideos.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {formVideos.map((url, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-2 rounded-lg"
                        style={{ background: "var(--bg-3)" }}
                      >
                        <span className="text-sm truncate flex-1">
                          {url.split("/").pop()}
                        </span>
                        <Button
                          color="danger"
                          size="sm"
                          variant="flat"
                          onClick={() => removeMedia(url, setFormVideos)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <label>
                  <UploadButton
                    disabled={uploading}
                    icon={
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                      </svg>
                    }
                    label="Upload Video"
                    onClick={() => videoInputRef.current?.click()}
                  />
                  <input
                    ref={videoInputRef}
                    accept="video/*"
                    className="hidden"
                    disabled={uploading}
                    type="file"
                    onChange={handleVideoUpload}
                  />
                </label>
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  MP4, WebM, MOV · Max 50MB
                </p>
              </div>

              {/* ── Restaurant-specific ─────────────────────────────────────── */}
              {isRestaurant && (
                <div>
                  <SectionTitle>🍽 Restaurant Details</SectionTitle>
                  <div className="space-y-4">
                    <Input
                      description="Comma-separated"
                      label="Cuisine Types"
                      placeholder="Filipino, Seafood, Asian, Western..."
                      value={formCuisineTypes}
                      onChange={(e) => setFormCuisineTypes(e.target.value)}
                    />
                    {formCuisineTypes && (
                      <div className="flex flex-wrap gap-1">
                        {formCuisineTypes
                          .split(",")
                          .map((c) => c.trim())
                          .filter(Boolean)
                          .map((c, i) => (
                            <Chip
                              key={i}
                              color="warning"
                              size="sm"
                              variant="flat"
                            >
                              {c}
                            </Chip>
                          ))}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium mb-2">Service Types</p>
                      <div className="flex gap-2">
                        {Object.entries(SERVICE_TYPE_LABELS).map(
                          ([key, label]) => (
                            <Chip
                              key={key}
                              className="cursor-pointer"
                              color={
                                formServiceTypes.includes(key)
                                  ? "primary"
                                  : "default"
                              }
                              variant={
                                formServiceTypes.includes(key)
                                  ? "solid"
                                  : "flat"
                              }
                              onClick={() => toggleServiceType(key)}
                            >
                              {label}
                            </Chip>
                          ),
                        )}
                      </div>
                    </div>
                    <Input
                      label="Seating Capacity"
                      placeholder="e.g. 50"
                      type="number"
                      value={formSeatingCapacity}
                      onChange={(e) => setFormSeatingCapacity(e.target.value)}
                    />

                    {/* Menu Images */}
                    <div>
                      <p className="text-sm font-medium mb-2">Menu Images</p>
                      {formMenuImages.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          {formMenuImages.map((url, i) => (
                            <div
                              key={i}
                              className="relative group rounded-lg overflow-hidden h-24"
                            >
                              <img
                                alt=""
                                className="w-full h-full object-cover"
                                src={url}
                              />
                              <button
                                className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() =>
                                  removeMedia(url, setFormMenuImages)
                                }
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label>
                        <UploadButton
                          disabled={uploading}
                          icon={
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                              />
                            </svg>
                          }
                          label="Upload Menu Images"
                          onClick={() => menuImageInputRef.current?.click()}
                        />
                        <input
                          ref={menuImageInputRef}
                          multiple
                          accept="image/*"
                          className="hidden"
                          disabled={uploading}
                          type="file"
                          onChange={handleMenuImageUpload}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Hotel / Accommodation-specific ──────────────────────────── */}
              {isHotel && (
                <div>
                  <SectionTitle>🏨 Accommodation Details</SectionTitle>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium mb-2">Star Rating</p>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            className="text-2xl transition-colors"
                            style={{
                              color:
                                n <= formStarRating ? "#f59e0b" : "#d1d5db",
                            }}
                            type="button"
                            onClick={() =>
                              setFormStarRating(n === formStarRating ? 0 : n)
                            }
                          >
                            ★
                          </button>
                        ))}
                        {formStarRating > 0 && (
                          <span className="text-sm self-center ml-2 text-gray-500">
                            {formStarRating}-star
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="Check-in Time"
                        type="time"
                        value={formCheckIn}
                        onChange={(e) => setFormCheckIn(e.target.value)}
                      />
                      <Input
                        label="Check-out Time"
                        type="time"
                        value={formCheckOut}
                        onChange={(e) => setFormCheckOut(e.target.value)}
                      />
                    </div>
                    <p className="text-sm font-medium">Room Pricing</p>
                    <div className="grid grid-cols-3 gap-4">
                      <Input
                        label="Nightly Rate From (₱)"
                        placeholder="1500"
                        startContent={
                          <span className="text-gray-400 text-sm">₱</span>
                        }
                        type="number"
                        value={formPerNightMin}
                        onChange={(e) => setFormPerNightMin(e.target.value)}
                      />
                      <Input
                        label="Nightly Rate To (₱)"
                        placeholder="5000"
                        startContent={
                          <span className="text-gray-400 text-sm">₱</span>
                        }
                        type="number"
                        value={formPerNightMax}
                        onChange={(e) => setFormPerNightMax(e.target.value)}
                      />
                      <Input
                        label="Hourly Rate (₱)"
                        placeholder="Optional"
                        startContent={
                          <span className="text-gray-400 text-sm">₱</span>
                        }
                        type="number"
                        value={formPerHour}
                        onChange={(e) => setFormPerHour(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Contact & Social ─────────────────────────────────────────── */}
              <div>
                <SectionTitle>Contact & Social Media</SectionTitle>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Phone"
                      placeholder="+63 917 123 4567"
                      value={formContact.contact_phone}
                      onChange={(e) =>
                        setFormContact({
                          ...formContact,
                          contact_phone: e.target.value,
                        })
                      }
                    />
                    <Input
                      label="Email"
                      placeholder="info@example.com"
                      type="email"
                      value={formContact.contact_email}
                      onChange={(e) =>
                        setFormContact({
                          ...formContact,
                          contact_email: e.target.value,
                        })
                      }
                    />
                  </div>
                  <Input
                    label="Website URL"
                    placeholder="https://example.com"
                    value={formContact.website_url}
                    onChange={(e) =>
                      setFormContact({
                        ...formContact,
                        website_url: e.target.value,
                      })
                    }
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Facebook Page URL"
                      placeholder="https://facebook.com/page"
                      value={formContact.facebook_url}
                      onChange={(e) =>
                        setFormContact({
                          ...formContact,
                          facebook_url: e.target.value,
                        })
                      }
                    />
                    <Input
                      label="Instagram URL"
                      placeholder="https://instagram.com/handle"
                      value={formContact.instagram_url}
                      onChange={(e) =>
                        setFormContact({
                          ...formContact,
                          instagram_url: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* ── Operating Hours ──────────────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <SectionTitle>Operating Hours</SectionTitle>
                  <Switch
                    isSelected={formHoursEnabled}
                    size="sm"
                    onValueChange={setFormHoursEnabled}
                  >
                    {formHoursEnabled ? "Enabled" : "Not set"}
                  </Switch>
                </div>
                {formHoursEnabled && (
                  <div
                    className="space-y-2 rounded-lg p-3"
                    style={{ background: "var(--bg-3)" }}
                  >
                    {DAYS.map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-sm w-24 font-medium">
                          {label}
                        </span>
                        <Switch
                          color="danger"
                          isSelected={formHours[key]?.closed ?? false}
                          size="sm"
                          onValueChange={(v) => updateDayHour(key, "closed", v)}
                        >
                          <span className="text-xs">
                            {formHours[key]?.closed ? "Closed" : "Open"}
                          </span>
                        </Switch>
                        {!formHours[key]?.closed && (
                          <>
                            <input
                              className="text-sm px-2 py-1 rounded border"
                              style={{
                                borderColor: "var(--border-medium)",
                                background: "var(--bg-2)",
                                color: "var(--text)",
                              }}
                              type="time"
                              value={formHours[key]?.open ?? "08:00"}
                              onChange={(e) =>
                                updateDayHour(key, "open", e.target.value)
                              }
                            />
                            <span className="text-gray-400 text-xs">to</span>
                            <input
                              className="text-sm px-2 py-1 rounded border"
                              style={{
                                borderColor: "var(--border-medium)",
                                background: "var(--bg-2)",
                                color: "var(--text)",
                              }}
                              type="time"
                              value={formHours[key]?.close ?? "18:00"}
                              onChange={(e) =>
                                updateDayHour(key, "close", e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Location ─────────────────────────────────────────────────── */}
              <div>
                <SectionTitle>Location</SectionTitle>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      isRequired
                      label="Latitude"
                      placeholder="10.3157"
                      step="0.000001"
                      type="number"
                      value={formData.latitude}
                      onChange={(e) =>
                        setFormData({ ...formData, latitude: e.target.value })
                      }
                    />
                    <Input
                      isRequired
                      label="Longitude"
                      placeholder="123.8854"
                      step="0.000001"
                      type="number"
                      value={formData.longitude}
                      onChange={(e) =>
                        setFormData({ ...formData, longitude: e.target.value })
                      }
                    />
                  </div>
                  <Input
                    label="Address"
                    placeholder="Full address"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* ── Fees & Visiting Info ─────────────────────────────────────── */}
              <div>
                <SectionTitle>Fees &amp; Visiting Info</SectionTitle>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Entrance Fee (Local)"
                      startContent={
                        <span className="text-gray-400 text-sm">₱</span>
                      }
                      step="0.01"
                      type="number"
                      value={formData.entrance_fee_local}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          entrance_fee_local: e.target.value,
                        })
                      }
                    />
                    <Input
                      label="Entrance Fee (Foreign)"
                      startContent={
                        <span className="text-gray-400 text-sm">$</span>
                      }
                      step="0.01"
                      type="number"
                      value={formData.entrance_fee_foreign}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          entrance_fee_foreign: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Avg Visit Duration (min)"
                      type="number"
                      value={formData.average_visit_duration}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          average_visit_duration: e.target.value,
                        })
                      }
                    />
                    <Input
                      label="Best Time to Visit"
                      placeholder="e.g. Morning, Dry Season"
                      value={formData.best_time_to_visit}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          best_time_to_visit: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* ── Amenities ────────────────────────────────────────────────── */}
              <div>
                <SectionTitle>Amenities</SectionTitle>
                <Textarea
                  description="Comma-separated list"
                  label="Amenities"
                  minRows={2}
                  placeholder="Parking, Restroom, WiFi, Restaurant, Tour Guide, Gift Shop..."
                  value={formData.amenities}
                  onChange={(e) =>
                    setFormData({ ...formData, amenities: e.target.value })
                  }
                />
                {formData.amenities && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.amenities
                      .split(",")
                      .map((a) => a.trim())
                      .filter(Boolean)
                      .map((a, i) => (
                        <Chip key={i} color="primary" size="sm" variant="flat">
                          {a}
                        </Chip>
                      ))}
                  </div>
                )}
              </div>

              {/* ── Routing Flags ─────────────────────────────────────────────── */}
              <div>
                <SectionTitle>Routing Flags</SectionTitle>
                <Switch
                  isSelected={formIsIsland}
                  onValueChange={setFormIsIsland}
                >
                  <span className="font-medium">Island Destination</span>
                  <span className="text-sm text-gray-500 ml-2">
                    Routes will go through a pier (ferry travel required)
                  </span>
                </Switch>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="flat" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button color="primary" isLoading={saving} onClick={handleSubmit}>
              {editingDestination ? "Update" : "Create"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
}
