import React from 'react';
import PalmeirasCalendar, { MatchDay, PalmeirasCalendarSettings } from '@/components/PalmeirasCalendar';

interface CalendarSettingsModalProps {
  isOpen: boolean;
  settings: PalmeirasCalendarSettings;
  month: string;
  year: string;
  matches: MatchDay[];
  onClose: () => void;
  onToggle: (key: keyof PalmeirasCalendarSettings) => void;
  onChange: <K extends keyof PalmeirasCalendarSettings>(key: K, value: PalmeirasCalendarSettings[K]) => void;
  onApplyPreset: (preset: Partial<PalmeirasCalendarSettings>) => void;
  onLogoUpload: (file: File | null) => void;
}

const presets: Array<{ label: string; values: Partial<PalmeirasCalendarSettings> }> = [
  {
    label: 'Premium',
    values: {
      canvasFormat: 'feedPortrait',
      backgroundStart: '#064e3b',
      backgroundMid: '#065f46',
      backgroundEnd: '#022c22',
      accentColor: '#6ee7b7',
      watermarkOpacity: 0.04,
      watermarkScale: 1,
    },
  },
  {
    label: 'Noite',
    values: {
      canvasFormat: 'feedPortrait',
      backgroundStart: '#0f172a',
      backgroundMid: '#0f3b46',
      backgroundEnd: '#020617',
      accentColor: '#67e8f9',
      watermarkOpacity: 0.03,
      watermarkScale: 0.92,
    },
  },
  {
    label: 'Dourado',
    values: {
      canvasFormat: 'feedPortrait',
      backgroundStart: '#14532d',
      backgroundMid: '#166534',
      backgroundEnd: '#052e16',
      accentColor: '#facc15',
      watermarkOpacity: 0.05,
      watermarkScale: 1.06,
    },
  },
];

const toggleOptions: Array<{ key: keyof PalmeirasCalendarSettings; title: string; description: string }> = [
  { key: 'showYear', title: 'Mostrar ano', description: 'Exibe o ano abaixo do mes.' },
  { key: 'showWatermark', title: 'Mostrar marca d agua', description: 'Mantem o watermark ao fundo do layout.' },
  { key: 'showFooter', title: 'Mostrar rodape', description: 'Exibe o rodape institucional.' },
  { key: 'showHandle', title: 'Mostrar handle', description: 'Exibe o perfil no topo direito.' },
  { key: 'showFreeDays', title: 'Mostrar dias livres', description: 'Exibe o estado visual dos dias sem jogo.' },
];

const rangeOptions: Array<{
  key: 'watermarkOpacity' | 'watermarkScale' | 'watermarkOffsetX' | 'watermarkOffsetY';
  title: string;
  description: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}> = [
  {
    key: 'watermarkOpacity',
    title: 'Intensidade da marca d agua',
    description: 'Controla a presenca visual do texto ao fundo.',
    min: 0,
    max: 0.12,
    step: 0.01,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'watermarkScale',
    title: 'Tamanho da marca d agua',
    description: 'Ajusta a escala do watermark sem perder centralizacao.',
    min: 0.35,
    max: 1.4,
    step: 0.05,
    format: (value) => `${value.toFixed(2)}x`,
  },
  {
    key: 'watermarkOffsetX',
    title: 'Posição horizontal',
    description: 'Move a marca d agua para esquerda ou direita.',
    min: -220,
    max: 220,
    step: 5,
    format: (value) => `${value > 0 ? '+' : ''}${Math.round(value)}px`,
  },
  {
    key: 'watermarkOffsetY',
    title: 'Posição vertical',
    description: 'Move a marca d agua para cima ou para baixo.',
    min: -260,
    max: 260,
    step: 5,
    format: (value) => `${value > 0 ? '+' : ''}${Math.round(value)}px`,
  },
];

const densityOptions: Array<{
  key: PalmeirasCalendarSettings['density'];
  title: string;
}> = [
  { key: 'compact', title: 'Compacto' },
  { key: 'comfortable', title: 'Confortável' },
];

const modalPreviewWidths: Record<PalmeirasCalendarSettings['canvasFormat'], number> = {
  feedPortrait: 1325,
  square: 1094,
  story: 749,
};

export default function CalendarSettingsModal({
  isOpen,
  settings,
  month,
  year,
  matches,
  onClose,
  onToggle,
  onChange,
  onApplyPreset,
  onLogoUpload,
}: CalendarSettingsModalProps) {
  const previewAspectRatio = settings.canvasFormat === 'square' ? 1080 / 1080 : settings.canvasFormat === 'story' ? 1080 / 1920 : 1080 / 1350;
  const previewBaseWidth = modalPreviewWidths[settings.canvasFormat];
  const previewBaseHeight = previewBaseWidth / previewAspectRatio;
  const previewScale = settings.canvasFormat === 'story' ? 0.2 : 0.24;
  const previewWrapperHeight = previewBaseHeight * previewScale;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 p-3 backdrop-blur-sm sm:p-4 lg:flex lg:items-center lg:justify-center lg:p-6">
      <div className="mx-auto flex h-[calc(100vh-24px)] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/40 sm:h-[calc(100vh-32px)] sm:rounded-[28px] lg:h-auto lg:max-h-[90vh]">
        <div className="relative z-30 shrink-0 flex items-start justify-between gap-4 rounded-t-[24px] border-b border-white/10 bg-slate-900 px-4 py-4 shadow-[0_12px_30px_rgba(0,0,0,0.18)] sm:rounded-t-[28px] sm:px-5 sm:py-5 lg:px-6 lg:py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Configurações</p>
            <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">Personalização do calendário</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/20 hover:text-white"
            aria-label="Fechar configuracoes"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-5 pr-3 sm:px-5 sm:pb-5 sm:pt-6 sm:pr-4 lg:px-6 lg:pb-6 lg:pt-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.85fr)] lg:gap-6">
          <div className="space-y-4 lg:pr-2 lg:space-y-5">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-semibold text-white">Branding</p>
              <p className="mt-1 text-xs text-slate-400">Ajustes simples para logo, handle e nome interno do app.</p>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold text-white">Nome do app</span>
                  <input
                    type="text"
                    value={settings.appTitle}
                    onChange={(event) => onChange('appTitle', event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40"
                    placeholder="Calendário Palmeiras"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-white">Handle exibido</span>
                  <input
                    type="text"
                    value={settings.brandHandle}
                    onChange={(event) => onChange('brandHandle', event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40"
                    placeholder="@meupalestra"
                  />
                </label>

                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Logo do calendário</p>
                      <p className="mt-1 text-xs text-slate-500">Ideal: PNG transparente em proporção quadrada, entre 256x256 e 512x512 px.</p>
                    </div>

                    <div className={`flex h-12 w-12 items-center justify-center overflow-hidden rounded-full ${settings.brandLogoUrl ? 'bg-transparent' : 'border border-white/10 bg-white/5'}`}>
                      {settings.brandLogoUrl ? (
                        <img
                          src={settings.brandLogoUrl}
                          alt={settings.appTitle}
                          className="object-contain"
                          style={{
                            width: '88%',
                            height: '88%',
                            maxWidth: '100%',
                            maxHeight: '100%',
                            transform: `scale(${settings.logoScale})`,
                            transformOrigin: 'center',
                          }}
                        />
                      ) : (
                        <span className="text-sm font-bold text-white">P</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08]">
                      Enviar logo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => onLogoUpload(event.target.files?.[0] ?? null)}
                      />
                    </label>

                    {settings.brandLogoUrl ? (
                      <button
                        type="button"
                        onClick={() => onChange('brandLogoUrl', '')}
                        className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:text-white"
                      >
                        Remover logo
                      </button>
                    ) : null}
                  </div>

                  {settings.brandLogoUrl ? (
                    <label className="mt-4 block">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">Tamanho da logo</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-semibold text-emerald-200">
                          {Math.round(settings.logoScale * 100)}%
                        </span>
                      </div>

                      <input
                        type="range"
                        min={0.7}
                        max={2}
                        step={0.05}
                        value={settings.logoScale}
                        onChange={(event) => onChange('logoScale', Number(event.target.value))}
                        className="mt-3 w-full accent-emerald-400"
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Presets visuais</p>
                  <p className="mt-1 text-xs text-slate-400">Pontos de partida para acelerar a personalizacao.</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onApplyPreset(preset.values)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-emerald-400/40 hover:bg-white/[0.08]"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-semibold text-white">Elementos exibidos</p>
              <p className="mt-1 text-xs text-slate-400">Controle os elementos institucionais e informativos.</p>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {toggleOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onToggle(option.key)}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-left transition hover:border-emerald-400/30 hover:bg-slate-950/70"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{option.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{option.description}</p>
                    </div>

                    <span
                      className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition ${
                        settings[option.key] ? 'bg-emerald-500/90' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                          settings[option.key] ? 'left-6' : 'left-1'
                        }`}
                      ></span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-semibold text-white">Densidade do calendário</p>
              <p className="mt-1 text-xs text-slate-400">Controle o espaçamento interno das células.</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {densityOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onChange('density', option.key)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      settings.density === option.key
                        ? 'border-emerald-400/45 bg-emerald-400/10'
                        : 'border-white/10 bg-slate-950/40 hover:border-emerald-400/25 hover:bg-slate-950/70'
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{option.title}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-semibold text-white">Escala e intensidade</p>
              <p className="mt-1 text-xs text-slate-400">Ajustes finos para o tamanho geral e o peso do watermark.</p>

              <div className="mt-4 space-y-4">
                {rangeOptions.map((option) => (
                  <label key={option.key} className="block">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{option.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{option.description}</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-semibold text-emerald-200">
                        {option.format(settings[option.key])}
                      </span>
                    </div>

                    <input
                      type="range"
                      min={option.min}
                      max={option.max}
                      step={option.step}
                      value={settings[option.key]}
                      onChange={(event) => onChange(option.key, Number(event.target.value))}
                      className="mt-3 w-full accent-emerald-400"
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-semibold text-white">Cores</p>
              <p className="mt-1 text-xs text-slate-400">Defina fundo e cor de destaque do calendario.</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { key: 'backgroundStart', title: 'Topo do fundo' },
                  { key: 'backgroundMid', title: 'Centro do fundo' },
                  { key: 'backgroundEnd', title: 'Base do fundo' },
                  { key: 'accentColor', title: 'Cor de destaque' },
                ].map((option) => {
                  const optionKey = option.key as 'backgroundStart' | 'backgroundMid' | 'backgroundEnd' | 'accentColor';

                  return (
                    <label key={option.key} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{option.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{settings[optionKey]}</p>
                      </div>

                      <input
                        type="color"
                        value={settings[optionKey]}
                        onChange={(event) => onChange(optionKey, event.target.value)}
                        className="h-11 w-11 rounded-xl border border-white/10 bg-transparent p-1"
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="space-y-4 lg:sticky lg:top-0 lg:self-start lg:pr-1 lg:space-y-5">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-semibold text-white">Preview rapido</p>
              <p className="mt-1 text-xs text-slate-400">Leitura resumida do visual configurado.</p>

              <div className="mt-4 flex justify-center overflow-hidden rounded-[22px] border border-white/10 bg-slate-950/20 p-3 sm:p-4">
                <div
                  className="relative w-full overflow-hidden transition-all duration-200"
                  style={{
                    height: `${previewWrapperHeight}px`,
                    maxWidth: `${previewBaseWidth * previewScale}px`,
                  }}
                >
                  <div
                    style={{
                      width: `${previewBaseWidth}px`,
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'top center',
                    }}
                  >
                    <PalmeirasCalendar month={month} year={year} matches={matches} settings={settings} />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-semibold text-white">Resumo atual</p>
              <div className="mt-4 space-y-2 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Formato</span>
                  <span className="text-emerald-200">
                    {settings.canvasFormat === 'square' ? 'quadrado' : settings.canvasFormat === 'story' ? 'story' : 'retrato'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Marca d agua</span>
                  <span className="text-emerald-200">{settings.showWatermark ? 'ativa' : 'oculta'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Cor destaque</span>
                  <span className="font-mono text-emerald-200">{settings.accentColor}</span>
                </div>
              </div>
            </section>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
