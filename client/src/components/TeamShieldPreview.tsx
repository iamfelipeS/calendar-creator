import { normalizeTeamSlug } from '@/lib/calendar-supabase';

interface TeamShieldPreviewProps {
  teamName: string;
  logoUrl?: string;
  className?: string;
}

export default function TeamShieldPreview({ teamName, logoUrl, className = 'h-12 w-12' }: TeamShieldPreviewProps) {
  const placeholder = normalizeTeamSlug(teamName).slice(0, 3) || 'SEM';

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-950/90 ${className}`}>
      {logoUrl ? (
        <img src={logoUrl} alt={teamName} className="h-[84%] w-[84%] object-contain" />
      ) : (
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{placeholder}</span>
      )}
    </div>
  );
}
