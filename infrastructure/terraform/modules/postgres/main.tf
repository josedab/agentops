# PostgreSQL on AWS RDS

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "multi_az" {
  type    = bool
  default = false
}

# Security group
resource "aws_security_group" "postgres" {
  name_prefix = "agentops-postgres-"
  vpc_id      = var.vpc_id

  ingress {
    description = "PostgreSQL"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "agentops-postgres-${var.environment}"
  }
}

# Subnet group
resource "aws_db_subnet_group" "postgres" {
  name       = "agentops-postgres-${var.environment}"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "agentops-postgres-${var.environment}"
  }
}

# Parameter group
resource "aws_db_parameter_group" "postgres" {
  name_prefix = "agentops-postgres-"
  family      = "postgres16"

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  tags = {
    Name = "agentops-postgres-${var.environment}"
  }
}

# Generate password
resource "random_password" "postgres" {
  length  = 32
  special = false
}

# Store password in Secrets Manager
resource "aws_secretsmanager_secret" "postgres" {
  name_prefix = "agentops-postgres-${var.environment}-"
  description = "PostgreSQL credentials for AgentOps"
}

resource "aws_secretsmanager_secret_version" "postgres" {
  secret_id = aws_secretsmanager_secret.postgres.id
  secret_string = jsonencode({
    username = "agentops"
    password = random_password.postgres.result
    host     = aws_db_instance.postgres.address
    port     = 5432
    database = "agentops"
  })
}

# RDS instance
resource "aws_db_instance" "postgres" {
  identifier_prefix = "agentops-${var.environment}-"

  engine               = "postgres"
  engine_version       = "16.1"
  instance_class       = var.instance_class
  allocated_storage    = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 2
  storage_type         = "gp3"
  storage_encrypted    = true

  db_name  = "agentops"
  username = "agentops"
  password = random_password.postgres.result

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.postgres.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name

  multi_az               = var.multi_az
  publicly_accessible    = false
  skip_final_snapshot    = var.environment != "production"
  deletion_protection    = var.environment == "production"

  backup_retention_period = var.environment == "production" ? 30 : 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  performance_insights_enabled = var.environment == "production"

  tags = {
    Name = "agentops-postgres-${var.environment}"
  }
}

# Outputs
output "endpoint" {
  value = aws_db_instance.postgres.endpoint
}

output "secret_arn" {
  value = aws_secretsmanager_secret.postgres.arn
}

output "security_group_id" {
  value = aws_security_group.postgres.id
}
