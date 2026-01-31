/**
 * ClickHouse client for querying time-series event data
 */

interface ClickHouseConfig {
  url: string;
  database: string;
  username?: string;
  password?: string;
}

interface QueryResult<T> {
  data: T[];
  rows: number;
  statistics: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

class ClickHouseClient {
  private config: ClickHouseConfig;

  constructor(config?: Partial<ClickHouseConfig>) {
    this.config = {
      url: config?.url || process.env.CLICKHOUSE_URL || "http://localhost:8123",
      database: config?.database || "agentops",
      username: config?.username || "default",
      password: config?.password || process.env.CLICKHOUSE_PASSWORD || "",
    };
  }

  private async query<T = Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<QueryResult<T>> {
    const url = new URL(this.config.url);
    url.searchParams.set("database", this.config.database);
    url.searchParams.set("default_format", "JSONEachRow");

    // Substitute parameters
    let query = sql;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        const placeholder = `{${key}:String}`;
        query = query.replace(new RegExp(placeholder, "g"), this.escape(value));
      }
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        ...(this.config.username && {
          Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`,
        }),
      },
      body: query,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ClickHouse query failed: ${error}`);
    }

    const text = await response.text();
    const lines = text.trim().split("\n").filter(Boolean);
    const data = lines.map((line) => JSON.parse(line) as T);

    return {
      data,
      rows: data.length,
      statistics: {
        elapsed: 0,
        rows_read: data.length,
        bytes_read: text.length,
      },
    };
  }

  private escape(value: unknown): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "1" : "0";
    if (value instanceof Date) return `'${value.toISOString()}'`;
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  // Sessions queries
  async getSessions(params: {
    projectId: string;
    startTime?: Date;
    endTime?: Date;
    status?: string;
    userId?: string;
    featureId?: string;
    limit?: number;
    offset?: number;
  }) {
    const conditions = ["project_id = {projectId:String}"];
    if (params.startTime) conditions.push(`started_at >= {startTime:String}`);
    if (params.endTime) conditions.push(`started_at <= {endTime:String}`);
    if (params.status) conditions.push(`status = {status:String}`);
    if (params.userId) conditions.push(`user_id = {userId:String}`);
    if (params.featureId) conditions.push(`feature_id = {featureId:String}`);

    const sql = `
      SELECT 
        session_id,
        project_id,
        user_id,
        feature_id,
        status,
        event_count,
        total_tokens,
        total_cost,
        duration_ms,
        models,
        tools,
        tags,
        started_at,
        ended_at
      FROM sessions
      WHERE ${conditions.join(" AND ")}
      ORDER BY started_at DESC
      LIMIT ${params.limit || 50}
      OFFSET ${params.offset || 0}
    `;

    return this.query(sql, {
      projectId: params.projectId,
      startTime: params.startTime?.toISOString(),
      endTime: params.endTime?.toISOString(),
      status: params.status,
      userId: params.userId,
      featureId: params.featureId,
    });
  }

  async getSessionById(sessionId: string) {
    const sql = `
      SELECT *
      FROM sessions
      WHERE session_id = {sessionId:String}
      LIMIT 1
    `;
    const result = await this.query(sql, { sessionId });
    return result.data[0] || null;
  }

  async getSessionEvents(sessionId: string, limit = 100) {
    const sql = `
      SELECT *
      FROM events
      WHERE session_id = {sessionId:String}
      ORDER BY timestamp ASC
      LIMIT ${limit}
    `;
    return this.query(sql, { sessionId });
  }

  // Metrics queries
  async getMetrics(params: {
    projectId: string;
    startTime: Date;
    endTime: Date;
    granularity?: "minute" | "hour" | "day";
  }) {
    const granularity = params.granularity || "hour";
    const truncFn = {
      minute: "toStartOfMinute",
      hour: "toStartOfHour",
      day: "toStartOfDay",
    }[granularity];

    const sql = `
      SELECT 
        ${truncFn}(timestamp) as time_bucket,
        count() as event_count,
        countIf(event_type = 'session_start') as session_count,
        countIf(event_type = 'error') as error_count,
        sum(tokens_total) as total_tokens,
        sum(cost) as total_cost,
        avg(duration_ms) as avg_latency,
        quantile(0.95)(duration_ms) as p95_latency
      FROM events
      WHERE project_id = {projectId:String}
        AND timestamp >= {startTime:String}
        AND timestamp <= {endTime:String}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;

    return this.query(sql, {
      projectId: params.projectId,
      startTime: params.startTime.toISOString(),
      endTime: params.endTime.toISOString(),
    });
  }

  async getCostBreakdown(params: {
    projectId: string;
    startTime: Date;
    endTime: Date;
    groupBy: "model" | "feature" | "user";
  }) {
    const groupField = {
      model: "model",
      feature: "feature_id",
      user: "user_id",
    }[params.groupBy];

    const sql = `
      SELECT 
        ${groupField} as group_key,
        sum(cost) as total_cost,
        sum(tokens_total) as total_tokens,
        count() as event_count
      FROM events
      WHERE project_id = {projectId:String}
        AND timestamp >= {startTime:String}
        AND timestamp <= {endTime:String}
        AND cost > 0
      GROUP BY ${groupField}
      ORDER BY total_cost DESC
      LIMIT 50
    `;

    return this.query(sql, {
      projectId: params.projectId,
      startTime: params.startTime.toISOString(),
      endTime: params.endTime.toISOString(),
    });
  }

  async getLatencyPercentiles(params: {
    projectId: string;
    startTime: Date;
    endTime: Date;
    groupBy?: "model";
  }) {
    const groupBy = params.groupBy ? `model,` : "";
    const groupByClause = params.groupBy ? "GROUP BY model" : "";

    const sql = `
      SELECT 
        ${groupBy}
        quantile(0.50)(duration_ms) as p50,
        quantile(0.75)(duration_ms) as p75,
        quantile(0.95)(duration_ms) as p95,
        quantile(0.99)(duration_ms) as p99,
        avg(duration_ms) as avg_latency
      FROM events
      WHERE project_id = {projectId:String}
        AND timestamp >= {startTime:String}
        AND timestamp <= {endTime:String}
        AND duration_ms > 0
      ${groupByClause}
    `;

    return this.query(sql, {
      projectId: params.projectId,
      startTime: params.startTime.toISOString(),
      endTime: params.endTime.toISOString(),
    });
  }

  // Aggregated stats
  async getProjectStats(projectId: string, days = 30) {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - days);

    const sql = `
      SELECT 
        count(DISTINCT session_id) as total_sessions,
        count() as total_events,
        sum(cost) as total_cost,
        sum(tokens_total) as total_tokens,
        countIf(event_type = 'error') as total_errors,
        avg(duration_ms) as avg_latency
      FROM events
      WHERE project_id = {projectId:String}
        AND timestamp >= {startTime:String}
    `;

    const result = await this.query(sql, {
      projectId,
      startTime: startTime.toISOString(),
    });
    return result.data[0];
  }
}

// Singleton instance
let clickhouseClient: ClickHouseClient | null = null;

export function getClickHouse(): ClickHouseClient {
  if (!clickhouseClient) {
    clickhouseClient = new ClickHouseClient();
  }
  return clickhouseClient;
}

export { ClickHouseClient };
export type { ClickHouseConfig, QueryResult };
