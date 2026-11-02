// src/config/auth.ts

export const TEMP_MASTER_KEYS = [
  "LINHUNG-MASTER-2026",
  "MASTER-2026",
];

export const DEV_MASTER_KEY = TEMP_MASTER_KEYS[0];

export function isValidMasterKey(input: string): boolean {
  const normalized = input.trim().toUpperCase();

  return TEMP_MASTER_KEYS.includes(normalized);
}