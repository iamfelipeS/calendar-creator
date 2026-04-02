import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { flushSync } from 'react-dom';
import CalendarAssetsModal from '@/components/CalendarAssetsModal';
import CalendarSettingsModal from '@/components/CalendarSettingsModal';
import PalmeirasCalendar, {
  MatchDay,
  PalmeirasCalendarSettings,
  defaultPalmeirasCalendarSettings,
} from '@/components/PalmeirasCalendar';
import {
  fetchLatestBranding,
  fetchTeamAssets,
  normalizeTeamSlug,
  saveBranding,
  saveCalendarProject,
  saveTeamAsset,
  type CalendarBrandingRecord,
  type CalendarTeamAssetRecord,
} from '@/lib/calendar-supabase';

const canvasFormatOptions: Array<{
  key: PalmeirasCalendarSettings['canvasFormat'];
  label: string;
  exportLabel: string;
  sizeLabel: string;
}> = [
  { key: 'feedPortrait', label: 'Retrato', exportLabel: 'retrato', sizeLabel: '1080×1350' },
  { key: 'square', label: 'Quadrado', exportLabel: 'quadrado', sizeLabel: '1080×1080' },
  { key: 'story', label: 'Story', exportLabel: 'story', sizeLabel: '1080×1920' },
];

const previewBaseWidths: Record<PalmeirasCalendarSettings['canvasFormat'], number> = {
  feedPortrait: 1325,
  square: 1094,
  story: 749,
};

const initialMatchesText = `02 - Palmeiras x Grêmio
05 - Bahia x Palmeiras
08 - Atlético Junior x Palmeiras
12 - Corinthians x Palmeiras
16 - Palmeiras x Sporting Cristal
19 - Palmeiras x Athletico Paranaense
22 - Palmeiras x Jacuipense
26 - Red Bull Bragantino x Palmeiras
29 - Cerro Porteño x Palmeiras`;

const createTeamBadge = (label: string, background: string, foreground = '#ffffff') =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="23" fill="${background}" />
      <text
        x="24"
        y="29"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="16"
        font-weight="700"
        fill="${foreground}"
        letter-spacing=".6"
      >
        ${label}
      </text>
    </svg>
  `)}`;

const teamLogos: Record<string, string> = {
  PALMEIRAS: createTeamBadge('PAL', '#0b5f2e'),
  GREMIO: createTeamBadge('GRE', '#2f80ed'),
  BAHIA: createTeamBadge('BAH', '#2563eb'),
  'ATLETICO JUNIOR': createTeamBadge('JUN', '#dc2626'),
  JUNIOR: createTeamBadge('JUN', '#dc2626'),
  CORINTHIANS: createTeamBadge('COR', '#111827'),
  'SPORTING CRISTAL': createTeamBadge('SCR', '#0ea5e9'),
  'ATHLETICO PARANAENSE': createTeamBadge('CAP', '#b91c1c'),
  JACUIPENSE: createTeamBadge('JAC', '#7c3aed'),
  'RED BULL BRAGANTINO': createTeamBadge('RBB', '#ef4444'),
  BRAGANTINO: createTeamBadge('BRA', '#ef4444'),
  'CERRO PORTENO': createTeamBadge('CER', '#1d4ed8'),
  'CERRO PORTEÑO': createTeamBadge('CER', '#1d4ed8'),
};

const normalizeTeamKey = (teamName: string) =>
  teamName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const isUndefinedTeam = (teamName: string) => {
  const normalized = normalizeTeamKey(teamName);
  return normalized.includes('A DEFINIR') || normalized.includes('TBD');
};

const getTeamLogo = (teamName: string, persistedTeamLogos?: Record<string, string>) =>
  persistedTeamLogos?.[normalizeTeamKey(teamName)] ?? teamLogos[normalizeTeamKey(teamName)] ?? '';

const parseMatchesInput = (input: string, persistedTeamLogos?: Record<string, string>): MatchDay[] => {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d{1,2})\s*-\s*(.+?)\s+x\s+(.+)$/i);
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

      return {
        day,
        homeTeam,
        awayTeam,
        homeLogoUrl: homeUndefined ? undefined : getTeamLogo(homeTeam, persistedTeamLogos) || undefined,
        awayLogoUrl: awayUndefined ? undefined : getTeamLogo(awayTeam, persistedTeamLogos) || undefined,
        isUndefined: homeUndefined || awayUndefined,
      };
    })
    .filter((item): item is MatchDay => item !== null);
};

export default function Home() {
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const [month, setMonth] = useState('ABRIL');
  const [year, setYear] = useState('2026');
  const [matchesText, setMatchesText] = useState(initialMatchesText);
  const [teamAssets, setTeamAssets] = useState<Record<string, CalendarTeamAssetRecord>>({});
  const [brandingRecord, setBrandingRecord] = useState<CalendarBrandingRecord | null>(null);
  const [matches, setMatches] = useState<MatchDay[]>(() => parseMatchesInput(initialMatchesText));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAssetsOpen, setIsAssetsOpen] = useState(false);
  const [isExpandedPreviewOpen, setIsExpandedPreviewOpen] = useState(false);
  const [calendarSettings, setCalendarSettings] = useState<PalmeirasCalendarSettings>(defaultPalmeirasCalendarSettings);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [savingTeamSlug, setSavingTeamSlug] = useState<string | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [supabaseNotice, setSupabaseNotice] = useState<string | null>(null);

  const persistedTeamLogos = useMemo(
    () =>
      Object.fromEntries(
        Object.values(teamAssets).map((asset) => [asset.team_slug, asset.logo_url]),
      ) as Record<string, string>,
    [teamAssets],
  );

  const calendarTeams = useMemo(() => {
    const names = new Set<string>();
    for (const match of matches) {
      if (match.homeTeam) {
        names.add(match.homeTeam);
      }
      if (match.awayTeam) {
        names.add(match.awayTeam);
      }
    }
    return Array.from(names);
  }, [matches]);

  useEffect(() => {
    const loadSupabaseAssets = async () => {
      try {
        setIsLoadingAssets(true);
        const [branding, storedTeamAssets] = await Promise.all([fetchLatestBranding(), fetchTeamAssets()]);

        setBrandingRecord(branding);
        setTeamAssets(storedTeamAssets);

        if (branding) {
          setCalendarSettings((current) => ({
            ...current,
            appTitle: branding.page_name || current.appTitle,
            brandHandle: branding.handle || current.brandHandle,
            brandLogoUrl: branding.logo_url || current.brandLogoUrl,
          }));
        }

        setMatches(parseMatchesInput(matchesText, Object.fromEntries(Object.values(storedTeamAssets).map((asset) => [asset.team_slug, asset.logo_url]))));
      } catch (error) {
        console.error('Erro ao carregar branding e escudos do Supabase', error);
        setSupabaseNotice('Nao foi possivel carregar assets salvos do Supabase agora.');
      } finally {
        setIsLoadingAssets(false);
      }
    };

    void loadSupabaseAssets();
  }, []);

  const handleGenerate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMatches(parseMatchesInput(matchesText, persistedTeamLogos));
  };

  const toggleCalendarSetting = (key: keyof PalmeirasCalendarSettings) => {
    setCalendarSettings((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const updateCalendarSetting = <K extends keyof PalmeirasCalendarSettings>(key: K, value: PalmeirasCalendarSettings[K]) => {
    setCalendarSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const applyCalendarPreset = (preset: Partial<PalmeirasCalendarSettings>) => {
    setCalendarSettings((current) => ({
      ...current,
      ...preset,
    }));
  };

  const handleLogoUpload = async (file: File | null) => {
    if (!file) {
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'));
      reader.readAsDataURL(file);
    });

    updateCalendarSetting('brandLogoUrl', dataUrl);
  };

  const handleSaveBranding = async ({ pageName, handle, logoFile }: { pageName: string; handle: string; logoFile: File | null }) => {
    try {
      setIsSavingBranding(true);
      const savedBranding = await saveBranding({
        brandingId: brandingRecord?.id,
        pageName,
        handle,
        existingLogoUrl: brandingRecord?.logo_url || null,
        logoFile,
      });

      setBrandingRecord(savedBranding);
      setCalendarSettings((current) => ({
        ...current,
        appTitle: savedBranding.page_name,
        brandHandle: savedBranding.handle,
        brandLogoUrl: savedBranding.logo_url ?? '',
      }));
      setSupabaseNotice('Branding salvo no Supabase.');
    } catch (error) {
      console.error('Erro ao salvar branding', error);
      setSupabaseNotice('Nao foi possivel salvar o branding no Supabase.');
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleSaveTeamAsset = async (teamName: string, file: File) => {
    const teamSlug = normalizeTeamSlug(teamName);

    try {
      setSavingTeamSlug(teamSlug);
      const savedAsset = await saveTeamAsset({
        teamName,
        existingId: teamAssets[teamSlug]?.id,
        logoFile: file,
      });

      const nextAssets = {
        ...teamAssets,
        [savedAsset.team_slug]: savedAsset,
      };

      setTeamAssets(nextAssets);
      setMatches(parseMatchesInput(matchesText, Object.fromEntries(Object.values(nextAssets).map((asset) => [asset.team_slug, asset.logo_url]))));
      setSupabaseNotice(`Escudo salvo para ${teamName}.`);
    } catch (error) {
      console.error('Erro ao salvar escudo', error);
      setSupabaseNotice(`Nao foi possivel salvar o escudo de ${teamName}.`);
    } finally {
      setSavingTeamSlug(null);
    }
  };

  const handleSaveProject = async () => {
    try {
      setIsSavingProject(true);
      await saveCalendarProject({
        month,
        year,
        matchesText,
        brandingId: brandingRecord?.id ?? null,
      });
      setSupabaseNotice('Calendario salvo no Supabase.');
    } catch (error) {
      console.error('Erro ao salvar calendario', error);
      setSupabaseNotice('Nao foi possivel salvar o calendario no Supabase.');
    } finally {
      setIsSavingProject(false);
    }
  };

  const getCalendarFileName = () => {
    const normalizedMonth = month.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    const normalizedYear = year.trim() || 'sem-ano';
    return `calendario-palmeiras-${normalizedMonth || 'mes'}-${normalizedYear}.png`;
  };

  const getCalendarFileNameByFormat = (format: PalmeirasCalendarSettings['canvasFormat']) => {
    const baseFileName = getCalendarFileName().replace('.png', '');
    const formatLabel = canvasFormatOptions.find((option) => option.key === format)?.exportLabel ?? format;
    return `${baseFileName}-${formatLabel}.png`;
  };

  const waitForCalendarPaint = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  };

  const applyRoundedTransparency = async (blob: Blob, element: HTMLDivElement, pixelRatio: number) => {
    const imageUrl = URL.createObjectURL(blob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error('Nao foi possivel processar a imagem exportada.'));
        nextImage.src = imageUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        return blob;
      }

      const styles = window.getComputedStyle(element);
      const cssRadius = Number.parseFloat(styles.borderTopLeftRadius || '0') || 0;
      const radius = Math.min(cssRadius * pixelRatio, canvas.width / 2, canvas.height / 2);

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.beginPath();
      context.moveTo(radius, 0);
      context.lineTo(canvas.width - radius, 0);
      context.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
      context.lineTo(canvas.width, canvas.height - radius);
      context.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
      context.lineTo(radius, canvas.height);
      context.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
      context.lineTo(0, radius);
      context.quadraticCurveTo(0, 0, radius, 0);
      context.closePath();
      context.clip();
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const roundedBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png');
      });

      return roundedBlob ?? blob;
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  };

  const renderCalendarBlob = async () => {
    if (!calendarRef.current) {
      throw new Error('Calendário não encontrado para exportação.');
    }

    const pixelRatio = 3;

    const blob = await toBlob(calendarRef.current, {
      cacheBust: true,
      pixelRatio,
      skipFonts: false,
      backgroundColor: 'transparent',
    });

    if (!blob) {
      throw new Error('Não foi possível gerar a imagem do calendário.');
    }

    return applyRoundedTransparency(blob, calendarRef.current, pixelRatio);
  };

  const downloadCalendarBlob = (blob: Blob, fileName = getCalendarFileName()) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportCalendarAsPng = async (format?: PalmeirasCalendarSettings['canvasFormat']) => {
    const previousFormat = calendarSettings.canvasFormat;
    const targetFormat = format ?? previousFormat;

    try {
      setIsExporting(true);

      if (targetFormat !== previousFormat) {
        flushSync(() => {
          setCalendarSettings((current) => ({
            ...current,
            canvasFormat: targetFormat,
          }));
        });
        await waitForCalendarPaint();
      }

      const blob = await renderCalendarBlob();
      downloadCalendarBlob(blob, format ? getCalendarFileNameByFormat(targetFormat) : getCalendarFileName());
    } finally {
      if (targetFormat !== previousFormat) {
        flushSync(() => {
          setCalendarSettings((current) => ({
            ...current,
            canvasFormat: previousFormat,
          }));
        });
      }
      setIsExporting(false);
    }
  };

  const handleDownloadPng = async () => {
    setIsExportModalOpen(false);
    await exportCalendarAsPng();
  };

  const handleExportAllFormats = async () => {
    try {
      setIsExportModalOpen(false);
      setIsExporting(true);

      for (const format of canvasFormatOptions) {
        const previousFormat = calendarSettings.canvasFormat;

        flushSync(() => {
          setCalendarSettings((current) => ({
            ...current,
            canvasFormat: format.key,
          }));
        });

        await waitForCalendarPaint();
        const blob = await renderCalendarBlob();
        downloadCalendarBlob(blob, getCalendarFileNameByFormat(format.key));

        flushSync(() => {
          setCalendarSettings((current) => ({
            ...current,
            canvasFormat: previousFormat,
          }));
        });
        await waitForCalendarPaint();
      }
    } finally {
      setIsExporting(false);
    }
  };

  const currentFormat = canvasFormatOptions.find((option) => option.key === calendarSettings.canvasFormat) ?? canvasFormatOptions[0];
  const basePreviewWidth = previewBaseWidths[calendarSettings.canvasFormat];
  const previewMaxWidth = `min(100%, ${Math.round(basePreviewWidth * calendarSettings.calendarScale)}px)`;

  return (
    <div className="min-h-screen overflow-x-hidden overflow-y-auto bg-slate-950 px-3 py-2 text-slate-100 sm:px-4 lg:h-screen lg:overflow-hidden lg:px-5">
      <div className="mx-auto w-full max-w-[1440px]">
        <header className="mb-2 flex items-center justify-between rounded-[20px] border border-white/10 bg-slate-900/65 px-4 py-2 shadow-xl shadow-black/10 backdrop-blur-sm sm:px-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">Studio</p>
            <h1 className="mt-1 text-base font-semibold text-white sm:text-lg">{calendarSettings.appTitle}</h1>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-sm text-slate-400 lg:block">Preview, branding e exportacao em um fluxo so.</p>
            <button
              type="button"
              onClick={() => setIsAssetsOpen(true)}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08]"
            >
              Assets
            </button>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900/90 text-emerald-200 shadow-lg shadow-black/20 backdrop-blur-md transition hover:border-emerald-400/40 hover:text-white"
              aria-label="Abrir configurações do calendário"
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.3 2.9h3.4l.5 2.2a7.3 7.3 0 0 1 1.8.8l2-1 2.4 2.4-1 2a7.3 7.3 0 0 1 .8 1.8l2.2.5v3.4l-2.2.5a7.3 7.3 0 0 1-.8 1.8l1 2-2.4 2.4-2-1a7.3 7.3 0 0 1-1.8.8l-.5 2.2h-3.4l-.5-2.2a7.3 7.3 0 0 1-1.8-.8l-2 1-2.4-2.4 1-2a7.3 7.3 0 0 1-.8-1.8l-2.2-.5v-3.4l2.2-.5a7.3 7.3 0 0 1 .8-1.8l-1-2 2.4-2.4 2 1a7.3 7.3 0 0 1 1.8-.8l.5-2.2z" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
            </button>
          </div>
        </header>

        <div className="grid items-start gap-3 lg:h-[calc(100vh-74px)] lg:grid-cols-[minmax(340px,380px)_minmax(0,1fr)] lg:gap-3 xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)] xl:gap-4">
          <aside className="rounded-[24px] border border-white/10 bg-slate-900/90 p-4 shadow-2xl shadow-black/30 backdrop-blur-sm sm:rounded-[28px] sm:p-5 lg:h-full lg:overflow-y-auto">
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-300 sm:text-sm">Gerador rápido</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Cole as partidas no formato <code className="rounded bg-slate-800 px-2 py-1 text-xs text-emerald-300">DD - Time A x Time B</code> e clique em gerar.
              </p>
              {isLoadingAssets ? <p className="mt-2 text-xs text-slate-400">Carregando branding e escudos salvos...</p> : null}
              {supabaseNotice ? <p className="mt-2 text-xs text-emerald-200">{supabaseNotice}</p> : null}
            </div>

            <form className="space-y-2" onSubmit={handleGenerate}>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_132px]">
                <label className="block text-sm font-medium text-slate-200">
                  Mês
                  <input
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                    placeholder="ABRIL"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-200">
                  Ano
                  <input
                    value={year}
                    onChange={(event) => setYear(event.target.value)}
                    placeholder="2026"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-slate-200">
                Partidas
                <textarea
                  value={matchesText}
                  onChange={(event) => setMatchesText(event.target.value)}
                  rows={8}
                  className="mt-2 h-[180px] w-full overflow-y-auto resize-y rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 sm:h-[170px] lg:h-[220px]"
                />
              </label>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400"
              >
                Gerar calendário
              </button>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setIsAssetsOpen(true)}
                  className="inline-flex w-full items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08]"
                >
                  Branding e escudos
                </button>
                <button
                  type="button"
                  onClick={handleSaveProject}
                  disabled={isSavingProject}
                  className="inline-flex w-full items-center justify-center rounded-3xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/35 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingProject ? 'Salvando...' : 'Salvar calendário'}
                </button>
              </div>
            </form>
          </aside>

          <div className="space-y-3 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden lg:space-y-3">
            <div className="rounded-[24px] border border-white/10 bg-slate-900/70 p-3 shadow-2xl shadow-black/20 backdrop-blur-sm sm:rounded-[28px] sm:p-3">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px] xl:items-end">
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Formato do post</p>
                  <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div className="grid gap-2 sm:grid-cols-3 lg:max-w-[420px]">
                      {canvasFormatOptions.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => updateCalendarSetting('canvasFormat', option.key)}
                        className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                            calendarSettings.canvasFormat === option.key
                              ? 'border-emerald-400/45 bg-emerald-400/10 text-white'
                              : 'border-white/10 bg-slate-950/35 text-slate-300 hover:border-emerald-400/30 hover:bg-slate-950/55 hover:text-white'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <p className="text-sm text-slate-300">
                      <span className="font-semibold text-white">{currentFormat.label}</span>
                      <span className="text-slate-500"> · </span>
                      <span>{currentFormat.sizeLabel}</span>
                    </p>
                  </div>

                  <div className="mt-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setIsExpandedPreviewOpen(true)}
                        className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08]"
                      >
                        Visualizar expandido
                      </button>

                      <label className="flex min-w-[220px] items-center gap-3 text-sm text-slate-300">
                        <span className="whitespace-nowrap font-medium text-white">Tamanho</span>
                        <input
                          type="range"
                          min={0.85}
                          max={1.2}
                          step={0.05}
                          value={calendarSettings.calendarScale}
                          onChange={(event) => updateCalendarSetting('calendarScale', Number(event.target.value))}
                          className="w-full accent-emerald-400"
                        />
                        <span className="min-w-[44px] text-right text-emerald-200">{Math.round(calendarSettings.calendarScale * 100)}%</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="xl:min-w-[240px]">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Exportação</p>
                  <button
                    type="button"
                    onClick={() => setIsExportModalOpen(true)}
                    disabled={isExporting}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/35 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isExporting ? 'Exportando...' : 'Exportar'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-center lg:min-h-0 lg:flex-1 lg:items-start lg:justify-center">
              <div className="h-full w-full overflow-y-auto pb-6 pr-1">
                <div className="mx-auto w-full max-w-[min(100%,980px)] min-h-min" style={{ maxWidth: previewMaxWidth }}>
                  <PalmeirasCalendar ref={calendarRef} month={month} year={year} matches={matches} settings={calendarSettings} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isExpandedPreviewOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4 lg:p-6">
          <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Preview</p>
                <p className="mt-1 text-sm text-slate-300">Visualização ampliada para revisão antes da exportação.</p>
              </div>

              <button
                type="button"
                onClick={() => setIsExpandedPreviewOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/20 hover:text-white"
                aria-label="Fechar visualização ampliada"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
              <div className="mx-auto w-full" style={{ maxWidth: previewMaxWidth }}>
                <PalmeirasCalendar month={month} year={year} matches={matches} settings={calendarSettings} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isExportModalOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4 lg:p-6">
          <div className="mx-auto flex w-full max-w-md flex-col rounded-[28px] border border-white/10 bg-slate-900/95 p-4 shadow-2xl shadow-black/40 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Exportação</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Escolha o formato</h2>
              </div>

              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/20 hover:text-white"
                aria-label="Fechar exportação"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <button type="button" onClick={handleDownloadPng} className="w-full rounded-2xl border border-white/10 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/[0.06]">Exportar formato atual</button>
              <button type="button" onClick={() => exportCalendarAsPng('feedPortrait')} className="w-full rounded-2xl border border-white/10 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/[0.06]">Exportar retrato</button>
              <button type="button" onClick={() => exportCalendarAsPng('square')} className="w-full rounded-2xl border border-white/10 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/[0.06]">Exportar quadrado</button>
              <button type="button" onClick={() => exportCalendarAsPng('story')} className="w-full rounded-2xl border border-white/10 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/[0.06]">Exportar story</button>
              <button type="button" onClick={handleExportAllFormats} className="w-full rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-left text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20">Exportar todos</button>
            </div>
          </div>
        </div>
      ) : null}

      <CalendarAssetsModal
        isOpen={isAssetsOpen}
        initialPageName={calendarSettings.appTitle}
        initialHandle={calendarSettings.brandHandle}
        initialLogoUrl={calendarSettings.brandLogoUrl}
        brandingRecord={brandingRecord}
        teamAssets={teamAssets}
        teams={calendarTeams}
        onClose={() => setIsAssetsOpen(false)}
        onSaveBranding={handleSaveBranding}
        onSaveTeamAsset={handleSaveTeamAsset}
        isSavingBranding={isSavingBranding}
        savingTeamSlug={savingTeamSlug}
      />

      <CalendarSettingsModal
        isOpen={isSettingsOpen}
        settings={calendarSettings}
        month={month}
        year={year}
        matches={matches}
        onClose={() => setIsSettingsOpen(false)}
        onToggle={toggleCalendarSetting}
        onChange={updateCalendarSetting}
        onApplyPreset={applyCalendarPreset}
        onLogoUpload={handleLogoUpload}
      />
    </div>
  );
}
