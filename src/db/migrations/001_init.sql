CREATE TABLE IF NOT EXISTS team_contacts (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL,
  slack_id  TEXT NOT NULL,
  phone     TEXT,
  email     TEXT NOT NULL UNIQUE,
  timezone  TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh'
);

CREATE TABLE IF NOT EXISTS incidents (
  id                       TEXT PRIMARY KEY,
  start_time               TIMESTAMPTZ NOT NULL,
  recovery_time            TIMESTAMPTZ,
  end_time                 TIMESTAMPTZ,
  type                     TEXT NOT NULL,
  priority                 TEXT NOT NULL,
  ic_name                  TEXT NOT NULL,
  slack_thread_ts          TEXT NOT NULL,
  slack_channel            TEXT NOT NULL,
  status_page_status       TEXT NOT NULL DEFAULT 'investigating',
  statuspage_incident_id   TEXT,
  description              TEXT NOT NULL,
  users_affected           INT DEFAULT 0,
  payment_affected         BOOLEAN DEFAULT FALSE,
  data_integrity_affected  BOOLEAN DEFAULT FALSE,
  core_feature_affected    BOOLEAN DEFAULT FALSE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incident_timeline (
  id          SERIAL PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  time        TIMESTAMPTZ NOT NULL,
  event       TEXT NOT NULL,
  actor       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS escalations (
  id               SERIAL PRIMARY KEY,
  incident_id      TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  contact_slack_id TEXT NOT NULL,
  slack_call_id    TEXT NOT NULL,
  message          TEXT NOT NULL,
  done             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(incident_id, contact_slack_id)
);
