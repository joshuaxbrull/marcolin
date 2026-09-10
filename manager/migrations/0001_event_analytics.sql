CREATE TABLE analytics_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  recorded_at INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('visit', 'select', 'directions', 'call')),
  source TEXT NOT NULL CHECK (source IN ('card', 'direct')),
  location_id INTEGER,
  CHECK ((event_type = 'visit' AND location_id IS NULL) OR
         (event_type <> 'visit' AND location_id IS NOT NULL AND location_id > 0))
);
CREATE INDEX analytics_events_time ON analytics_events(recorded_at);
CREATE TABLE analytics_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at INTEGER NOT NULL
);
INSERT INTO analytics_state (id, started_at) VALUES (1, unixepoch());
