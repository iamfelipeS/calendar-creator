import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import TeamAssetCard, { type TeamAssetItem, type TeamAssetOrigin } from '@/components/TeamAssetCard';
import {
  fetchCalendarProjectTeamSources,
  fetchTeamAssets,
  normalizeTeamSlug,
  removeTeamAsset,
  saveTeamAsset,
  type CalendarProjectTeamSourceRecord,
  type CalendarTeamAssetRecord,
} from '@/lib/calendar-supabase';
import {
  extractTeamNamesFromMatchesText,
  extractTeamNamesFromStoredMatches,
  getStoredCurrentCalendarTeams,
  isUndefinedTeam,
} from '@/lib/calendar-matches';
import { teamLogos } from '@/lib/calendar-team-logos';

type ShieldFilter = 'all' | 'custom' | 'placeholder' | 'duplicates';
type ShieldViewMode = 'grid' | 'list';

const PAGE_SIZE = 20;

interface KnownTeam {
  teamName: string;
  priority: number;
  aliases: string[];
}

const filterOptions: Array<{ key: ShieldFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'custom', label: 'Personalizados' },
  { key: 'placeholder', label: 'Sem escudo' },
  { key: 'duplicates', label: 'Duplicados' },
];

const addAlias = (aliases: string[], teamName: string) => {
  if (aliases.some((alias) => normalizeTeamSlug(alias) === normalizeTeamSlug(teamName) && alias.toLowerCase() === teamName.toLowerCase())) {
    return aliases;
  }

  return [...aliases, teamName];
};

const addTeamName = (teamsBySlug: Map<string, KnownTeam>, teamName: string, priority: number) => {
  const trimmedName = teamName.trim();
  const teamSlug = normalizeTeamSlug(trimmedName);

  if (!trimmedName || !teamSlug || isUndefinedTeam(trimmedName)) {
    return;
  }

  const current = teamsBySlug.get(teamSlug);

  if (!current) {
    teamsBySlug.set(teamSlug, { teamName: trimmedName, priority, aliases: [trimmedName] });
    return;
  }

  const aliases = addAlias(current.aliases, trimmedName);

  if (priority >= current.priority) {
    teamsBySlug.set(teamSlug, { teamName: trimmedName, priority, aliases });
  } else {
    teamsBySlug.set(teamSlug, { ...current, aliases });
  }
};

const getProjectTeamNames = (projects: CalendarProjectTeamSourceRecord[]) =>
  projects.flatMap((project) => {
    const structuredNames = extractTeamNamesFromStoredMatches(project.matches);
    return structuredNames.length > 0 ? structuredNames : extractTeamNamesFromMatchesText(project.matches_text);
  });

const buildTeamItems = ({
  teamAssets,
  projectTeamNames,
  currentCalendarTeams,
  locallyKeptTeams,
}: {
  teamAssets: Record<string, CalendarTeamAssetRecord>;
  projectTeamNames: string[];
  currentCalendarTeams: string[];
  locallyKeptTeams: string[];
}): TeamAssetItem[] => {
  const teamsBySlug = new Map<string, KnownTeam>();

  for (const teamName of Object.keys(teamLogos)) {
    addTeamName(teamsBySlug, teamName, 1);
  }

  for (const teamName of projectTeamNames) {
    addTeamName(teamsBySlug, teamName, 2);
  }

  for (const teamName of currentCalendarTeams) {
    addTeamName(teamsBySlug, teamName, 3);
  }

  for (const teamName of locallyKeptTeams) {
    addTeamName(teamsBySlug, teamName, 3);
  }

  for (const asset of Object.values(teamAssets)) {
    addTeamName(teamsBySlug, asset.team_name, 4);
  }

  return Array.from(teamsBySlug.entries())
    .map(([teamSlug, knownTeam]): TeamAssetItem => {
      const asset = teamAssets[teamSlug];
      const localLogo = teamLogos[teamSlug];
      const origin: TeamAssetOrigin = asset?.logo_url ? 'custom' : 'placeholder';
      const displayName = asset?.team_name || knownTeam.teamName;
      const duplicateNames = knownTeam.aliases
        .filter((alias) => alias.toLowerCase() !== displayName.toLowerCase())
        .sort((left, right) => left.localeCompare(right, 'pt-BR'));

      return {
        teamName: displayName,
        teamSlug,
        asset,
        logoUrl: asset?.logo_url || localLogo,
        origin,
        duplicateNames,
      };
    })
    .sort((left, right) => left.teamName.localeCompare(right.teamName, 'pt-BR'));
};

export default function ShieldLibrary() {
  const [teamAssets, setTeamAssets] = useState<Record<string, CalendarTeamAssetRecord>>({});
  const [projectTeamNames, setProjectTeamNames] = useState<string[]>([]);
  const [currentCalendarTeams, setCurrentCalendarTeams] = useState<string[]>([]);
  const [locallyKeptTeams, setLocallyKeptTeams] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<ShieldFilter>('all');
  const [viewMode, setViewMode] = useState<ShieldViewMode>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadingSlug, setUploadingSlug] = useState<string | null>(null);
  const [removingSlug, setRemovingSlug] = useState<string | null>(null);

  useEffect(() => {
    const loadShieldLibrary = async () => {
      setIsLoading(true);
      setLoadError(null);

      const [assetsResult, projectsResult] = await Promise.allSettled([
        fetchTeamAssets(),
        fetchCalendarProjectTeamSources(),
      ]);

      if (assetsResult.status === 'fulfilled') {
        setTeamAssets(assetsResult.value);
      } else {
        console.error('Erro ao carregar escudos persistidos', assetsResult.reason);
        setLoadError('Nao foi possivel carregar escudos personalizados agora.');
      }

      if (projectsResult.status === 'fulfilled') {
        setProjectTeamNames(getProjectTeamNames(projectsResult.value));
      } else {
        console.error('Erro ao carregar times de calendarios salvos', projectsResult.reason);
        setLoadError((current) => current || 'Nao foi possivel carregar times de calendarios antigos agora.');
      }

      setCurrentCalendarTeams(getStoredCurrentCalendarTeams());
      setIsLoading(false);
    };

    void loadShieldLibrary();
  }, []);

  const teamItems = useMemo(
    () => buildTeamItems({ teamAssets, projectTeamNames, currentCalendarTeams, locallyKeptTeams }),
    [currentCalendarTeams, locallyKeptTeams, projectTeamNames, teamAssets],
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = normalizeTeamSlug(searchTerm);

    return teamItems.filter((item) => {
      const matchesFilter =
        activeFilter === 'all' ||
        item.origin === activeFilter ||
        (activeFilter === 'duplicates' && Boolean(item.duplicateNames?.length));
      const matchesSearch =
        !normalizedSearch ||
        normalizeTeamSlug(item.teamName).includes(normalizedSearch) ||
        item.teamSlug.includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, searchTerm, teamItems]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredItems]);
  const paginationStart = filteredItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const paginationEnd = Math.min(currentPage * PAGE_SIZE, filteredItems.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchTerm]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleUpload = async (teamName: string, file: File) => {
    const teamSlug = normalizeTeamSlug(teamName);

    try {
      setUploadingSlug(teamSlug);
      setActionError(null);
      setActionNotice(null);

      const savedAsset = await saveTeamAsset({
        teamName,
        existingId: teamAssets[teamSlug]?.id,
        existingStoragePath: teamAssets[teamSlug]?.storage_path ?? null,
        logoFile: file,
      });

      setTeamAssets((current) => ({
        ...current,
        [savedAsset.team_slug]: savedAsset,
      }));
      setLocallyKeptTeams((current) => (current.includes(teamName) ? current : [...current, teamName]));
      setActionNotice(`Escudo salvo para ${teamName}.`);
    } catch (error) {
      console.error('Erro ao salvar escudo pela biblioteca', error);
      setActionError(`Nao foi possivel salvar o escudo de ${teamName}.`);
    } finally {
      setUploadingSlug(null);
    }
  };

  const handleRemove = async (item: TeamAssetItem) => {
    if (!item.asset) {
      return;
    }

    const shouldRemove = window.confirm(`Remover o escudo personalizado de ${item.teamName}?`);
    if (!shouldRemove) {
      return;
    }

    try {
      setRemovingSlug(item.teamSlug);
      setActionError(null);
      setActionNotice(null);

      await removeTeamAsset({
        assetId: item.asset.id,
        storagePath: item.asset.storage_path,
      });

      setTeamAssets((current) => {
        const nextAssets = { ...current };
        delete nextAssets[item.teamSlug];
        return nextAssets;
      });
      setLocallyKeptTeams((current) => (current.includes(item.teamName) ? current : [...current, item.teamName]));
      setActionNotice(`Escudo personalizado removido de ${item.teamName}.`);
    } catch (error) {
      console.error('Erro ao remover escudo personalizado', error);
      setActionError(`Nao foi possivel remover o escudo de ${item.teamName}.`);
    } finally {
      setRemovingSlug(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-3 py-4 text-slate-100 sm:px-5 lg:px-6">
      <main className="mx-auto w-full max-w-[1440px]">
        <header className="flex flex-col gap-4 rounded-[24px] border border-white/10 bg-slate-900/80 p-4 shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Calendar Creator</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Biblioteca de Escudos</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Gerencie escudos personalizados e veja os times conhecidos por assets, calendários salvos e calendário aberto.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08]"
          >
            Voltar ao calendário
          </Link>
        </header>

        <section className="mt-4 rounded-[24px] border border-white/10 bg-slate-900/70 p-4 shadow-xl shadow-black/15 sm:p-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <label className="block text-sm font-medium text-slate-200">
              Pesquisar time
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Digite nome ou slug"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
              />
            </label>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {filterOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setActiveFilter(option.key)}
                    className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                      activeFilter === option.key
                        ? 'border-emerald-400/45 bg-emerald-400/10 text-white'
                        : 'border-white/10 bg-slate-950/35 text-slate-300 hover:border-emerald-400/30 hover:bg-slate-950/55 hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 xl:justify-end">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                    viewMode === 'grid'
                      ? 'border-emerald-400/45 bg-emerald-400/10 text-white'
                      : 'border-white/10 bg-slate-950/35 text-slate-300 hover:border-emerald-400/30 hover:bg-slate-950/55 hover:text-white'
                  }`}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                    viewMode === 'list'
                      ? 'border-emerald-400/45 bg-emerald-400/10 text-white'
                      : 'border-white/10 bg-slate-950/35 text-slate-300 hover:border-emerald-400/30 hover:bg-slate-950/55 hover:text-white'
                  }`}
                >
                  Lista enxuta
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span>{teamItems.length} times conhecidos</span>
            <span>{filteredItems.length} exibidos</span>
            <span>
              {paginationStart}-{paginationEnd} nesta pagina
            </span>
            {loadError ? <span className="text-amber-200">{loadError}</span> : null}
            {actionNotice ? <span className="text-emerald-200">{actionNotice}</span> : null}
            {actionError ? <span className="text-red-200">{actionError}</span> : null}
          </div>
        </section>

        <section className="mt-4">
          {isLoading ? (
            <div className="grid min-h-[420px] place-items-center rounded-[24px] border border-white/10 bg-slate-900/70 px-4 py-10 text-center shadow-xl shadow-black/15">
              <div>
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-emerald-300/25 border-t-emerald-300" />
                <p className="mt-4 text-sm font-semibold text-white">Carregando biblioteca de escudos...</p>
                <p className="mt-2 text-sm text-slate-400">Buscando assets, calendários salvos e times do calendário atual.</p>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-slate-900/50 px-4 py-10 text-center text-sm text-slate-400">
              Nenhum time encontrado para os filtros atuais.
            </div>
          ) : (
            <>
            <div className={viewMode === 'list' ? 'space-y-2' : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'}>
              {paginatedItems.map((item) => (
                <TeamAssetCard
                  key={item.teamSlug}
                  item={item}
                  layout={viewMode === 'list' ? 'compact' : 'card'}
                  isUploading={uploadingSlug === item.teamSlug}
                  isRemoving={removingSlug === item.teamSlug}
                  onUpload={handleUpload}
                  onRemove={handleRemove}
                />
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-[20px] border border-white/10 bg-slate-900/60 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-400">
                Pagina <span className="font-semibold text-white">{currentPage}</span> de <span className="font-semibold text-white">{totalPages}</span>
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Primeira
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Proxima
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Ultima
                </button>
              </div>
            </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
