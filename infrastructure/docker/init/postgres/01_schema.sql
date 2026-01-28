-- AgentOps PostgreSQL Schema
-- Metadata, configuration, and user management

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team', 'enterprise')),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (organization_id, slug)
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(255) UNIQUE, -- Clerk/Auth0 user ID
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization memberships
CREATE TABLE organization_members (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

-- API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 of actual key
    key_prefix VARCHAR(16) NOT NULL, -- For display: "ao_proj123_abc..."
    scopes TEXT[] DEFAULT ARRAY['ingest', 'read'],
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    condition JSONB NOT NULL,
    -- Example condition: {"metric": "error_rate", "operator": ">", "threshold": 0.05, "window": "5m"}
    severity VARCHAR(50) DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
    channels JSONB DEFAULT '[]',
    -- Example channels: [{"type": "slack", "webhook": "..."}, {"type": "email", "address": "..."}]
    enabled BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alert history
CREATE TABLE alert_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    triggered_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'triggered' CHECK (status IN ('triggered', 'acknowledged', 'resolved')),
    details JSONB DEFAULT '{}',
    acknowledged_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Model pricing (updated periodically)
CREATE TABLE model_pricing (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(100) NOT NULL,
    model VARCHAR(255) NOT NULL,
    input_cost_per_1k DECIMAL(12, 8) NOT NULL,
    output_cost_per_1k DECIMAL(12, 8) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (provider, model, effective_from)
);

-- Dashboard configurations
CREATE TABLE dashboards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    layout JSONB DEFAULT '[]',
    is_default BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved queries
CREATE TABLE saved_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    query_type VARCHAR(50) NOT NULL CHECK (query_type IN ('sessions', 'events', 'metrics')),
    filters JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_projects_organization ON projects(organization_id);
CREATE INDEX idx_api_keys_project ON api_keys(project_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_alerts_project ON alerts(project_id);
CREATE INDEX idx_alert_events_alert ON alert_events(alert_id);
CREATE INDEX idx_model_pricing_model ON model_pricing(provider, model);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboards_updated_at
    BEFORE UPDATE ON dashboards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_queries_updated_at
    BEFORE UPDATE ON saved_queries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default model pricing
INSERT INTO model_pricing (provider, model, input_cost_per_1k, output_cost_per_1k, effective_from) VALUES
    ('openai', 'gpt-4o', 0.0025, 0.01, '2024-01-01'),
    ('openai', 'gpt-4o-mini', 0.00015, 0.0006, '2024-01-01'),
    ('openai', 'gpt-4-turbo', 0.01, 0.03, '2024-01-01'),
    ('openai', 'gpt-4', 0.03, 0.06, '2024-01-01'),
    ('openai', 'gpt-3.5-turbo', 0.0005, 0.0015, '2024-01-01'),
    ('openai', 'gpt-5', 0.005, 0.015, '2025-01-01'),
    ('openai', 'gpt-5-mini', 0.001, 0.003, '2025-01-01'),
    ('anthropic', 'claude-3-5-sonnet-20241022', 0.003, 0.015, '2024-01-01'),
    ('anthropic', 'claude-3-5-haiku-20241022', 0.001, 0.005, '2024-01-01'),
    ('anthropic', 'claude-3-opus-20240229', 0.015, 0.075, '2024-01-01'),
    ('anthropic', 'claude-sonnet-4', 0.003, 0.015, '2025-01-01'),
    ('anthropic', 'claude-haiku-4', 0.0008, 0.004, '2025-01-01'),
    ('anthropic', 'claude-opus-4', 0.015, 0.075, '2025-01-01')
ON CONFLICT DO NOTHING;

-- Create a test organization and project for development
INSERT INTO organizations (id, name, slug, plan) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Development', 'dev', 'enterprise')
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, organization_id, name, slug) VALUES
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Test Project', 'test')
ON CONFLICT DO NOTHING;
