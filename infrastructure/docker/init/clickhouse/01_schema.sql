-- AgentOps ClickHouse Schema
-- This file initializes the ClickHouse database schema

-- Create database
CREATE DATABASE IF NOT EXISTS agentops;

USE agentops;

-- Main events table
CREATE TABLE IF NOT EXISTS events (
    event_id UUID DEFAULT generateUUIDv4(),
    project_id String,
    session_id String,
    parent_event_id Nullable(String),
    
    -- Event classification
    event_type Enum8(
        'session_start' = 1,
        'session_end' = 2,
        'prompt' = 3,
        'response' = 4,
        'tool_call' = 5,
        'tool_result' = 6,
        'error' = 7,
        'custom' = 8
    ),
    
    -- Attribution
    user_id Nullable(String),
    feature_id Nullable(String),
    model Nullable(String),
    
    -- Content (compressed)
    content String CODEC(ZSTD(3)),
    
    -- Metrics
    prompt_tokens UInt32 DEFAULT 0,
    completion_tokens UInt32 DEFAULT 0,
    total_tokens UInt32 DEFAULT 0,
    cost Decimal64(8) DEFAULT 0,
    duration_ms UInt32 DEFAULT 0,
    
    -- Tool-specific
    tool_name Nullable(String),
    tool_status Nullable(Enum8('pending' = 1, 'success' = 2, 'error' = 3)),
    
    -- Metadata (compressed)
    metadata String DEFAULT '{}' CODEC(ZSTD(3)),
    tags Array(String) DEFAULT [],
    
    -- Timestamps
    timestamp DateTime64(3),
    received_at DateTime64(3) DEFAULT now64(3),
    
    -- Indexes for common queries
    INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_feature_id feature_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_event_type event_type TYPE set(8) GRANULARITY 1,
    INDEX idx_model model TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, timestamp, session_id, event_id)
TTL timestamp + INTERVAL 90 DAY DELETE
SETTINGS index_granularity = 8192;

-- Materialized view: 1-minute aggregations for real-time dashboards
CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1m
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(minute)
ORDER BY (project_id, model, feature_id, minute)
AS SELECT
    project_id,
    coalesce(model, 'unknown') AS model,
    coalesce(feature_id, 'default') AS feature_id,
    toStartOfMinute(timestamp) AS minute,
    
    -- Counts
    count() AS event_count,
    countIf(event_type = 'session_start') AS session_count,
    countIf(event_type IN ('error')) AS error_count,
    countIf(event_type = 'tool_call') AS tool_call_count,
    
    -- Tokens
    sum(prompt_tokens) AS prompt_tokens,
    sum(completion_tokens) AS completion_tokens,
    sum(prompt_tokens + completion_tokens) AS total_tokens,
    
    -- Cost
    sum(cost) AS total_cost,
    
    -- Latency aggregates
    avg(duration_ms) AS avg_duration_ms,
    max(duration_ms) AS max_duration_ms
FROM events
GROUP BY project_id, model, feature_id, minute;

-- Materialized view: Hourly rollups for historical queries
CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1h
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (project_id, model, feature_id, hour)
AS SELECT
    project_id,
    coalesce(model, 'unknown') AS model,
    coalesce(feature_id, 'default') AS feature_id,
    toStartOfHour(timestamp) AS hour,
    
    count() AS event_count,
    countIf(event_type = 'session_start') AS session_count,
    countIf(event_type IN ('error')) AS error_count,
    
    sum(prompt_tokens) AS prompt_tokens,
    sum(completion_tokens) AS completion_tokens,
    sum(cost) AS total_cost,
    
    avg(duration_ms) AS avg_duration_ms
FROM events
GROUP BY project_id, model, feature_id, hour;

-- Sessions summary table (updated via processing)
CREATE TABLE IF NOT EXISTS sessions (
    session_id String,
    project_id String,
    user_id Nullable(String),
    feature_id Nullable(String),
    
    status Enum8('active' = 1, 'completed' = 2, 'error' = 3) DEFAULT 'active',
    
    -- Aggregated data
    models Array(String) DEFAULT [],
    tools_used Array(String) DEFAULT [],
    
    event_count UInt32 DEFAULT 0,
    prompt_tokens UInt32 DEFAULT 0,
    completion_tokens UInt32 DEFAULT 0,
    total_cost Decimal64(8) DEFAULT 0,
    duration_ms UInt32 DEFAULT 0,
    
    error_message Nullable(String),
    
    metadata String DEFAULT '{}',
    tags Array(String) DEFAULT [],
    
    started_at DateTime64(3),
    ended_at Nullable(DateTime64(3)),
    updated_at DateTime64(3) DEFAULT now64(3),
    
    INDEX idx_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_status status TYPE set(3) GRANULARITY 1
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(started_at)
ORDER BY (project_id, session_id);

-- Cost by user (for attribution)
CREATE MATERIALIZED VIEW IF NOT EXISTS cost_by_user
ENGINE = SummingMergeTree()
ORDER BY (project_id, user_id, date)
AS SELECT
    project_id,
    coalesce(user_id, 'anonymous') AS user_id,
    toDate(timestamp) AS date,
    sum(cost) AS total_cost,
    sum(prompt_tokens + completion_tokens) AS total_tokens,
    count() AS event_count
FROM events
WHERE event_type = 'response'
GROUP BY project_id, user_id, date;

-- Tool performance metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS tool_metrics
ENGINE = SummingMergeTree()
ORDER BY (project_id, tool_name, date)
AS SELECT
    project_id,
    tool_name,
    toDate(timestamp) AS date,
    count() AS call_count,
    countIf(tool_status = 'success') AS success_count,
    countIf(tool_status = 'error') AS error_count,
    avg(duration_ms) AS avg_duration_ms,
    max(duration_ms) AS max_duration_ms
FROM events
WHERE event_type IN ('tool_call', 'tool_result') AND tool_name IS NOT NULL
GROUP BY project_id, tool_name, date;

-- Create user for application access
-- CREATE USER IF NOT EXISTS agentops_app IDENTIFIED BY 'app_password';
-- GRANT SELECT, INSERT ON agentops.* TO agentops_app;
