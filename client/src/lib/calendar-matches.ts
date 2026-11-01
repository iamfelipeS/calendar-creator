import type { MatchDay } from '@/components/PalmeirasCalendar';
import type { CalendarProjectMatchRecord, CalendarTeamAssetRecord } from '@/lib/calendar-supabase';
import { normalizeTeamSlug } from '@/lib/calendar-supabase';
import { teamLogos } from '@/lib/calendar-team-logos';

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
      const sections = line.split(/\s*\|\s*/);
      if (sections.length > 2) {
        return null;
      }

      const [fixtureText, kickoffText] = sections;
      const match = fixtureText.match(/^(\d{1,2})\s*-\s*(.+?)\s+x\s+(.+)$/i);
      if (!match) {
        return null;
      }

      const day = Number(match[1]);
      const homeTeam = match[2].trim();
      const awayTeam = match[3].trim();
      const homeUndefined = isUndefinedTeam(homeTeam);
      const awayUndefined = isUndefinedTeam(awayTeam);

      if (!day || !homeTeam || !awayTeam) {
        return null;
      }

      let kickoff: MatchDay['kickoff'];
      if (kickoffText !== undefined) {
        if (/^(a\s+definir|tbd)$/i.test(kickoffText.trim())) {
          kickoff = { status: 'to_be_defined' };
        } else {
          const timeMatch = kickoffText.trim().match(/^([01]?\d|2[0-3])(?::|h)([0-5]\d)$/i);
          if (!timeMatch) {
            return null;
          }

          kickoff = { status: 'confirmed', time: `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` };
        }
      }

      return {
        day,
        kickoff,
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

      const kickoffSuffix = match.kickoff?.status === 'to_be_defined'
        ? ' | A definir'
        : match.kickoff?.status === 'confirmed'
          ? ` | ${match.kickoff.time}`
          : '';

      return `${String(match.day).padStart(2, '0')} - ${match.homeTeam} x ${match.awayTeam}${kickoffSuffix}`;
    })
    .filter(Boolean)
    .join('\n');

export const toCalendarProjectMatches = (currentMatches: MatchDay[]): CalendarProjectMatchRecord[] =>
  currentMatches.map(({ day, homeTeam, awayTeam, isUndefined, kickoff }) => ({
    day,
    homeTeam,
    awayTeam,
    isUndefined,
    kickoff,
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
