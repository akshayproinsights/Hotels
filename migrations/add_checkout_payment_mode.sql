-- Migration: Add checkout_payment_mode to bookings table
-- Purpose: Track the payment mode used when collecting balance at checkout,
--          separately from the advance payment mode captured at check-in.
-- Run this ONCE in your Supabase SQL Editor.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS checkout_payment_mode TEXT
    CHECK (checkout_payment_mode IN ('Cash', 'UPI', 'IDFC') OR checkout_payment_mode IS NULL);

-- Optional: Add a comment for documentation
COMMENT ON COLUMN bookings.checkout_payment_mode IS
  'Payment mode used when collecting balance dues at checkout (Cash/UPI/IDFC). Separate from payment_mode which tracks the advance payment at check-in.';
