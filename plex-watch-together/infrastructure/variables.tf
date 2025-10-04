# Variables for Terraform configuration

variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Environment name (e.g., dev, staging, production)"
  type        = string
  default     = "production"
  
  validation {
    condition     = can(regex("^(dev|development|staging|stage|prod|production)$", var.environment))
    error_message = "Environment must be one of: dev, development, staging, stage, prod, production."
  }
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "plex-watch-together"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-west-2a", "us-west-2b", "us-west-2c"]
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnets"
  type        = bool
  default     = true
}

variable "bastion_allowed_cidrs" {
  description = "CIDR blocks allowed to connect to bastion host"
  type        = list(string)
  default     = ["0.0.0.0/0"]  # Restrict this in production
}

# ECS Configuration
variable "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
  default     = "plex-watch-together"
}

variable "ecs_service_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}

variable "ecs_task_cpu" {
  description = "CPU units for ECS task"
  type        = number
  default     = 1024
}

variable "ecs_task_memory" {
  description = "Memory (MB) for ECS task"
  type        = number
  default     = 2048
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

# Database Configuration
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS instance (GB)"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum allocated storage for RDS instance (GB)"
  type        = number
  default     = 100
}

variable "db_backup_retention_period" {
  description = "Backup retention period (days)"
  type        = number
  default     = 7
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment for RDS"
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "Enable deletion protection for RDS"
  type        = bool
  default     = true
}

# Redis Configuration
variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1
}

variable "redis_parameter_group_name" {
  description = "Parameter group name for Redis"
  type        = string
  default     = "default.redis7"
}

variable "redis_port" {
  description = "Port for Redis"
  type        = number
  default     = 6379
}

# Auto Scaling Configuration
variable "autoscaling_min_capacity" {
  description = "Minimum capacity for auto scaling"
  type        = number
  default     = 1
}

variable "autoscaling_max_capacity" {
  description = "Maximum capacity for auto scaling"
  type        = number
  default     = 10
}

variable "autoscaling_target_cpu" {
  description = "Target CPU utilization for auto scaling"
  type        = number
  default     = 70
}

variable "autoscaling_target_memory" {
  description = "Target memory utilization for auto scaling"
  type        = number
  default     = 80
}

# Load Balancer Configuration
variable "health_check_path" {
  description = "Health check path for ALB"
  type        = string
  default     = "/api/health"
}

variable "health_check_interval" {
  description = "Health check interval (seconds)"
  type        = number
  default     = 30
}

variable "health_check_timeout" {
  description = "Health check timeout (seconds)"
  type        = number
  default     = 5
}

variable "healthy_threshold" {
  description = "Healthy threshold count"
  type        = number
  default     = 2
}

variable "unhealthy_threshold" {
  description = "Unhealthy threshold count"
  type        = number
  default     = 3
}

# Domain and SSL Configuration
variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID"
  type        = string
  default     = ""
}

variable "create_route53_record" {
  description = "Create Route 53 DNS record"
  type        = bool
  default     = false
}

variable "ssl_certificate_arn" {
  description = "ARN of SSL certificate in ACM"
  type        = string
  default     = ""
}

# Monitoring Configuration
variable "enable_cloudwatch_logs" {
  description = "Enable CloudWatch logs"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention period (days)"
  type        = number
  default     = 14
}

variable "enable_enhanced_monitoring" {
  description = "Enable enhanced monitoring for RDS"
  type        = bool
  default     = false
}

variable "monitoring_interval" {
  description = "Enhanced monitoring interval (seconds)"
  type        = number
  default     = 60
}

# Backup Configuration
variable "enable_automated_backups" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

variable "backup_window" {
  description = "Backup window for RDS"
  type        = string
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  description = "Maintenance window for RDS"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

# Security Configuration
variable "enable_waf" {
  description = "Enable AWS WAF for ALB"
  type        = bool
  default     = false
}

variable "waf_rule_set" {
  description = "WAF rule set to use"
  type        = string
  default     = "AWSManagedRulesCommonRuleSet"
}

# Cost Optimization
variable "enable_spot_instances" {
  description = "Use Spot instances for ECS (cost optimization)"
  type        = bool
  default     = false
}

variable "spot_instance_types" {
  description = "Instance types for Spot fleet"
  type        = list(string)
  default     = ["t3.small", "t3.medium", "t3.large"]
}

# Tags
variable "additional_tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}

# Environment-specific overrides
variable "environment_config" {
  description = "Environment-specific configuration"
  type = map(object({
    instance_class              = string
    desired_count              = number
    min_capacity               = number
    max_capacity               = number
    enable_multi_az            = bool
    enable_deletion_protection = bool
    backup_retention_period    = number
    log_retention_days         = number
  }))
  
  default = {
    dev = {
      instance_class              = "db.t3.micro"
      desired_count              = 1
      min_capacity               = 1
      max_capacity               = 2
      enable_multi_az            = false
      enable_deletion_protection = false
      backup_retention_period    = 1
      log_retention_days         = 3
    }
    
    staging = {
      instance_class              = "db.t3.small"
      desired_count              = 1
      min_capacity               = 1
      max_capacity               = 3
      enable_multi_az            = false
      enable_deletion_protection = false
      backup_retention_period    = 3
      log_retention_days         = 7
    }
    
    production = {
      instance_class              = "db.t3.medium"
      desired_count              = 2
      min_capacity               = 2
      max_capacity               = 10
      enable_multi_az            = true
      enable_deletion_protection = true
      backup_retention_period    = 30
      log_retention_days         = 30
    }
  }
}

# Feature Flags
variable "feature_flags" {
  description = "Feature flags for the application"
  type = object({
    enable_offline_mode           = bool
    enable_advanced_sync          = bool
    enable_performance_monitoring = bool
    enable_debug_logs            = bool
    enable_metrics_collection    = bool
  })
  
  default = {
    enable_offline_mode           = true
    enable_advanced_sync          = true
    enable_performance_monitoring = true
    enable_debug_logs            = false
    enable_metrics_collection     = true
  }
}