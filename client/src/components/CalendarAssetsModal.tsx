import React, { useMemo, useState } from 'react';
import type { CalendarBrandingRecord, CalendarTeamAssetRecord } from '@/lib/calendar-supabase';
import { normalizeTeamSlug } from '@/lib/calendar-supabase';

interface CalendarAssetsModalProps {
  isOpen: boolean;
  initialPageName: string;
  initialHandle: string;
  initialLogoUrl: string;
  brandingRecord: CalendarBrandingRecord | null;
  teamAssets: Record<string, CalendarTeamAssetRecord>;
  teams: string[];
  onClose: () => void;
  onSaveBranding: (values: { pageName: string; handle: string; logoFile: File | null }) => Promise<void>;
  onSaveTeamAsset: (teamName: string, file: File) => Promise<void>;
  isSavingBranding: boolean;
  savingTeamSlug: string | null;
}

export default function CalendarAssetsModal({
  isOpen,
  initialPageName,
  initialHandle,
  initialLogoUrl,
  brandingRecord,
  teamAssets,
  teams,
  onClose,
  onSaveBranding,
  onSaveTeamAsset,
  isSavingBranding,
  savingTeamSlug,
}: CalendarAssetsModalProps) {
  const [pageName, setPageName] = useState(initialPageName);
  const [handle, setHandle] = useState(initialHandle);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    setPageName(initialPageName);
    setHandle(initialHandle);
    setLogoFile(null);
  }, [initialHandle, initialPageName, isOpen]);

  const orderedTeams = useMemo(() => [...teams].sort((left, right) => left.localeCompare(right, 'pt-BR')), [teams]);
  const logoPreviewUrl = logoFile ? URL.createObjectURL(logoFile) : initialLogoUrl;

  React.useEffect(() => {
    return () => {
      if (logoPreviewUrl && logoFile) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoFile, logoPreviewUrl]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/85 p-3 backdrop-blur-sm sm:p-4 lg:p-6">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5 sm:py-5 lg:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Assets</p>
            <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">Branding e escudos</h2>
            <p className="mt-2 text-sm text-slate-400">Salve identidade visual e escudos no Supabase para reutilizar no calendário atual.</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/20 hover:text-white"
            aria-label="Fechar assets"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Branding ativo</p>
                  <p className="mt-1 text-xs text-slate-400">Nome da página, handle e logo principal usados no calendário.</p>
                </div>
                {brandingRecord ? <span className="text-xs text-emerald-200">salvo</span> : null}
              </div>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Nome da página</span>
                  <input
                    value={pageName}
                    onChange={(event) => setPageName(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40"
                    placeholder="Calendário Palmeiras"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Handle</span>
                  <input
                    value={handle}
                    onChange={(event) => setHandle(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40"
                    placeholder="@meupalestra"
                  />
                </label>

                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-200">Logo da página</p>
                      <p className="mt-1 text-xs text-slate-500">PNG transparente quadrado entre 256x256 e 512x512 px.</p>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-950/80">
                      {logoPreviewUrl ? (
                        <img src={logoPreviewUrl} alt={pageName || 'Branding'} className="h-[88%] w-[88%] object-contain" />
                      ) : (
                        <span className="text-lg font-bold text-emerald-100">P</span>
                      )}
                    </div>
                  </div>

                  <label className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08]">
                    Enviar logo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => onSaveBranding({ pageName, handle, logoFile })}
                  disabled={isSavingBranding}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingBranding ? 'Salvando branding...' : 'Salvar branding'}
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div>
                <p className="text-sm font-semibold text-white">Escudos dos times</p>
                <p className="mt-1 text-xs text-slate-400">Envie manualmente os escudos dos times encontrados no calendário atual.</p>
              </div>

              <div className="mt-4 space-y-3">
                {orderedTeams.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                    Gere ou cole partidas para listar os times aqui.
                  </div>
                ) : (
                  orderedTeams.map((teamName) => {
                    const teamSlug = normalizeTeamSlug(teamName);
                    const asset = teamAssets[teamSlug];

                    return (
                      <div key={teamName} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-950/90">
                            {asset?.logo_url ? (
                              <img src={asset.logo_url} alt={teamName} className="h-[84%] w-[84%] object-contain" />
                            ) : (
                              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">sem</span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{teamName}</p>
                            <p className="mt-1 text-xs text-slate-500">{asset?.logo_url ? 'Escudo salvo no Supabase' : 'Usando fallback local por enquanto'}</p>
                          </div>
                        </div>

                        <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08]">
                          {savingTeamSlug === teamSlug ? 'Enviando...' : 'Enviar escudo'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={savingTeamSlug === teamSlug}
                            onChange={async (event) => {
                              const file = event.target.files?.[0];
                              if (!file) {
                                return;
                              }

                              await onSaveTeamAsset(teamName, file);
                              event.currentTarget.value = '';
                            }}
                          />
                        </label>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
