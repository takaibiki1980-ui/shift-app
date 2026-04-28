-- Add yukyu_days (paid leave days) column to staff_kibo table
ALTER TABLE staff_kibo ADD COLUMN IF NOT EXISTS yukyu_days integer[] DEFAULT '{}';
