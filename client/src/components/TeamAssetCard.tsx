import TeamShieldPreview from '@/components/TeamShieldPreview';
import type { CalendarTeamAssetRecord } from '@/lib/calendar-supabase';
import { RefreshCw, Trash2, Upload } from 'lucide-react';

export type TeamAssetOrigin = 'custom' | 'placeholder';

export interface TeamAssetItem {
  teamName: string;
  teamSlug: string;
  logoUrl?: string;
  origin: TeamAssetOrigin;
  duplicateNames?: string[];
  asset?: CalendarTeamAssetRecord;
}

interface TeamAssetCardProps {
  item: TeamAssetItem;
  isUploading?: boolean;
  isRemoving?: boolean;
  layout?: 'compact' | 'card';
  onUpload: (teamName: string, file: File) => Promise<void>;
  onRemove?: (item: TeamAssetItem) => Promise<void>;
}

const originLabel: Record<TeamAssetOrigin, string> = {
  custom: 'Personalizado',
  placeholder: 'Sem escudo',
};

const originClass: Record<TeamAssetOrigin, string> = {
  custom: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
  placeholder: 'border-slate-500/20 bg-slate-700/45 text-slate-300',
};

export default function TeamAssetCard({
  item,
  isUploading = false,
  isRemoving = false,
  layout = 'card',
  onUpload,
  onRemove,
}: TeamAssetCardProps) {
  const isBusy = isUploading || isRemoving;
  const isCompact = layout === 'compact';

  return (
    <article
      className={
        isCompact
          ? 'flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:flex-row sm:items-center sm:justify-between'
          : 'flex h-full flex-col rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-xl shadow-black/15'
      }
    >
      <div className={isCompact ? 'flex min-w-0 items-center gap-3' : 'flex min-w-0 items-start gap-3'}>
        <TeamShieldPreview teamName={item.teamName} logoUrl={item.logoUrl} className={isCompact ? 'h-11 w-11' : 'h-16 w-16'} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-white">{item.teamName}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${originClass[item.origin]}`}>
              {originLabel[item.origin]}
            </span>
            {item.duplicateNames && item.duplicateNames.length > 0 ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
                Duplicado
              </span>
            ) : null}
          </div>
          <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{item.teamSlug}</p>
          {item.duplicateNames && item.duplicateNames.length > 0 ? (
            <p className="mt-1 text-xs text-amber-100/80">
              Também aparece como: {item.duplicateNames.join(', ')}
            </p>
          ) : null}
          {isCompact ? (
            <p className="mt-1 text-xs text-slate-500">
              {item.origin === 'custom' ? 'Escudo salvo no Supabase' : 'Sem escudo personalizado salvo'}
            </p>
          ) : null}
        </div>
      </div>

      <div className={isCompact ? 'flex flex-wrap gap-2 sm:justify-end' : 'mt-4 flex flex-wrap gap-2'}>
        <label
          className={
            isCompact
              ? 'inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60'
              : 'inline-flex cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-emerald-400/35 hover:bg-white/[0.08] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60'
          }
          title={item.origin === 'custom' ? 'Substituir escudo' : 'Enviar escudo'}
          aria-label={item.origin === 'custom' ? 'Substituir escudo' : 'Enviar escudo'}
        >
          {isCompact ? (
            isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : item.origin === 'custom' ? <RefreshCw className="h-4 w-4" /> : <Upload className="h-4 w-4" />
          ) : (
            isUploading ? 'Enviando...' : item.origin === 'custom' ? 'Substituir' : 'Enviar escudo'
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={isBusy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }

              await onUpload(item.teamName, file);
              event.currentTarget.value = '';
            }}
          />
        </label>

        {onRemove && item.origin === 'custom' ? (
          <button
            type="button"
            onClick={() => onRemove(item)}
            disabled={isBusy}
            className={
              isCompact
                ? 'inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-red-300/15 bg-red-500/10 text-red-100 transition hover:border-red-300/30 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60'
                : 'inline-flex items-center justify-center rounded-2xl border border-red-300/15 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:border-red-300/30 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60'
            }
            title="Remover escudo personalizado"
            aria-label="Remover escudo personalizado"
          >
            {isCompact ? <Trash2 className={isRemoving ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} /> : isRemoving ? 'Removendo...' : 'Remover'}
          </button>
        ) : null}
      </div>
    </article>
  );
}
