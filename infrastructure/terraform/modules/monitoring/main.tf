# CloudWatch monitoring and alerting

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

# SNS topic for alerts
resource "aws_sns_topic" "alerts" {
  name = "agentops-alerts-${var.environment}"
}

# CloudWatch dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "agentops-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "ClickHouse - Events Ingested"
          region  = "us-east-1"
          metrics = [
            ["AgentOps", "EventsIngested", "Environment", var.environment]
          ]
          period = 60
          stat   = "Sum"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "API Latency"
          region  = "us-east-1"
          metrics = [
            ["AgentOps", "APILatency", "Environment", var.environment, { stat = "p50" }],
            ["AgentOps", "APILatency", "Environment", var.environment, { stat = "p95" }],
            ["AgentOps", "APILatency", "Environment", var.environment, { stat = "p99" }]
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Error Rate"
          region  = "us-east-1"
          metrics = [
            ["AgentOps", "Errors", "Environment", var.environment]
          ]
          period = 60
          stat   = "Sum"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "RDS Connections"
          region  = "us-east-1"
          metrics = [
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", "agentops-${var.environment}"]
          ]
          period = 60
        }
      }
    ]
  })
}

# High error rate alarm
resource "aws_cloudwatch_metric_alarm" "high_error_rate" {
  alarm_name          = "agentops-high-error-rate-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AgentOps"
  period              = 300
  statistic           = "Sum"
  threshold           = 100
  alarm_description   = "High error rate detected"

  dimensions = {
    Environment = var.environment
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# High latency alarm
resource "aws_cloudwatch_metric_alarm" "high_latency" {
  alarm_name          = "agentops-high-latency-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "APILatency"
  namespace           = "AgentOps"
  period              = 60
  extended_statistic  = "p95"
  threshold           = 5000
  alarm_description   = "API latency p95 exceeded 5 seconds"

  dimensions = {
    Environment = var.environment
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# RDS CPU alarm
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "agentops-rds-cpu-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS CPU utilization high"

  dimensions = {
    DBInstanceIdentifier = "agentops-${var.environment}"
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# Outputs
output "sns_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "dashboard_url" {
  value = "https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}
