# Output values for Terraform configuration

# Network Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

output "database_subnet_ids" {
  description = "IDs of the database subnets"
  value       = aws_subnet.database[*].id
}

# Security Group Outputs
output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  description = "ID of the ECS security group"
  value       = aws_security_group.ecs.id
}

output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}

output "redis_security_group_id" {
  description = "ID of the Redis security group"
  value       = aws_security_group.redis.id
}

# Load Balancer Outputs
output "alb_dns_name" {
  description = "DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the load balancer"
  value       = aws_lb.main.zone_id
}

output "alb_arn" {
  description = "ARN of the load balancer"
  value       = aws_lb.main.arn
}

# ECS Outputs
output "ecs_cluster_id" {
  description = "ID of the ECS cluster"
  value       = aws_ecs_cluster.main.id
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.main.name
}

output "ecs_task_definition_arn" {
  description = "ARN of the ECS task definition"
  value       = aws_ecs_task_definition.main.arn
}

# Database Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "rds_port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "rds_database_name" {
  description = "RDS database name"
  value       = aws_db_instance.main.db_name
}

output "rds_username" {
  description = "RDS master username"
  value       = aws_db_instance.main.username
  sensitive   = true
}

output "database_url" {
  description = "Database connection URL"
  value       = "postgresql://${aws_db_instance.main.username}:${random_password.db_password.result}@${aws_db_instance.main.endpoint}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
  sensitive   = true
}

# Redis Outputs
output "redis_endpoint" {
  description = "Redis primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}

output "redis_port" {
  description = "Redis port"
  value       = aws_elasticache_replication_group.main.port
}

output "redis_url" {
  description = "Redis connection URL"
  value       = "rediss://:${random_password.redis_auth_token.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:${aws_elasticache_replication_group.main.port}"
  sensitive   = true
}

# Secrets Manager Outputs
output "db_credentials_secret_arn" {
  description = "ARN of the database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "redis_credentials_secret_arn" {
  description = "ARN of the Redis credentials secret"
  value       = aws_secretsmanager_secret.redis_credentials.arn
}

output "app_secrets_secret_arn" {
  description = "ARN of the application secrets"
  value       = aws_secretsmanager_secret.app_secrets.arn
}

# ECR Repository Outputs
output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = aws_ecr_repository.main.repository_url
}

output "ecr_repository_arn" {
  description = "ARN of the ECR repository"
  value       = aws_ecr_repository.main.arn
}

# IAM Role Outputs
output "ecs_task_execution_role_arn" {
  description = "ARN of the ECS task execution role"
  value       = aws_iam_role.ecs_task_execution.arn
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role"
  value       = aws_iam_role.ecs_task.arn
}

# CloudWatch Outputs
output "cloudwatch_log_group_name" {
  description = "Name of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.ecs_logs.name
}

output "cloudwatch_log_group_arn" {
  description = "ARN of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.ecs_logs.arn
}

# Route 53 Outputs (if created)
output "route53_record_name" {
  description = "Route 53 record name"
  value       = var.create_route53_record ? aws_route53_record.main[0].name : null
}

output "route53_record_fqdn" {
  description = "Route 53 record FQDN"
  value       = var.create_route53_record ? aws_route53_record.main[0].fqdn : null
}

# Certificate Manager Outputs (if using custom certificate)
output "ssl_certificate_arn" {
  description = "ARN of the SSL certificate"
  value       = var.ssl_certificate_arn != "" ? var.ssl_certificate_arn : (var.domain_name != "" ? aws_acm_certificate.main[0].arn : null)
}

# Application URL
output "application_url" {
  description = "Application URL"
  value       = var.create_route53_record && var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_lb.main.dns_name}"
}

# Auto Scaling Outputs
output "autoscaling_target_arn" {
  description = "ARN of the auto scaling target"
  value       = aws_appautoscaling_target.ecs_target.arn
}

# Bastion Host Outputs (if enabled)
output "bastion_public_ip" {
  description = "Public IP of the bastion host"
  value       = var.enable_bastion_host ? aws_instance.bastion[0].public_ip : null
}

output "bastion_private_key_secret_arn" {
  description = "ARN of the bastion private key secret"
  value       = aws_secretsmanager_secret.ec2_private_key.arn
}

# Environment Information
output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "region" {
  description = "AWS region"
  value       = var.aws_region
}

# Cost Estimation (informational)
output "estimated_monthly_cost" {
  description = "Estimated monthly cost (USD) - for reference only"
  value = {
    ecs_tasks = {
      description = "ECS tasks (${var.ecs_task_cpu} CPU, ${var.ecs_task_memory} MB RAM)"
      estimated_cost = local.env_config.desired_count * 0.04048 * (var.ecs_task_cpu / 1024) * 730 + local.env_config.desired_count * 0.004445 * (var.ecs_task_memory / 1024) * 730
    }
    rds = {
      description = "RDS ${local.env_config.instance_class}"
      estimated_cost = local.rds_cost_map[local.env_config.instance_class]
    }
    alb = {
      description = "Application Load Balancer"
      estimated_cost = 16.20  # $0.0225/hour * 720 hours
    }
    data_transfer = {
      description = "Data transfer (estimated 100GB/month)"
      estimated_cost = 9.00
    }
  }
}

# Local values for cost estimation
locals {
  rds_cost_map = {
    "db.t3.micro"  = 13.32
    "db.t3.small"  = 26.64
    "db.t3.medium" = 53.28
    "db.t3.large"  = 106.56
  }
}

# Connection Information
output "connection_info" {
  description = "Connection information for the deployed infrastructure"
  value = {
    application_url = var.create_route53_record && var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_lb.main.dns_name}"
    health_check_url = var.create_route53_record && var.domain_name != "" ? "https://${var.domain_name}/api/health" : "https://${aws_lb.main.dns_name}/api/health"
    database_host = aws_db_instance.main.endpoint
    redis_host = aws_elasticache_replication_group.main.primary_endpoint_address
    ecs_cluster = aws_ecs_cluster.main.name
    log_group = aws_cloudwatch_log_group.ecs_logs.name
  }
  sensitive = true
}

# Deployment Commands
output "deployment_commands" {
  description = "Useful commands for deployment and management"
  value = {
    update_ecs_service = "aws ecs update-service --cluster ${aws_ecs_cluster.main.name} --service ${aws_ecs_service.main.name} --force-new-deployment --region ${var.aws_region}"
    view_logs = "aws logs tail ${aws_cloudwatch_log_group.ecs_logs.name} --follow --region ${var.aws_region}"
    connect_to_db = "aws secretsmanager get-secret-value --secret-id ${aws_secretsmanager_secret.db_credentials.name} --region ${var.aws_region} --query SecretString --output text | jq -r '.url'"
    scale_service = "aws ecs update-service --cluster ${aws_ecs_cluster.main.name} --service ${aws_ecs_service.main.name} --desired-count <COUNT> --region ${var.aws_region}"
    ecr_login = "aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${aws_ecr_repository.main.repository_url}"
  }
}