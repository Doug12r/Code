-- Add performance indexes for Phase 2 optimization
-- Focus on frequently queried fields and relationships

-- Room Members - critical for room access checks
CREATE INDEX IF NOT EXISTS "room_members_userId_isActive_idx" ON "room_members"("userId", "isActive");
CREATE INDEX IF NOT EXISTS "room_members_roomId_isActive_idx" ON "room_members"("roomId", "isActive");
CREATE INDEX IF NOT EXISTS "room_members_lastSeen_idx" ON "room_members"("lastSeen");

-- Watch Rooms - for room listing and filtering
CREATE INDEX IF NOT EXISTS "watch_rooms_creatorId_isActive_idx" ON "watch_rooms"("creatorId", "isActive");
CREATE INDEX IF NOT EXISTS "watch_rooms_isPublic_isActive_idx" ON "watch_rooms"("isPublic", "isActive");
CREATE INDEX IF NOT EXISTS "watch_rooms_updatedAt_idx" ON "watch_rooms"("updatedAt");
CREATE INDEX IF NOT EXISTS "watch_rooms_currentMediaId_idx" ON "watch_rooms"("currentMediaId");

-- Chat Messages - for message history queries
CREATE INDEX IF NOT EXISTS "chat_messages_roomId_createdAt_idx" ON "chat_messages"("roomId", "createdAt");
CREATE INDEX IF NOT EXISTS "chat_messages_userId_createdAt_idx" ON "chat_messages"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "chat_messages_type_createdAt_idx" ON "chat_messages"("type", "createdAt");

-- Sync Events - for performance monitoring and debugging
CREATE INDEX IF NOT EXISTS "sync_events_roomId_timestamp_idx" ON "sync_events"("roomId", "timestamp");
CREATE INDEX IF NOT EXISTS "sync_events_userId_timestamp_idx" ON "sync_events"("userId", "timestamp");
CREATE INDEX IF NOT EXISTS "sync_events_eventType_timestamp_idx" ON "sync_events"("eventType", "timestamp");

-- Users - for Plex integration and session management
CREATE INDEX IF NOT EXISTS "users_lastActiveAt_idx" ON "users"("lastActiveAt");
CREATE INDEX IF NOT EXISTS "users_plexServerId_idx" ON "users"("plexServerId");
CREATE INDEX IF NOT EXISTS "users_sessionCount_idx" ON "users"("sessionCount");

-- Sessions - for authentication optimization
CREATE INDEX IF NOT EXISTS "sessions_userId_expires_idx" ON "sessions"("userId", "expires");

-- Accounts - for NextAuth optimization
CREATE INDEX IF NOT EXISTS "accounts_userId_provider_idx" ON "accounts"("userId", "provider");

-- Performance Logs - for monitoring queries
CREATE INDEX IF NOT EXISTS "performance_logs_operation_timestamp_idx" ON "performance_logs"("operation", "timestamp");
CREATE INDEX IF NOT EXISTS "performance_logs_success_timestamp_idx" ON "performance_logs"("success", "timestamp");
CREATE INDEX IF NOT EXISTS "performance_logs_userId_timestamp_idx" ON "performance_logs"("userId", "timestamp");
CREATE INDEX IF NOT EXISTS "performance_logs_roomId_timestamp_idx" ON "performance_logs"("roomId", "timestamp");

-- Room Invites - for invite system performance
CREATE INDEX IF NOT EXISTS "room_invites_expiresAt_isActive_idx" ON "room_invites"("expiresAt", "isActive");
CREATE INDEX IF NOT EXISTS "room_invites_roomId_isActive_idx" ON "room_invites"("roomId", "isActive");

-- Cache Metrics - for cache monitoring
CREATE INDEX IF NOT EXISTS "cache_metrics_cacheType_operation_timestamp_idx" ON "cache_metrics"("cacheType", "operation", "timestamp");

-- Query Metrics - for database performance monitoring
CREATE INDEX IF NOT EXISTS "query_metrics_model_operation_timestamp_idx" ON "query_metrics"("model", "operation", "timestamp");
CREATE INDEX IF NOT EXISTS "query_metrics_success_timestamp_idx" ON "query_metrics"("success", "timestamp");
CREATE INDEX IF NOT EXISTS "query_metrics_duration_idx" ON "query_metrics"("duration");