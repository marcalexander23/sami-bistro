-- Migration 001: create the bookings table.
-- Not applied to any database yet. Review first.

CREATE TABLE bookings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference     text        NOT NULL UNIQUE,            -- short code customers quote, e.g. BK-4821
  token_hash    text        NOT NULL,                   -- hash of the private link token (never the token itself)
  name          text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  phone         text        NOT NULL CHECK (phone ~ '^[0-9+ ()-]{8,20}$'),
  party_size    integer     NOT NULL CHECK (party_size BETWEEN 1 AND 12),
  starts_at     timestamptz NOT NULL,                   -- exact moment, stored in UTC
  ends_at       timestamptz NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- Capacity checks look up bookings that overlap a time window.
CREATE INDEX bookings_time_idx ON bookings (starts_at, ends_at);
