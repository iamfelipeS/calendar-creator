import { normalizeKickoffTime } from '../../../supabase/functions/_shared/normalize';

// Absence is legacy data; explicit null is a known, undecided kickoff.
export const matchLinePattern = /^(\d{1,2})(?:\s+(A DEFINIR|[0-2]\d:[0-5]\d))?\s*-\s*(.+?)\s+x\s+(.+)$/i;
export const matchTimeLabel = (value: string | null | undefined): string =>
  value === undefined ? '' : value === null ? 'A DEFINIR' : normalizeKickoffTime(value) || '';
export const matchTimeText = (value: string | null | undefined): string => {
  const label = matchTimeLabel(value);
  return label ? ` ${label}` : '';
};
