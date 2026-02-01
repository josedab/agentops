# ClickHouse on AWS EC2 with EBS

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "instance_type" {
  type    = string
  default = "m6i.large"
}

variable "storage_size_gb" {
  type    = number
  default = 100
}

# Security group
resource "aws_security_group" "clickhouse" {
  name_prefix = "agentops-clickhouse-"
  vpc_id      = var.vpc_id

  ingress {
    description = "ClickHouse native"
    from_port   = 9000
    to_port     = 9000
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  ingress {
    description = "ClickHouse HTTP"
    from_port   = 8123
    to_port     = 8123
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
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
    Name = "agentops-clickhouse-${var.environment}"
  }
}

# IAM role for EC2
resource "aws_iam_role" "clickhouse" {
  name_prefix = "agentops-clickhouse-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.clickhouse.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "clickhouse" {
  name_prefix = "agentops-clickhouse-"
  role        = aws_iam_role.clickhouse.name
}

# Launch template
resource "aws_launch_template" "clickhouse" {
  name_prefix   = "agentops-clickhouse-"
  image_id      = data.aws_ami.amazon_linux.id
  instance_type = var.instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.clickhouse.arn
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.clickhouse.id]
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 50
      volume_type           = "gp3"
      delete_on_termination = true
    }
  }

  block_device_mappings {
    device_name = "/dev/xvdb"
    ebs {
      volume_size           = var.storage_size_gb
      volume_type           = "gp3"
      iops                  = 3000
      throughput            = 125
      delete_on_termination = false
    }
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    environment = var.environment
  }))

  tags = {
    Name = "agentops-clickhouse-${var.environment}"
  }
}

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

# Auto Scaling Group
resource "aws_autoscaling_group" "clickhouse" {
  name                = "agentops-clickhouse-${var.environment}"
  min_size            = 1
  max_size            = var.environment == "production" ? 3 : 1
  desired_capacity    = var.environment == "production" ? 2 : 1
  vpc_zone_identifier = var.subnet_ids

  launch_template {
    id      = aws_launch_template.clickhouse.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "agentops-clickhouse-${var.environment}"
    propagate_at_launch = true
  }
}

# Network Load Balancer
resource "aws_lb" "clickhouse" {
  name               = "agentops-ch-${var.environment}"
  internal           = true
  load_balancer_type = "network"
  subnets            = var.subnet_ids

  tags = {
    Name = "agentops-clickhouse-nlb-${var.environment}"
  }
}

resource "aws_lb_target_group" "clickhouse_http" {
  name     = "agentops-ch-http-${var.environment}"
  port     = 8123
  protocol = "TCP"
  vpc_id   = var.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    interval            = 10
    protocol            = "HTTP"
    path                = "/ping"
    port                = "8123"
  }
}

resource "aws_lb_listener" "clickhouse_http" {
  load_balancer_arn = aws_lb.clickhouse.arn
  port              = 8123
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.clickhouse_http.arn
  }
}

resource "aws_autoscaling_attachment" "clickhouse" {
  autoscaling_group_name = aws_autoscaling_group.clickhouse.name
  lb_target_group_arn    = aws_lb_target_group.clickhouse_http.arn
}

# Outputs
output "endpoint" {
  value = aws_lb.clickhouse.dns_name
}

output "security_group_id" {
  value = aws_security_group.clickhouse.id
}
