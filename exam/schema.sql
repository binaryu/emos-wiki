CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT PRIMARY KEY,
  highest_score INTEGER NOT NULL DEFAULT 0,
  reward_paid INTEGER NOT NULL DEFAULT 0,
  payout_state TEXT NOT NULL DEFAULT 'idle',
  payout_target INTEGER,
  last_score INTEGER,
  updated_at INTEGER NOT NULL
);
