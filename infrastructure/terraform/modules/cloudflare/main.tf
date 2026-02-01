# Cloudflare Workers and DNS

variable "account_id" {
  type = string
}

variable "domain" {
  type = string
}

variable "environment" {
  type = string
}

# DNS Zone
data "cloudflare_zone" "main" {
  name = var.domain
}

# Ingest Worker
resource "cloudflare_worker_script" "ingest" {
  account_id = var.account_id
  name       = "agentops-ingest-${var.environment}"
  content    = file("${path.module}/workers/ingest.js")
  module     = true

  plain_text_binding {
    name = "ENVIRONMENT"
    text = var.environment
  }

  secret_text_binding {
    name = "CLICKHOUSE_URL"
    text = "placeholder" # Set via wrangler secrets
  }

  secret_text_binding {
    name = "CLICKHOUSE_PASSWORD"
    text = "placeholder"
  }
}

# Worker routes
resource "cloudflare_worker_route" "ingest" {
  zone_id     = data.cloudflare_zone.main.id
  pattern     = "ingest.${var.domain}/*"
  script_name = cloudflare_worker_script.ingest.name
}

# DNS records
resource "cloudflare_record" "app" {
  zone_id = data.cloudflare_zone.main.id
  name    = var.environment == "production" ? "app" : "app-${var.environment}"
  type    = "CNAME"
  value   = "cname.vercel-dns.com"
  proxied = true
}

resource "cloudflare_record" "ingest" {
  zone_id = data.cloudflare_zone.main.id
  name    = var.environment == "production" ? "ingest" : "ingest-${var.environment}"
  type    = "AAAA"
  value   = "100::"
  proxied = true
}

resource "cloudflare_record" "api" {
  zone_id = data.cloudflare_zone.main.id
  name    = var.environment == "production" ? "api" : "api-${var.environment}"
  type    = "CNAME"
  value   = "cname.vercel-dns.com"
  proxied = true
}

resource "cloudflare_record" "docs" {
  zone_id = data.cloudflare_zone.main.id
  name    = "docs"
  type    = "CNAME"
  value   = "cname.mintlify.com"
  proxied = false
}

# Page rules for caching
resource "cloudflare_page_rule" "api_cache" {
  zone_id  = data.cloudflare_zone.main.id
  target   = "api.${var.domain}/v1/*"
  priority = 1

  actions {
    cache_level = "bypass"
  }
}

# Outputs
output "ingest_worker_url" {
  value = "https://ingest.${var.domain}"
}

output "zone_id" {
  value = data.cloudflare_zone.main.id
}
