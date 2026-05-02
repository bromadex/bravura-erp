// src/utils/txnCode.js
//
// Transaction code generation via Supabase RPC.
// The RPC `next_txn_code(prefix, year)` atomically increments
// a counter in `code_sequences` and returns the formatted code.
//
// Required DB objects:
//
//   CREATE TABLE code_sequences (
//     prefix      TEXT    NOT NULL,
//     year        INT     NOT NULL,
//     last_number INT     NOT NULL DEFAULT 0,
//     PRIMARY KEY (prefix, year)
//   );
//
//   CREATE OR REPLACE FUNCTION next_txn_code(p_prefix TEXT, p_year INT)
//   RETURNS TEXT LANGUAGE plpgsql AS $$
//   DECLARE v_num INT;
//   BEGIN
//     INSERT INTO code_sequences (prefix, year, last_number)
//     VALUES (p_prefix, p_year, 1)
//     ON CONFLICT (prefix, year)
//     DO UPDATE SET last_number = code_sequences.last_number + 1
//     RETURNING last_number INTO v_num;
//     RETURN p_prefix || '-' || p_year || '-' || LPAD(v_num::TEXT, 5, '0');
//   END;
//   $$;

import { supabase } from '../lib/supabase'

export async function generateTxnCode(prefix) {
  const year = new Date().getFullYear()
  const { data, error } = await supabase.rpc('next_txn_code', {
    p_prefix: prefix,
    p_year:   year,
  })
  if (error) throw new Error(`Failed to generate code for prefix ${prefix}: ${error.message}`)
  return data
}

// Regex that matches any valid transaction code (e.g. SR-2026-00034)
export const TXN_CODE_REGEX = /\b([A-Z]{2,3}-\d{4}-\d{5})\b/g
