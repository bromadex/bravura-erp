-- Tank-to-tank fuel transfer records

CREATE TABLE IF NOT EXISTS fuel_transfers (
  id              text    PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  transfer_no     text,
  from_tank_id    text    REFERENCES fuel_tanks(id),
  to_tank_id      text    REFERENCES fuel_tanks(id),
  transfer_date   date    NOT NULL DEFAULT CURRENT_DATE,
  quantity        numeric NOT NULL,
  fuel_type       text    NOT NULL DEFAULT 'DIESEL',
  reason          text,
  transferred_by  text,
  notes           text,
  created_at      timestamptz DEFAULT now()
);
