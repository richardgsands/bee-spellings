-- App usage events (no personal data: device is a random ID made on the device).
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,          -- ms since epoch
  device TEXT NOT NULL,
  event TEXT NOT NULL,          -- open | start | finish | misread
  country TEXT,
  region TEXT,
  detail TEXT                   -- small JSON blob, e.g. lists or score
);
CREATE INDEX events_ts ON events (ts);

-- One row per handwriting check.
CREATE TABLE checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  device TEXT,
  country TEXT,
  target TEXT,                  -- the word being practised (never sent to Claude)
  read TEXT,                    -- what the main model read
  unclear INTEGER,
  model TEXT,
  ms INTEGER,
  check_read TEXT,              -- what the cross-check model read
  check_unclear INTEGER,
  check_model TEXT,
  check_error TEXT,
  image BLOB                    -- PNG, only when the device allows saving samples
);
CREATE INDEX checks_ts ON checks (ts);
