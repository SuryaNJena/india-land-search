CREATE TABLE IF NOT EXISTS landreview_imports (version TEXT PRIMARY KEY NOT NULL);

CREATE TABLE IF NOT EXISTS landreview_upstream (portal TEXT PRIMARY KEY NOT NULL, until INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS landreview_active (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version TEXT NOT NULL,
  source TEXT NOT NULL,
  captured TEXT NOT NULL,
  expected INTEGER NOT NULL CHECK (expected > 0),
  scanned INTEGER NOT NULL CHECK (scanned >= 0 AND scanned <= expected),
  statewide INTEGER NOT NULL CHECK (statewide IN (0, 1))
);

CREATE TABLE IF NOT EXISTS landreview_villages (
  version TEXT NOT NULL,
  code TEXT NOT NULL,
  district TEXT NOT NULL,
  tehsil TEXT NOT NULL,
  village TEXT NOT NULL,
  ri TEXT,
  PRIMARY KEY (version, code)
);

CREATE TABLE IF NOT EXISTS landreview_holdings (
  id INTEGER PRIMARY KEY,
  version TEXT NOT NULL,
  village TEXT NOT NULL,
  tenant TEXT NOT NULL,
  khata TEXT NOT NULL,
  plots TEXT NOT NULL,
  FOREIGN KEY (version, village) REFERENCES landreview_villages(version, code)
);

CREATE INDEX IF NOT EXISTS landreview_holding_version ON landreview_holdings(version,village);
CREATE VIRTUAL TABLE IF NOT EXISTS landreview_names USING fts5(words, tokenize = 'ascii');
