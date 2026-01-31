/**
 * PostgreSQL client for metadata queries
 */

// Using a simple approach without heavy ORM
// In production, consider using Prisma or Drizzle

interface PostgresConfig {
  connectionString: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface Project {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface ApiKey {
  id: string;
  project_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  last_used_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

interface Alert {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  metric: string;
  condition: Record<string, unknown>;
  severity: string;
  channels: string[];
  enabled: boolean;
  last_triggered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface User {
  id: string;
  clerk_id: string;
  email: string;
  name: string | null;
  created_at: Date;
  updated_at: Date;
}

interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  joined_at: Date;
}

// Mock implementation for development
// Replace with actual PostgreSQL client in production
class PostgresClient {
  private connectionString: string;

  constructor(config?: Partial<PostgresConfig>) {
    this.connectionString =
      config?.connectionString || process.env.DATABASE_URL || "";
  }

  // Organizations
  async getOrganization(id: string): Promise<Organization | null> {
    // In production: SELECT * FROM organizations WHERE id = $1
    return {
      id,
      name: "Acme Corp",
      slug: "acme-corp",
      plan: "team",
      settings: { ssoEnabled: false },
      created_at: new Date("2026-01-01"),
      updated_at: new Date("2026-01-25"),
    };
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    return this.getOrganization("org_1");
  }

  async createOrganization(data: Partial<Organization>): Promise<Organization> {
    return {
      id: `org_${Date.now()}`,
      name: data.name || "New Organization",
      slug: data.slug || "new-org",
      plan: "free",
      settings: {},
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  async updateOrganization(
    id: string,
    data: Partial<Organization>,
  ): Promise<Organization> {
    const org = await this.getOrganization(id);
    return { ...org!, ...data, updated_at: new Date() };
  }

  // Projects
  async getProject(id: string): Promise<Project | null> {
    return {
      id,
      organization_id: "org_1",
      name: "My AI Project",
      slug: "my-ai-project",
      settings: {
        dataRetentionDays: 30,
        piiRedaction: true,
      },
      created_at: new Date("2026-01-01"),
      updated_at: new Date("2026-01-25"),
    };
  }

  async getProjectsByOrganization(organizationId: string): Promise<Project[]> {
    return [(await this.getProject("proj_1")) as Project];
  }

  async createProject(data: Partial<Project>): Promise<Project> {
    return {
      id: `proj_${Date.now()}`,
      organization_id: data.organization_id || "org_1",
      name: data.name || "New Project",
      slug: data.slug || "new-project",
      settings: data.settings || {},
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    const project = await this.getProject(id);
    return { ...project!, ...data, updated_at: new Date() };
  }

  // API Keys
  async getApiKeys(projectId: string): Promise<ApiKey[]> {
    return [
      {
        id: "key_1",
        project_id: projectId,
        name: "Production Key",
        key_prefix: "ao_prod_xxx",
        key_hash: "hash123",
        scopes: ["ingest", "read"],
        last_used_at: new Date("2026-01-28T10:00:00Z"),
        expires_at: null,
        revoked_at: null,
        created_at: new Date("2026-01-01"),
      },
    ];
  }

  async createApiKey(data: {
    projectId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: string[];
    expiresAt?: Date;
  }): Promise<ApiKey> {
    return {
      id: `key_${Date.now()}`,
      project_id: data.projectId,
      name: data.name,
      key_prefix: data.keyPrefix,
      key_hash: data.keyHash,
      scopes: data.scopes,
      last_used_at: null,
      expires_at: data.expiresAt || null,
      revoked_at: null,
      created_at: new Date(),
    };
  }

  async revokeApiKey(id: string): Promise<void> {
    // UPDATE api_keys SET revoked_at = NOW() WHERE id = $1
  }

  async validateApiKey(
    keyPrefix: string,
    keyHash: string,
  ): Promise<ApiKey | null> {
    // SELECT * FROM api_keys WHERE key_prefix = $1 AND key_hash = $2 AND revoked_at IS NULL
    return null;
  }

  // Alerts
  async getAlerts(projectId: string): Promise<Alert[]> {
    return [
      {
        id: "alert_1",
        project_id: projectId,
        name: "High Error Rate",
        description: "Alert when error rate exceeds 5%",
        metric: "error_rate",
        condition: { operator: "gt", threshold: 5, window: "5m" },
        severity: "critical",
        channels: ["email", "slack"],
        enabled: true,
        last_triggered_at: new Date("2026-01-28T09:00:00Z"),
        created_at: new Date("2026-01-01"),
        updated_at: new Date("2026-01-25"),
      },
    ];
  }

  async createAlert(data: Partial<Alert>): Promise<Alert> {
    return {
      id: `alert_${Date.now()}`,
      project_id: data.project_id || "proj_1",
      name: data.name || "New Alert",
      description: data.description || null,
      metric: data.metric || "error_rate",
      condition: data.condition || {},
      severity: data.severity || "warning",
      channels: data.channels || ["email"],
      enabled: true,
      last_triggered_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  async updateAlert(id: string, data: Partial<Alert>): Promise<Alert> {
    const alerts = await this.getAlerts("proj_1");
    const alert = alerts.find((a) => a.id === id);
    return { ...alert!, ...data, updated_at: new Date() };
  }

  async deleteAlert(id: string): Promise<void> {
    // DELETE FROM alerts WHERE id = $1
  }

  // Users
  async getUserByClerkId(clerkId: string): Promise<User | null> {
    return {
      id: "user_1",
      clerk_id: clerkId,
      email: "user@example.com",
      name: "John Doe",
      created_at: new Date("2026-01-01"),
      updated_at: new Date("2026-01-01"),
    };
  }

  async createUser(data: {
    clerkId: string;
    email: string;
    name?: string;
  }): Promise<User> {
    return {
      id: `user_${Date.now()}`,
      clerk_id: data.clerkId,
      email: data.email,
      name: data.name || null,
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  async getOrganizationMembers(
    organizationId: string,
  ): Promise<(OrganizationMember & { user: User })[]> {
    return [
      {
        id: "member_1",
        organization_id: organizationId,
        user_id: "user_1",
        role: "owner",
        joined_at: new Date("2026-01-01"),
        user: {
          id: "user_1",
          clerk_id: "clerk_1",
          email: "admin@acme.com",
          name: "Admin",
          created_at: new Date("2026-01-01"),
          updated_at: new Date("2026-01-01"),
        },
      },
    ];
  }
}

// Singleton instance
let postgresClient: PostgresClient | null = null;

export function getPostgres(): PostgresClient {
  if (!postgresClient) {
    postgresClient = new PostgresClient();
  }
  return postgresClient;
}

export { PostgresClient };
export type { Organization, Project, ApiKey, Alert, User, OrganizationMember };
