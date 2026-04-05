import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
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

type RoutingBehavior =
  | "walk"
  | "private"
  | "direct_fare"
  | "corridor_stops"
  | "corridor_anywhere"
  | "ferry";

const ROUTING_BEHAVIOR_OPTIONS: {
  value: RoutingBehavior;
  label: string;
  description: string;
}[] = [
  { value: "walk", label: "Walk", description: "On foot — no fare" },
  {
    value: "private",
    label: "Private Vehicle",
    description: "Own car / van / motorbike — no fare",
  },
  {
    value: "direct_fare",
    label: "Direct Fare",
    description: "Door-to-door with fare (taxi, Grab)",
  },
  {
    value: "corridor_stops",
    label: "Corridor — Stops Only",
    description: "Fixed route; board at stops/terminals (bus, jeepney)",
  },
  {
    value: "corridor_anywhere",
    label: "Corridor — Anywhere",
    description: "Fixed route; flag from roadside (tricycle, habal-habal)",
  },
  { value: "ferry", label: "Ferry", description: "Pier-to-pier via sea" },
];

interface FareConfig {
  id: string;
  transport_type: string;
  display_name: string;
  description?: string;
  base_fare: number;
  per_km_rate: number;
  minimum_fare: number;
  peak_hour_multiplier: number;
  routing_behavior: RoutingBehavior;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

const MODE_ICONS: Record<string, string> = {
  walk: "🚶",
  tricycle: "🛺",
  jeepney: "🚌",
  bus: "🚍",
  bus_ac: "❄️🚍",
  habal_habal: "🏍️",
  taxi: "🚕",
  ferry: "⛴️",
};

export default function FareConfigsPage() {
  const [configs, setConfigs] = useState<FareConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<FareConfig | null>(null);
  const [formData, setFormData] = useState({
    transport_type: "",
    display_name: "",
    description: "",
    base_fare: "0",
    per_km_rate: "0",
    minimum_fare: "0",
    peak_hour_multiplier: "1.0",
    routing_behavior: "direct_fare" as RoutingBehavior,
    is_active: true,
    display_order: "0",
  });

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<FareConfig[]>(
        API_ENDPOINTS.FARE_CONFIGS,
      );

      if (response.success && response.data) {
        setConfigs(
          response.data.sort((a, b) => a.display_order - b.display_order),
        );
      }
    } catch {
      toast.error("Failed to fetch fare configs");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (config?: FareConfig) => {
    if (config) {
      setEditingConfig(config);
      setFormData({
        transport_type: config.transport_type,
        display_name: config.display_name,
        description: config.description || "",
        base_fare: config.base_fare.toString(),
        per_km_rate: config.per_km_rate.toString(),
        minimum_fare: config.minimum_fare.toString(),
        peak_hour_multiplier: config.peak_hour_multiplier.toString(),
        routing_behavior: config.routing_behavior ?? "direct_fare",
        is_active: config.is_active,
        display_order: config.display_order.toString(),
      });
    } else {
      setEditingConfig(null);
      setFormData({
        transport_type: "",
        display_name: "",
        description: "",
        base_fare: "0",
        per_km_rate: "0",
        minimum_fare: "0",
        peak_hour_multiplier: "1.0",
        routing_behavior: "direct_fare",
        is_active: true,
        display_order: "0",
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingConfig(null);
  };

  const handleSubmit = async () => {
    if (!formData.transport_type.trim() || !formData.display_name.trim()) {
      toast.error("Transport type and display name are required");

      return;
    }

    const payload = {
      transport_type: formData.transport_type.trim(),
      display_name: formData.display_name.trim(),
      description: formData.description.trim() || undefined,
      base_fare: parseFloat(formData.base_fare) || 0,
      per_km_rate: parseFloat(formData.per_km_rate) || 0,
      minimum_fare: parseFloat(formData.minimum_fare) || 0,
      peak_hour_multiplier: parseFloat(formData.peak_hour_multiplier) || 1.0,
      routing_behavior: formData.routing_behavior,
      is_active: formData.is_active,
      display_order: parseInt(formData.display_order) || 0,
    };

    try {
      if (editingConfig) {
        const response = await apiClient.put(
          `${API_ENDPOINTS.FARE_CONFIGS}/${editingConfig.id}`,
          payload,
        );

        if (response.success) {
          toast.success("Fare config updated successfully");
          fetchConfigs();
          handleCloseModal();
        }
      } else {
        const response = await apiClient.post(
          API_ENDPOINTS.FARE_CONFIGS,
          payload,
        );

        if (response.success) {
          toast.success("Fare config created successfully");
          fetchConfigs();
          handleCloseModal();
        }
      }
    } catch {
      toast.error("Failed to save fare config");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this fare config?")) return;
    try {
      const response = await apiClient.delete(
        `${API_ENDPOINTS.FARE_CONFIGS}/${id}`,
      );

      if (response.success) {
        toast.success("Fare config deleted successfully");
        fetchConfigs();
      }
    } catch {
      toast.error("Failed to delete fare config");
    }
  };

  const handleToggleActive = async (config: FareConfig) => {
    try {
      const response = await apiClient.put(
        `${API_ENDPOINTS.FARE_CONFIGS}/${config.id}`,
        { is_active: !config.is_active },
      );

      if (response.success) {
        toast.success(
          `Fare config ${config.is_active ? "deactivated" : "activated"} successfully`,
        );
        fetchConfigs();
      }
    } catch {
      toast.error("Failed to update fare config");
    }
  };

  return (
    <AdminLayout>
      <Head>
        <title>Fare Configs - AIRAT-NA Admin</title>
      </Head>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Fare Configurations</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage transport fare rates — LTFRB Philippine standards (
              {configs.length} configs)
            </p>
          </div>
          <Tooltip
            showArrow
            classNames={{
              content:
                "bg-slate-800 text-white border border-white/10 shadow-lg text-xs",
            }}
            content="Add a new fare configuration"
            delay={700}
            placement="left"
          >
            <Button color="primary" onClick={() => handleOpenModal()}>
              <svg
                className="h-5 w-5 mr-2"
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
              Add Fare Config
            </Button>
          </Tooltip>
        </div>

        {loading ? (
          <Card>
            <CardBody className="text-center py-12">
              <p className="text-gray-600">Loading fare configs...</p>
            </CardBody>
          </Card>
        ) : configs.length === 0 ? (
          <Card>
            <CardBody className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                No fare configs yet
              </p>
              <p className="text-sm text-gray-500">
                Click &quot;Add Fare Config&quot; to create your first fare
                configuration
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">
                    Mode
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">
                    Display Name
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">
                    Routing
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">
                    Base Fare
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">
                    Per KM
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">
                    Min Fare
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">
                    Peak ×
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => (
                  <tr
                    key={config.id}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <span className="mr-2">
                        {MODE_ICONS[config.transport_type] ?? "🚗"}
                      </span>
                      <code className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                        {config.transport_type}
                      </code>
                    </td>
                    <td className="py-3 px-4 font-medium">
                      {config.display_name}
                    </td>
                    <td className="py-3 px-4">
                      <Chip color="secondary" size="sm" variant="flat">
                        {ROUTING_BEHAVIOR_OPTIONS.find(
                          (o) => o.value === config.routing_behavior,
                        )?.label ??
                          config.routing_behavior ??
                          "—"}
                      </Chip>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      ₱{Number(config.base_fare).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      ₱{Number(config.per_km_rate).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      ₱{Number(config.minimum_fare).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {Number(config.peak_hour_multiplier).toFixed(2)}×
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Chip
                        color={config.is_active ? "success" : "default"}
                        size="sm"
                        variant="flat"
                      >
                        {config.is_active ? "Active" : "Inactive"}
                      </Chip>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1 justify-end">
                        <Tooltip
                          showArrow
                          classNames={{
                            content:
                              "bg-slate-800 text-white border border-white/10 shadow-lg text-xs",
                          }}
                          content="Edit this fare config"
                          delay={700}
                          placement="top"
                        >
                          <Button
                            color="primary"
                            size="sm"
                            variant="flat"
                            onClick={() => handleOpenModal(config)}
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
                            config.is_active
                              ? "Deactivate this fare"
                              : "Activate this fare"
                          }
                          delay={700}
                          placement="top"
                        >
                          <Button
                            color={config.is_active ? "warning" : "success"}
                            size="sm"
                            variant="flat"
                            onClick={() => handleToggleActive(config)}
                          >
                            {config.is_active ? "Disable" : "Enable"}
                          </Button>
                        </Tooltip>
                        <Tooltip
                          showArrow
                          classNames={{
                            content:
                              "bg-slate-800 text-white border border-white/10 shadow-lg text-xs",
                          }}
                          color="danger"
                          content="Permanently delete this fare config"
                          delay={700}
                          placement="top"
                        >
                          <Button
                            color="danger"
                            size="sm"
                            variant="flat"
                            onClick={() => handleDelete(config.id)}
                          >
                            Delete
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        classNames={modalClassNames}
        isOpen={isModalOpen}
        size="2xl"
        onClose={handleCloseModal}
      >
        <ModalContent>
          <ModalHeader>
            {editingConfig ? "Edit Fare Config" : "Add Fare Config"}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  isRequired
                  description="Unique identifier key (lowercase, underscores)"
                  label="Transport Type"
                  placeholder="e.g. tricycle, bus, taxi"
                  value={formData.transport_type}
                  onChange={(e) =>
                    setFormData({ ...formData, transport_type: e.target.value })
                  }
                />
                <Input
                  isRequired
                  label="Display Name"
                  placeholder="e.g. Tricycle"
                  value={formData.display_name}
                  onChange={(e) =>
                    setFormData({ ...formData, display_name: e.target.value })
                  }
                />
              </div>
              <Textarea
                label="Description"
                minRows={2}
                placeholder="Short description of this fare type"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  description="Fixed starting fare"
                  label="Base Fare (₱)"
                  placeholder="0.00"
                  type="number"
                  value={formData.base_fare}
                  onChange={(e) =>
                    setFormData({ ...formData, base_fare: e.target.value })
                  }
                />
                <Input
                  description="Fare added per kilometer"
                  label="Per KM Rate (₱)"
                  placeholder="0.00"
                  type="number"
                  value={formData.per_km_rate}
                  onChange={(e) =>
                    setFormData({ ...formData, per_km_rate: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  description="Minimum charge regardless of distance"
                  label="Minimum Fare (₱)"
                  placeholder="0.00"
                  type="number"
                  value={formData.minimum_fare}
                  onChange={(e) =>
                    setFormData({ ...formData, minimum_fare: e.target.value })
                  }
                />
                <Input
                  description="e.g. 1.2 = 20% surcharge during peak"
                  label="Peak Hour Multiplier"
                  placeholder="1.00"
                  type="number"
                  value={formData.peak_hour_multiplier}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      peak_hour_multiplier: e.target.value,
                    })
                  }
                />
              </div>
              <Input
                description="Lower numbers appear first in lists"
                label="Display Order"
                placeholder="0"
                type="number"
                value={formData.display_order}
                onChange={(e) =>
                  setFormData({ ...formData, display_order: e.target.value })
                }
              />
              <div>
                <p className="text-sm font-medium mb-2">Routing Behavior</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Controls how this transport type routes passengers —
                  determines which routing engine function is used.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ROUTING_BEHAVIOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                        formData.routing_behavior === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500"
                      }`}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          routing_behavior: opt.value,
                        })
                      }
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {opt.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <Switch
                isSelected={formData.is_active}
                onValueChange={(value) =>
                  setFormData({ ...formData, is_active: value })
                }
              >
                Active (used in routing fare calculations)
              </Switch>
            </div>
          </ModalBody>
          <ModalFooter>
            <Tooltip
              showArrow
              classNames={{
                content:
                  "bg-slate-800 text-white border border-white/10 shadow-lg text-xs",
              }}
              content="Discard changes and close"
              delay={700}
              placement="top"
            >
              <Button color="danger" variant="flat" onClick={handleCloseModal}>
                Cancel
              </Button>
            </Tooltip>
            <Tooltip
              showArrow
              classNames={{
                content:
                  "bg-slate-800 text-white border border-white/10 shadow-lg text-xs",
              }}
              content={
                editingConfig
                  ? "Save changes to this fare config"
                  : "Create the new fare config"
              }
              delay={700}
              placement="top"
            >
              <Button color="primary" onClick={handleSubmit}>
                {editingConfig ? "Update" : "Create"}
              </Button>
            </Tooltip>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
}
