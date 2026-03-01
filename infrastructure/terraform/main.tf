terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.34"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "s3" {
    bucket         = "agentops-terraform-state"
    key            = "terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "agentops-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "agentops"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "domain" {
  description = "Primary domain"
  type        = string
  default     = "agentops.dev"
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

# VPC
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "agentops-${var.environment}"
  cidr = "10.0.0.0/16"

  azs             = slice(data.aws_availability_zones.available.names, 0, 3)
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = var.environment != "production"

  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "agentops-vpc-${var.environment}"
  }
}

# ClickHouse module
module "clickhouse" {
  source = "./modules/clickhouse"

  environment      = var.environment
  vpc_id           = module.vpc.vpc_id
  subnet_ids       = module.vpc.private_subnets
  instance_type    = var.environment == "production" ? "m6i.2xlarge" : "m6i.large"
  storage_size_gb  = var.environment == "production" ? 1000 : 100
}

# PostgreSQL module
module "postgres" {
  source = "./modules/postgres"

  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnets
  instance_class     = var.environment == "production" ? "db.r6g.large" : "db.t4g.micro"
  allocated_storage  = var.environment == "production" ? 100 : 20
  multi_az           = var.environment == "production"
}

# Redis for caching
module "redis" {
  source  = "terraform-aws-modules/elasticache/aws"
  version = "~> 1.0"

  cluster_id           = "agentops-${var.environment}"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = var.environment == "production" ? "cache.r6g.large" : "cache.t4g.micro"
  num_cache_nodes      = var.environment == "production" ? 2 : 1
  parameter_group_name = "default.redis7"

  subnet_ids         = module.vpc.private_subnets
  security_group_ids = [aws_security_group.redis.id]

  tags = {
    Name = "agentops-redis-${var.environment}"
  }
}

resource "aws_security_group" "redis" {
  name_prefix = "agentops-redis-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [module.clickhouse.security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Cloudflare Workers
module "cloudflare" {
  source = "./modules/cloudflare"

  account_id = var.cloudflare_account_id
  domain     = var.domain
  environment = var.environment
}

# Monitoring
module "monitoring" {
  source = "./modules/monitoring"

  environment = var.environment
  vpc_id      = module.vpc.vpc_id
}

# Outputs
output "vpc_id" {
  value = module.vpc.vpc_id
}

output "clickhouse_endpoint" {
  value     = module.clickhouse.endpoint
  sensitive = true
}

output "postgres_endpoint" {
  value     = module.postgres.endpoint
  sensitive = true
}

output "redis_endpoint" {
  value = module.redis.cluster_address
}

output "ingest_worker_url" {
  value = module.cloudflare.ingest_worker_url
}
