# Database migrations

Apply SQL files in this folder in numeric order to provision the parent → children model.

## How to run

```bash
# from backend/
psql "$DATABASE_URL" -f migrations/001_parent_child_schema.sql
```

## Schema overview
- **parents** — parent accounts with unique `email`, credentials (`password_hash`), contacts, and notification preferences (`notify_channel`).
- **children** — child profiles linked to a parent via `parent_id`; soft-deletable through `is_active`.
- **sessions** — per-child learning sessions with task and coin counters and timestamps for start/finish.
- **attempts** — task-level records bound to `sessions`; joins to `children` through `session_id` (optional denormalized `child_id` added for faster lookups).

The migration drops legacy tables from the previous child-as-account model (`users`, `children`, `session_stats`, `attempts`) before creating the new structure.
