-- Driver and equipment operator profiles with licence tracking

CREATE TABLE IF NOT EXISTS driver_profiles (
  id                       text    PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  driver_no                text,
  employee_id              text,
  full_name                text    NOT NULL,
  id_number                text,
  contact_phone            text,
  email                    text,
  department               text,
  license_number           text,
  license_classes          text    DEFAULT '',
  license_expiry           date,
  license_issuing_authority text,
  pdp_number               text,
  pdp_expiry               date,
  medical_cert_no          text,
  medical_expiry           date,
  defensive_driving_cert   text,
  defensive_driving_expiry date,
  operator_cert_no         text,
  operator_cert_expiry     date,
  mhsa_fitness_cert        text,
  mhsa_fitness_expiry      date,
  accidents_count          integer DEFAULT 0,
  violations_count         integer DEFAULT 0,
  status                   text    DEFAULT 'active',  -- active | suspended | terminated
  assigned_vehicle_id      text,
  notes                    text,
  created_by               text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);
