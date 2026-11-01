import { normalizeKickoffTime } from '../../../supabase/functions/_shared/normalize';
import type { MatchDay } from '@/components/PalmeirasCalendar';
import type { CalendarProjectMatchRecord, CalendarTeamAssetRecord } from '@/lib/calendar-supabase';
import { normalizeTeamSlug } from './team-names';
import { teamLogos } from './calendar-team-logos';

export const CURRENT_CALENDAR_TEAMS_STORAGE_KEY = 'calendarCreator.currentCalendarTeams';

export const isUndefinedTeam = (teamName: string) => {
  const normalized = normalizeTeamSlug(teamName);
  return normalized.includes('A DEFINIR') || normalized.includes('TBD');
};

export const getPersistedTeamLogos = (assets: Record<string, CalendarTeamAssetRecord>) =>
  Object.fromEntries(Object.values(assets).map((asset) => [asset.team_slug, asset.logo_url])) as Record<string, string>;

export const getTeamLogo = (teamName: string, persistedTeamLogos?: Record<string, string>) =>
  persistedTeamLogos?.[normalizeTeamSlug(teamName)] ?? teamLogos[normalizeTeamSlug(teamName)] ?? '';

export const parseMatchesInput = (input: string, persistedTeamLogos?: Record<string, string>): MatchDay[] => {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): MatchDay | null => {
      const match = line.match(/^(\d{1,2})(?:\s+([0-2]\d:[0-5]\d))?\s*-\s*(.+?)\s+x\s+(.+)$/i);
      if (!match) {
        return null;
      }

      const day = Number(match[1]);
      const homeTeam = match[3].trim();
      const awayTeam = match[4].trim();
      const homeUndefined = isUndefinedTeam(homeTeam);
      const awayUndefined = isUndefinedTeam(awayTeam);

      if (!day || day > 31 || (match[2] && !normalizeKickoffTime(match[2])) || !homeTeam || !awayTeam) {
        return null;
      }

      return {
        day,
        kickoffTime: normalizeKickoffTime(match[2]),
        homeTeam,
        awayTeam,
        homeLogoUrl: homeUndefined ? undefined : getTeamLogo(homeTeam, persistedTeamLogos) || undefined,
        awayLogoUrl: awayUndefined ? undefined : getTeamLogo(awayTeam, persistedTeamLogos) || undefined,
        isUndefined: homeUndefined || awayUndefined,
      };
    })
    .filter((item): item is MatchDay => item !== null);
};

export const serializeMatchesText = (storedMatches: CalendarProjectMatchRecord[]) =>
  storedMatches
    .map((match) => {
      if (!match.day || !match.homeTeam || !match.awayTeam) {
        return '';
      }

      return `${String(match.day).padStart(2, '0')}${normalizeKickoffTime(match.kickoffTime) ? ` ${normalizeKickoffTime(match.kickoffTime)}` : ''} - ${match.homeTeam} x ${match.awayTeam}`;
    })
    .filter(Boolean)
    .join('\n');

export const toCalendarProjectMatches = (currentMatches: MatchDay[]): CalendarProjectMatchRecord[] =>
  currentMatches.map(({ day, homeTeam, awayTeam, isUndefined, kickoffTime }) => ({
    day,
    homeTeam,
    awayTeam,
    isUndefined,
    kickoffTime: normalizeKickoffTime(kickoffTime),
  }));

export const extractTeamNamesFromMatchesText = (matchesText?: string | null) => {
  if (!matchesText) {
    return [];
  }

  return parseMatchesInput(matchesText).flatMap((match) => [match.homeTeam, match.awayTeam].filter(Boolean) as string[]);
};

export const extractTeamNamesFromStoredMatches = (matches?: CalendarProjectMatchRecord[] | null) => {
  if (!Array.isArray(matches)) {
    return [];
  }

  return matches.flatMap((match) => [match.homeTeam, match.awayTeam].filter(Boolean) as string[]);
};

export const getStoredCurrentCalendarTeams = () => {
  try {
    const rawValue = window.sessionStorage.getItem(CURRENT_CALENDAR_TEAMS_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsedValue) ? parsedValue.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export const saveCurrentCalendarTeams = (teams: string[]) => {
  window.sessionStorage.setItem(CURRENT_CALENDAR_TEAMS_STORAGE_KEY, JSON.stringify(teams));
};
