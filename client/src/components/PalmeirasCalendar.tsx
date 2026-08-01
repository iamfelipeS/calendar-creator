import React, { forwardRef } from 'react';

export interface MatchDay {
  day: number;
  homeTeam?: string;
  awayTeam?: string;
  homeLogoUrl?: string;
  awayLogoUrl?: string;
  isUndefined?: boolean;
}

export interface PalmeirasCalendarSettings {
  appTitle: string;
  footerCalendarName: string;
  brandHandle: string;
  brandLogoUrl: string;
  logoScale: number;
  teamCrestScale: number;
  teamLabelScale: number;
  showYear: boolean;
  showWatermark: boolean;
  showFooter: boolean;
  showHandle: boolean;
  showFreeDays: boolean;
  canvasFormat: 'feedPortrait' | 'square' | 'story';
  density: 'compact' | 'comfortable';
  watermarkOpacity: number;
  watermarkScale: number;
  watermarkOffsetX: number;
  watermarkOffsetY: number;
  calendarScale: number;
  backgroundStart: string;
  backgroundMid: string;
  backgroundEnd: string;
  accentColor: string;
}

interface PalmeirasCalendarProps {
  month: string;
  year: string;
  matches: MatchDay[];
  settings?: Partial<PalmeirasCalendarSettings>;
}

const monthLengths: Record<string, number> = {
  JANEIRO: 31,
  FEVEREIRO: 28,
  MARCO: 31,
  MARÇO: 31,
  ABRIL: 30,
  MAIO: 31,
  JUNHO: 30,
  JULHO: 31,
  AGOSTO: 31,
  SETEMBRO: 30,
  OUTUBRO: 31,
  NOVEMBRO: 30,
  DEZEMBRO: 31,
};

const monthIndexes: Record<string, number> = {
  JANEIRO: 0,
  FEVEREIRO: 1,
  FEVREIRO: 1,
  MARCO: 2,
  MARÇO: 2,
  ABRIL: 3,
  MAIO: 4,
  JUNHO: 5,
  JULHO: 6,
  AGOSTO: 7,
  SETEMBRO: 8,
  OUTUBRO: 9,
  NOVEMBRO: 10,
  DEZEMBRO: 11,
};

const normalizeMonth = (month: string) => month.trim().toUpperCase();

const getDaysInMonth = (month: string, year: string) => {
  const normalized = normalizeMonth(month);
  const base = monthLengths[normalized] ?? 30;

  if (normalized === 'FEVEREIRO' || normalized === 'FEVREIRO') {
    const yearNumber = Number(year);
    const isLeap = !Number.isNaN(yearNumber) && ((yearNumber % 4 === 0 && yearNumber % 100 !== 0) || yearNumber % 400 === 0);
    return isLeap ? 29 : 28;
  }

  return base;
};

const getFirstDayOfWeek = (month: string, year: string) => {
  const monthIndex = monthIndexes[normalizeMonth(month)];
  const yearNumber = Number(year);

  if (monthIndex === undefined || Number.isNaN(yearNumber)) {
    return 0;
  }

  return new Date(yearNumber, monthIndex, 1).getDay();
};

const getTeamPlaceholder = (teamName?: string, fallback = 'TIME') => {
  if (!teamName) {
    return fallback;
  }

  const sanitized = teamName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  if (!sanitized) {
    return fallback;
  }

  const shortNames: Record<string, string> = {
    PALMEIRAS: 'PAL',
    GREMIO: 'GRE',
    BAHIA: 'BAH',
    CORINTHIANS: 'COR',
    'ATLETICO JUNIOR': 'JUN',
    JUNIOR: 'JUN',
    'SPORTING CRISTAL': 'SCR',
    'ATHLETICO PARANAENSE': 'CAP',
    JACUIPENSE: 'JAC',
    'RED BULL BRAGANTINO': 'RBB',
    BRAGANTINO: 'BRA',
    'CERRO PORTENO': 'CER',
    'CERRO PORTEÑO': 'CER',
  };

  if (shortNames[sanitized]) {
    return shortNames[sanitized];
  }

  const words = sanitized.split(' ').filter(Boolean);
  const preferred = words.filter((word) => word.length > 2 && !['DE', 'DA', 'DO', 'DOS', 'DAS', 'FC', 'EC', 'SC', 'AC'].includes(word));
  const source = preferred.length > 0 ? preferred[0] : words[0];

  return source.slice(0, 3).toUpperCase();
};

const isUndefinedTeamName = (teamName?: string) => {
  if (!teamName) {
    return false;
  }

  const normalized = teamName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  return normalized.includes('A DEFINIR') || normalized.includes('TBD');
};

const getVisibleWeeks = (daysInMonth: number, firstDayOfWeek: number) =>
  Math.min(6, Math.ceil((daysInMonth + firstDayOfWeek) / 7));

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');

  if (normalized.length !== 6) {
    return { r: 110, g: 231, b: 183 };
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const toRgba = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Layout tuning by output format.
// Keep these values grouped here so preview/export adjustments stay easy to review.
const CALENDAR_MODE_LAYOUT = {
  feedPortrait: {
    dayCellAspectRatio: 1.02,
    crestScale: 1.18,
    matchGap: 'gap-2.5 px-1.5 sm:gap-3 sm:px-2',
    dayCellPadding: 'p-0.5 sm:p-0.5',
    matchAlign: 'items-center justify-center',
    dayNumberClass: 'text-[10px] sm:text-[11px] md:text-xs',
    dayNumberOffset: 'mb-0.5 pl-[5px] pt-0.5',
    crestSize: 'h-[42px] w-[42px] sm:h-[46px] sm:w-[46px]',
    crestFallbackSize: 'h-[42px] min-w-[42px] px-1 text-[10px] sm:h-[46px] sm:min-w-[46px] sm:text-[11px]',
    teamLabelClass: 'mt-2 max-w-[64px] text-[11px] sm:max-w-[76px] sm:text-[12px]',
    centerXClass: 'h-[36px] w-4 text-[16px] sm:h-[40px] sm:w-5 sm:text-[18px]',
  },
  square: {
    dayCellAspectRatio: 1.02,
    crestScale: 1.18,
    matchGap: 'gap-2.5 px-1.5 sm:gap-3 sm:px-2',
    dayCellPadding: 'p-0.5 sm:p-0.5',
    matchAlign: 'items-center justify-center',
    dayNumberClass: 'text-[10px] sm:text-[11px] md:text-xs',
    dayNumberOffset: 'mb-0.5 pl-[5px] pt-0.5',
    crestSize: 'h-[42px] w-[42px] sm:h-[46px] sm:w-[46px]',
    crestFallbackSize: 'h-[42px] min-w-[42px] px-1 text-[10px] sm:h-[46px] sm:min-w-[46px] sm:text-[11px]',
    teamLabelClass: 'mt-2 max-w-[64px] text-[11px] sm:max-w-[76px] sm:text-[12px]',
    centerXClass: 'h-[36px] w-4 text-[16px] sm:h-[40px] sm:w-5 sm:text-[18px]',
  },
  story: {
    dayCellAspectRatio: 0.92,
    crestScale: 1.18,
    matchGap: 'grid-cols-1 grid-rows-[auto_auto_auto] gap-1.5 px-1',
    dayCellPadding: 'p-0.5 sm:p-0.5',
    matchAlign: 'items-center justify-center',
    dayNumberClass: 'text-[10px] sm:text-[11px] md:text-xs',
    dayNumberOffset: 'mb-0.5 pl-[5px] pt-0.5',
    crestSize: 'h-[42px] w-[42px] sm:h-[46px] sm:w-[46px]',
    crestFallbackSize: 'h-[42px] min-w-[42px] px-1 text-[10px] sm:h-[46px] sm:min-w-[46px] sm:text-[11px]',
    teamLabelClass: 'mt-2 max-w-[64px] text-[11px] sm:max-w-[76px] sm:text-[12px]',
    centerXClass: 'h-4 text-[14px] sm:text-[16px]',
  },
} as const;

export const defaultPalmeirasCalendarSettings: PalmeirasCalendarSettings = {
  appTitle: 'Calendário Palmeiras',
  footerCalendarName: 'PALMEIRAS',
  brandHandle: '@meupalestra',
  brandLogoUrl: '',
  logoScale: 1,
  teamCrestScale: 1.25,
  teamLabelScale: 1.15,
  showYear: false,
  showWatermark: true,
  showFooter: true,
  showHandle: true,
  showFreeDays: true,
  canvasFormat: 'feedPortrait',
  density: 'comfortable',
  watermarkOpacity: 0.04,
  watermarkScale: 1,
  watermarkOffsetX: 0,
  watermarkOffsetY: 0,
  calendarScale: 1,
  backgroundStart: '#064e3b',
  backgroundMid: '#065f46',
  backgroundEnd: '#022c22',
  accentColor: '#6ee7b7',
};

/**
 * PalmeirasCalendar Component
 * 
 * Design Philosophy: Premium Sports Calendar
 * - Dark green elegant background with subtle texture overlay
 * - Clean, minimal aesthetic with professional spacing
 * - High readability on Instagram mobile feed (1080x1350)
 * - Reusable monthly template with editable elements
 * - Typography: Playfair Display for titles (elegant serif), Lato for body (clean sans-serif)
 * - Color Palette: Emerald green (#0B5F2E range) with white accents and subtle gold highlights
 * - Spacing: Generous padding and gaps for premium feel
 */
const PalmeirasCalendar = forwardRef<HTMLDivElement, PalmeirasCalendarProps>(function PalmeirasCalendar(
  { month, year, matches, settings },
  ref,
) {
  const {
    appTitle,
    footerCalendarName,
    brandHandle,
    brandLogoUrl,
    logoScale,
    teamCrestScale,
    teamLabelScale,
    showYear,
    showWatermark,
    showFooter,
    showHandle,
    showFreeDays,
    canvasFormat,
    density,
    watermarkOpacity,
    watermarkScale,
    watermarkOffsetX,
    watermarkOffsetY,
    backgroundStart,
    backgroundMid,
    backgroundEnd,
    accentColor,
  } = {
    ...defaultPalmeirasCalendarSettings,
    ...settings,
  };
  const daysInMonth = getDaysInMonth(month, year);
  const firstDayOfWeek = getFirstDayOfWeek(month, year);
  const visibleWeeks = getVisibleWeeks(daysInMonth, firstDayOfWeek);
  const dayLabels = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const aspectRatio = canvasFormat === 'square' ? '1080 / 1080' : canvasFormat === 'story' ? '1080 / 1920' : '1080 / 1350';
  const isCompact = density === 'compact';
  const usesVerticalMatchLayout = canvasFormat === 'story';
  const modeLayout = CALENDAR_MODE_LAYOUT[canvasFormat];
  const crestScale = modeLayout.crestScale * teamCrestScale;
  const dayCellAspectRatio = modeLayout.dayCellAspectRatio;
  const footerClass = canvasFormat === 'square' ? 'shrink-0 border-t pt-1.5 pb-0.5 text-center sm:pt-2' : 'shrink-0 border-t pt-2.5 text-center sm:pt-3';
  const footerTitleClass =
    canvasFormat === 'square'
      ? 'text-[9px] font-light tracking-[0.14em] sm:text-[10px] md:text-xs md:tracking-[0.2em]'
      : 'text-[10px] font-light tracking-[0.18em] sm:text-xs md:text-sm md:tracking-[0.26em]';
  const footerSeasonClass = canvasFormat === 'square' ? 'mt-0.5 text-[8px] sm:text-[9px] md:text-[10px]' : 'mt-1 text-[9px] sm:text-[10px] md:text-xs';
  const footerDisplayName = footerCalendarName.trim() || defaultPalmeirasCalendarSettings.footerCalendarName;
  const footerDisplayYear = year.trim() || '2026';

  const isMatchDay = (day: number) => matches.some((m) => m.day === day);
  const getMatch = (day: number) => matches.find((m) => m.day === day);
  const compactLayout = isCompact || visibleWeeks >= 6;

  const calendarDays: Array<number | null> = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }
  while (calendarDays.length < visibleWeeks * 7) {
    calendarDays.push(null);
  }

  return (
    <div
      ref={ref}
      className="relative w-full bg-gradient-to-b from-emerald-900 via-emerald-800 to-emerald-950 rounded-3xl overflow-hidden shadow-2xl"
      style={{
        aspectRatio,
        backgroundImage: `
          linear-gradient(135deg, rgba(5, 46, 22, 0.5) 0%, rgba(5, 46, 22, 0) 100%),
          linear-gradient(to bottom, ${backgroundStart} 0%, ${backgroundMid} 52%, ${backgroundEnd} 100%),
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 2px,
            rgba(255, 255, 255, 0.015) 2px,
            rgba(255, 255, 255, 0.015) 4px
          ),
          repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(255, 255, 255, 0.01) 2px,
            rgba(255, 255, 255, 0.01) 4px
          )
        `,
      }}
    >
      {showWatermark ? (
        <div className="absolute inset-0 pointer-events-none overflow-hidden px-[8%]" style={{ opacity: watermarkOpacity }}>
          <div
            className="absolute left-1/2 top-1/2 w-full text-center"
            style={{
              transform: `translate(calc(-50% + ${watermarkOffsetX}px), calc(-50% + ${watermarkOffsetY}px))`,
            }}
          >
            <div
              className="text-white tracking-wider font-bold"
              style={{
                fontSize: `clamp(${26 * watermarkScale}px, ${4.8 * watermarkScale}vw, ${58 * watermarkScale}px)`,
                lineHeight: 0.94,
                textShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              {brandHandle}
            </div>
            <div
              className="text-white tracking-wider font-bold"
              style={{
                fontSize: `clamp(${14 * watermarkScale}px, ${2.8 * watermarkScale}vw, ${30 * watermarkScale}px)`,
                lineHeight: 0.96,
                whiteSpace: 'nowrap',
              }}
            >
              .1914
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative z-10 flex h-full flex-col p-2.5 sm:p-3.5">
        <div className="mb-1 grid grid-cols-[70px_minmax(0,1fr)_96px] items-start gap-3 sm:mb-1.5 sm:grid-cols-[88px_minmax(0,1fr)_120px] sm:gap-4">
          <div className="flex justify-start">
            <div
              className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-xl sm:h-[72px] sm:w-[72px] ${brandLogoUrl ? 'bg-transparent' : 'bg-gradient-to-br from-white to-emerald-50'}`}
              style={brandLogoUrl ? undefined : { border: `1px solid ${toRgba(accentColor, 0.35)}` }}
            >
              {brandLogoUrl ? (
                <img
                  src={brandLogoUrl}
                  alt={appTitle}
                  className="object-contain drop-shadow-md"
                  style={{
                    width: '94%',
                    height: '94%',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    transform: `scale(${logoScale})`,
                    transformOrigin: 'center',
                  }}
                />
              ) : (
                <div className="text-emerald-900 font-bold text-lg sm:text-xl" style={{ fontFamily: "'Playfair Display', serif" }}>
                  P
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 px-2 text-center">
            <h1
              className="mb-0.5 truncate text-[40px] font-bold tracking-tight text-white sm:text-[54px]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {month}
            </h1>
            {showYear ? (
              <p className="truncate text-[11px] font-light tracking-[0.24em] sm:text-sm md:text-base" style={{ color: toRgba(accentColor, 0.88) }}>
                {year}
              </p>
            ) : null}
          </div>

          {showHandle ? (
            <div className="text-right">
              <p className="truncate text-[11px] font-semibold tracking-[0.12em] sm:text-sm" style={{ color: toRgba(accentColor, 0.92) }}>
                {brandHandle}
              </p>
              <p className="text-[10px] leading-tight sm:text-xs" style={{ color: toRgba(accentColor, 0.68) }}>
                .1914
              </p>
            </div>
          ) : (
            <div aria-hidden="true"></div>
          )}
        </div>

        <div className="mb-0.5 h-px opacity-40 sm:mb-1" style={{ background: `linear-gradient(to right, transparent, ${toRgba(accentColor, 0.8)}, transparent)` }}></div>

        <div className="mb-0.5 grid grid-cols-7 gap-1 sm:mb-1 sm:gap-1.5">
          {dayLabels.map((day) => (
            <div
              key={day}
              className="py-1 text-center text-[9px] font-semibold tracking-[0.16em] sm:py-1.5 sm:text-[10px]"
              style={{ color: toRgba(accentColor, 0.9), fontFamily: "'Lato', sans-serif" }}
            >
              {day}
            </div>
          ))}
        </div>

        <div
          className={`mb-1 grid flex-1 grid-cols-7 px-1 sm:px-1.5 ${isCompact ? 'gap-1' : 'gap-1 sm:gap-1.5'} sm:mb-1.5`}
          style={{ gridTemplateRows: `repeat(${visibleWeeks}, minmax(0, 1fr))` }}
        >
          {calendarDays.map((day, index) => {
            const isMatch = day !== null && isMatchDay(day);
            const match = day !== null ? getMatch(day) : undefined;
            const homePlaceholder = getTeamPlaceholder(match?.homeTeam, 'CASA');
            const awayPlaceholder = getTeamPlaceholder(match?.awayTeam, 'FORA');
            const homeUndefined = isUndefinedTeamName(match?.homeTeam);
            const awayUndefined = isUndefinedTeamName(match?.awayTeam);
            const showHomeLabel = Boolean(match?.homeLogoUrl) && !homeUndefined;
            const showAwayLabel = Boolean(match?.awayLogoUrl) && !awayUndefined;
            const crestClass = compactLayout ? 'h-[34px] w-[34px]' : modeLayout.crestSize;
            const teamLabelStyle = {
              fontSize: `${(compactLayout ? 8 : 11) * teamLabelScale}px`,
              maxWidth: `${compactLayout ? 58 : 80}px`,
            };

            return (
              <div
                key={index}
                className={`
                  relative min-h-0 overflow-hidden rounded-[18px] transition-all duration-300
                  ${day ? 'cursor-pointer hover:-translate-y-0.5' : ''}
                  ${isMatch
                    ? 'shadow-[0_14px_28px_rgba(0,0,0,0.22)]'
                    : day
                      ? 'bg-white/8 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                      : 'bg-white/[0.02]'
                  }
                `}
                style={{
                  minHeight: 0,
                  aspectRatio: `${dayCellAspectRatio}`,
                  ...(isMatch
                    ? {
                        backgroundImage: `linear-gradient(135deg, ${toRgba(accentColor, 0.18)} 0%, rgba(255,255,255,0.06) 52%, ${toRgba(accentColor, 0.08)} 100%)`,
                        border: `1px solid ${toRgba(accentColor, 0.18)}`,
                      }
                    : {}),
                }}
              >
                {day ? (
                  <div className={`flex h-full flex-col ${isCompact ? 'p-0.5' : modeLayout.dayCellPadding}`}>
                    <div className={`${modeLayout.dayNumberOffset} flex items-start justify-between`}>
                      <div
                        className={`${modeLayout.dayNumberClass} font-semibold text-white`}
                        style={{ fontFamily: "'Lato', sans-serif" }}
                      >
                        {day}
                      </div>
                    </div>

                    {isMatch && match ? (
                      <div className={`flex flex-1 ${modeLayout.matchAlign}`}>
                        <div
                          className={`grid w-full items-center ${
                            usesVerticalMatchLayout
                              ? compactLayout
                                ? 'grid-cols-1 grid-rows-[auto_auto_auto] gap-1 px-0.5'
                                : modeLayout.matchGap
                              : compactLayout
                                ? 'grid-cols-[1fr_auto_1fr] gap-1 px-0.5'
                                : `grid-cols-[1fr_auto_1fr] ${modeLayout.matchGap}`
                          }`}
                        >
                            <div className="flex min-w-0 flex-col items-center justify-center">
                              {homeUndefined ? (
                                <div className={`${crestClass} flex shrink-0 items-center justify-center rounded-full bg-emerald-950/30 text-amber-200 shadow-sm`}>
                                  <svg viewBox="0 0 24 24" className={`${isCompact ? 'h-3 w-3' : 'h-[20px] w-[20px] sm:h-[22px] sm:w-[22px]'}`} fill="currentColor" aria-hidden="true">
                                    <path d="M7 4V2h10v2h3v3c0 3.2-2 5.8-5 6.7V17h2.5a1 1 0 0 1 0 2H6.5a1 1 0 1 1 0-2H9v-3.3C6 12.8 4 10.2 4 7V4h3Zm10 2H7v1c0 2.3 1.6 4.2 3.8 4.8l1.2.3 1.2-.3C15.4 11.2 17 9.3 17 7V6Zm-11 0H6v1c0 1.1.4 2.1 1 2.9A5.9 5.9 0 0 1 6 7V6Zm12 0v1c0 1.1-.4 2.1-1 2.9A5.9 5.9 0 0 0 18 7V6Z" />
                                  </svg>
                                </div>
                              ) : match.homeLogoUrl ? (
                                <img
                                  src={match.homeLogoUrl}
                                  alt={match.homeTeam}
                                  className={`${crestClass} shrink-0 object-contain drop-shadow-md`}
                                  style={{ transform: `scale(${crestScale})`, transformOrigin: 'center' }}
                                />
                              ) : (
                                <div className={`${compactLayout ? 'h-[18px] min-w-[18px] px-1 text-[6px]' : modeLayout.crestFallbackSize} flex shrink-0 items-center justify-center rounded-full bg-emerald-950/35 font-bold tracking-[0.03em] text-white shadow-sm`}>
                                  {homePlaceholder}
                                </div>
                              )}
                              {showHomeLabel ? (
                                <span
                                  className={`${compactLayout ? 'mt-2' : modeLayout.teamLabelClass} min-w-0 truncate text-center font-semibold uppercase leading-none tracking-[0.01em] text-emerald-50/92`}
                                  style={teamLabelStyle}
                                >
                                  {homePlaceholder}
                                </span>
                              ) : null}
                            </div>

                            <div
                              className={`${
                                usesVerticalMatchLayout
                                  ? compactLayout
                                    ? 'h-3 text-[9px]'
                                    : modeLayout.centerXClass
                                  : compactLayout
                                    ? 'h-[18px] w-3 text-[9px]'
                                    : modeLayout.centerXClass
                              } flex shrink-0 items-center justify-center self-center font-bold tracking-[0.02em]`}
                              style={{ color: toRgba(accentColor, 0.95) }}
                            >
                              X
                            </div>
                            <div className="flex min-w-0 flex-col items-center justify-center">
                              {awayUndefined ? (
                                <div className={`${crestClass} flex shrink-0 items-center justify-center rounded-full bg-emerald-950/30 text-amber-200 shadow-sm`}>
                                  <svg viewBox="0 0 24 24" className={`${isCompact ? 'h-3 w-3' : 'h-[20px] w-[20px] sm:h-[22px] sm:w-[22px]'}`} fill="currentColor" aria-hidden="true">
                                    <path d="M7 4V2h10v2h3v3c0 3.2-2 5.8-5 6.7V17h2.5a1 1 0 0 1 0 2H6.5a1 1 0 1 1 0-2H9v-3.3C6 12.8 4 10.2 4 7V4h3Zm10 2H7v1c0 2.3 1.6 4.2 3.8 4.8l1.2.3 1.2-.3C15.4 11.2 17 9.3 17 7V6Zm-11 0H6v1c0 1.1.4 2.1 1 2.9A5.9 5.9 0 0 1 6 7V6Zm12 0v1c0 1.1-.4 2.1-1 2.9A5.9 5.9 0 0 0 18 7V6Z" />
                                  </svg>
                                </div>
                              ) : match.awayLogoUrl ? (
                                <img
                                  src={match.awayLogoUrl}
                                  alt={match.awayTeam}
                                  className={`${crestClass} shrink-0 object-contain drop-shadow-md`}
                                  style={{ transform: `scale(${crestScale})`, transformOrigin: 'center' }}
                                />
                              ) : (
                                <div className={`${compactLayout ? 'h-[18px] min-w-[18px] px-1 text-[6px]' : modeLayout.crestFallbackSize} flex shrink-0 items-center justify-center rounded-full bg-emerald-950/35 font-bold tracking-[0.03em] text-white shadow-sm`}>
                                  {awayPlaceholder}
                                </div>
                              )}
                              {showAwayLabel ? (
                                <span
                                  className={`${compactLayout ? 'mt-2' : modeLayout.teamLabelClass} min-w-0 truncate text-center font-semibold uppercase leading-none tracking-[0.01em] text-emerald-50/92`}
                                  style={teamLabelStyle}
                                >
                                  {awayPlaceholder}
                                </span>
                              ) : null}
                            </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-1 items-center justify-center">
                        {showFreeDays ? (
                          <div className="flex h-full w-full items-center justify-center rounded-[12px] bg-gradient-to-br from-white/[0.03] to-white/[0.01] px-1 py-1">
                            <span className="text-center text-[8px] font-medium uppercase tracking-[0.1em] text-emerald-100/28 sm:text-[9px] md:text-[10px]">
                              livre
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {showFooter ? (
          <div className={footerClass} style={{ borderColor: toRgba(accentColor, 0.18) }}>
            <p className={footerTitleClass} style={{ fontFamily: "'Lato', sans-serif", color: toRgba(accentColor, 0.86) }}>
              CALENDÁRIO OFICIAL • {footerDisplayName.toUpperCase()}
            </p>
            <p className={footerSeasonClass} style={{ color: toRgba(accentColor, 0.64) }}>
              Temporada {footerDisplayYear}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default PalmeirasCalendar;
