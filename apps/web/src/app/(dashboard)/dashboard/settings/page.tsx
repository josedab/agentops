"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<
    "project" | "organization" | "team" | "billing" | "audit"
  >("project");

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your project and organization settings
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-6">
          {[
            { id: "project" as const, label: "Project" },
            { id: "organization" as const, label: "Organization" },
            { id: "team" as const, label: "Team" },
            { id: "billing" as const, label: "Usage & Billing" },
            { id: "audit" as const, label: "Audit Log" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "project" && <ProjectSettings />}
      {activeTab === "organization" && <OrganizationSettings />}
      {activeTab === "team" && <TeamSettings />}
      {activeTab === "billing" && <BillingSettings />}
      {activeTab === "audit" && <AuditLog />}
    </div>
  );
}

function ProjectSettings() {
  const {
    data: project,
    isLoading,
    refetch,
  } = trpc.settings.getProject.useQuery({});
  const updateMutation = trpc.settings.updateProject.useMutation({
    onSuccess: () => refetch(),
  });

  const [formData, setFormData] = useState({
    name: "",
    dataRetentionDays: 30,
    piiRedaction: true,
    webhookUrl: "",
    alertEmail: "",
    dailyBudget: 100,
    monthlyBudget: 2500,
    budgetAlertThreshold: 80,
    qualityThreshold: 6.0,
  });

  // Initialize form when data loads
  if (project && formData.name === "") {
    setFormData({
      name: project.name,
      dataRetentionDays: project.settings.dataRetentionDays,
      piiRedaction: project.settings.piiRedaction,
      webhookUrl: project.settings.webhookUrl || "",
      alertEmail: project.settings.alertEmail || "",
      dailyBudget: project.settings.costBudget.daily,
      monthlyBudget: project.settings.costBudget.monthly,
      budgetAlertThreshold: project.settings.costBudget.alertThreshold,
      qualityThreshold: project.settings.qualityThreshold,
    });
  }

  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          General
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Data Retention (days)
            </label>
            <select
              value={formData.dataRetentionDays}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  dataRetentionDays: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>365 days</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="piiRedaction"
              checked={formData.piiRedaction}
              onChange={(e) =>
                setFormData({ ...formData, piiRedaction: e.target.checked })
              }
              className="rounded border-gray-300"
            />
            <label
              htmlFor="piiRedaction"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              Enable PII Redaction
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Notifications
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Alert Email
            </label>
            <input
              type="email"
              value={formData.alertEmail}
              onChange={(e) =>
                setFormData({ ...formData, alertEmail: e.target.value })
              }
              placeholder="alerts@example.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Webhook URL
            </label>
            <input
              type="url"
              value={formData.webhookUrl}
              onChange={(e) =>
                setFormData({ ...formData, webhookUrl: e.target.value })
              }
              placeholder="https://hooks.slack.com/..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Cost Controls
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Daily Budget ($)
            </label>
            <input
              type="number"
              value={formData.dailyBudget}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  dailyBudget: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Monthly Budget ($)
            </label>
            <input
              type="number"
              value={formData.monthlyBudget}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  monthlyBudget: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Alert Threshold (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={formData.budgetAlertThreshold}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  budgetAlertThreshold: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Quality Threshold
            </label>
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={formData.qualityThreshold}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  qualityThreshold: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      <button
        onClick={() =>
          updateMutation.mutate({
            projectId: project!.id,
            name: formData.name,
            settings: {
              dataRetentionDays: formData.dataRetentionDays,
              piiRedaction: formData.piiRedaction,
              webhookUrl: formData.webhookUrl || null,
              alertEmail: formData.alertEmail || null,
              costBudget: {
                daily: formData.dailyBudget,
                monthly: formData.monthlyBudget,
                alertThreshold: formData.budgetAlertThreshold,
              },
              qualityThreshold: formData.qualityThreshold,
            },
          })
        }
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Save Changes
      </button>
    </div>
  );
}

function OrganizationSettings() {
  const { data: org, isLoading } = trpc.settings.getOrganization.useQuery({});

  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Organization Details
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              defaultValue={org?.name}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Slug
            </label>
            <input
              type="text"
              defaultValue={org?.slug}
              disabled
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          SSO Configuration
        </h2>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ssoEnabled"
              defaultChecked={org?.settings.ssoEnabled}
              className="rounded border-gray-300"
            />
            <label
              htmlFor="ssoEnabled"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              Enable SSO
            </label>
            <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
              Enterprise
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              SSO Provider
            </label>
            <select
              defaultValue={org?.settings.ssoProvider ?? ""}
              disabled={!org?.settings.ssoEnabled}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
            >
              <option value="">Select provider</option>
              <option value="okta">Okta</option>
              <option value="azure">Azure AD</option>
              <option value="google">Google Workspace</option>
              <option value="onelogin">OneLogin</option>
            </select>
          </div>
        </div>
      </div>

      <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        Save Changes
      </button>
    </div>
  );
}

function TeamSettings() {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const {
    data: org,
    isLoading,
    refetch,
  } = trpc.settings.getOrganization.useQuery({});
  const inviteMutation = trpc.settings.inviteMember.useMutation({
    onSuccess: () => {
      setShowInviteModal(false);
      refetch();
    },
  });
  const updateRoleMutation = trpc.settings.updateMemberRole.useMutation({
    onSuccess: () => refetch(),
  });
  const removeMutation = trpc.settings.removeMember.useMutation({
    onSuccess: () => refetch(),
  });

  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Team Members
        </h2>
        <button
          onClick={() => setShowInviteModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Invite Member
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Member
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Joined
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {org?.members.map((member) => (
              <tr key={member.userId}>
                <td className="px-6 py-4">
                  <span className="text-gray-900 dark:text-white">
                    {member.email}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <select
                    value={member.role}
                    onChange={(e) =>
                      updateRoleMutation.mutate({
                        organizationId: org.id,
                        userId: member.userId,
                        role: e.target.value as "admin" | "member" | "viewer",
                      })
                    }
                    disabled={member.role === "owner"}
                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm disabled:opacity-50"
                  >
                    <option value="owner" disabled>
                      Owner
                    </option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {formatDistanceToNow(new Date(member.joinedAt), {
                    addSuffix: true,
                  })}
                </td>
                <td className="px-6 py-4 text-right">
                  {member.role !== "owner" && (
                    <button
                      onClick={() => {
                        if (confirm("Remove this team member?")) {
                          removeMutation.mutate({
                            organizationId: org.id,
                            userId: member.userId,
                          });
                        }
                      }}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Invite Team Member
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const email = (
                  form.elements.namedItem("email") as HTMLInputElement
                ).value;
                const role = (
                  form.elements.namedItem("role") as HTMLSelectElement
                ).value as "admin" | "member" | "viewer";
                inviteMutation.mutate({ organizationId: org!.id, email, role });
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Role
                  </label>
                  <select
                    name="role"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Send Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BillingSettings() {
  const { data: usage, isLoading } = trpc.settings.getUsage.useQuery({});

  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Current Plan */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Current Plan
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Billing period: {usage?.billingPeriod.start.toLocaleDateString()}{" "}
              - {usage?.billingPeriod.end.toLocaleDateString()}
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-gray-900 dark:text-white capitalize">
              {usage?.plan}
            </span>
            <div className="text-sm text-gray-500">
              ${usage?.cost.total}/month
            </div>
          </div>
        </div>
        <button className="mt-4 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20">
          Upgrade Plan
        </button>
      </div>

      {/* Usage */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Usage This Period
        </h2>

        <div className="space-y-4">
          <UsageBar
            label="Events"
            used={usage?.usage.events.used ?? 0}
            limit={usage?.usage.events.limit ?? 1}
            percentage={usage?.usage.events.percentage ?? 0}
          />
          <UsageBar
            label="Storage"
            used={usage?.usage.storage.used ?? 0}
            limit={usage?.usage.storage.limit ?? 1}
            percentage={usage?.usage.storage.percentage ?? 0}
            unit="GB"
          />
          <UsageBar
            label="API Calls"
            used={usage?.usage.apiCalls.used ?? 0}
            limit={usage?.usage.apiCalls.limit ?? 1}
            percentage={usage?.usage.apiCalls.percentage ?? 0}
          />
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Cost Breakdown
        </h2>
        <div className="space-y-2">
          <div className="flex justify-between py-2">
            <span className="text-gray-600 dark:text-gray-400">Base fee</span>
            <span className="text-gray-900 dark:text-white">
              ${usage?.cost.baseFee}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-600 dark:text-gray-400">
              Overage charges
            </span>
            <span className="text-gray-900 dark:text-white">
              ${usage?.cost.overage}
            </span>
          </div>
          <div className="flex justify-between py-2 border-t border-gray-200 dark:border-gray-700 font-semibold">
            <span className="text-gray-900 dark:text-white">Total</span>
            <span className="text-gray-900 dark:text-white">
              ${usage?.cost.total}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
  percentage,
  unit = "",
}: {
  label: string;
  used: number;
  limit: number;
  percentage: number;
  unit?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
        <span className="text-gray-900 dark:text-white">
          {used.toLocaleString()}
          {unit} / {limit.toLocaleString()}
          {unit}
        </span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            percentage >= 90
              ? "bg-red-500"
              : percentage >= 75
                ? "bg-yellow-500"
                : "bg-blue-500"
          }`}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
    </div>
  );
}

function AuditLog() {
  const { data: logs, isLoading } = trpc.settings.getAuditLogs.useQuery({});

  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Audit Log
        </h2>
        <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
          Enterprise
        </span>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Resource
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                IP Address
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {logs?.map((log) => (
              <tr
                key={log.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <td className="px-6 py-4 text-sm text-gray-500">
                  {formatDistanceToNow(new Date(log.timestamp), {
                    addSuffix: true,
                  })}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                  {log.userEmail}
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                    {log.action}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {log.resource}: {log.resourceId}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 font-mono">
                  {log.ipAddress}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
