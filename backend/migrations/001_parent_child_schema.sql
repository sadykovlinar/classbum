-- Migration: initialize parent/child/session schema
-- Drops legacy tables for the old "child-as-account" model and creates
-- parent-centered entities.

-- Enable UUID generation if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Clean up legacy tables from the previous personal-cabinet model
DROP TABLE IF EXISTS attempts CASCADE;
DROP TABLE IF EXISTS session_stats CASCADE;
DROP TABLE IF EXISTS children CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Parents table
CREATE TABLE parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  telegram_chat_id TEXT,
  notify_channel TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP
);

-- Children table
CREATE TABLE children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  grade TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP
);

-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP,
  total_tasks INT NOT NULL DEFAULT 0,
  correct_tasks INT NOT NULL DEFAULT 0,
  coins_earned INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Attempts table (task-level stats bound to session)
CREATE TABLE attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  -- Optional denormalized link to speed up child lookups
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  task_payload JSONB,
  is_correct BOOLEAN,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_children_parent_id ON children(parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_child_id ON sessions(child_id);
CREATE INDEX IF NOT EXISTS idx_attempts_session_id ON attempts(session_id);
