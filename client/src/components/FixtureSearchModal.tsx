import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { calendarMonths, monthNumber, type ImportMode } from '@/lib/fixture-import';
import type { ConsolidatedFixture, FixtureQuery, FixtureSearchResult } from '../../../supabase/functions/_shared/contracts';

const statusLabels = { confirmed: 'Confirmado', base_date: 'Data-base', conditional: 'Condicional', conflict: 'Divergência' };
const confidenceLabels = { high: 'Alta', medium: 'Média', low: 'Baixa' };
const style = 'rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white';
interface Props {
  open: boolean;
  onClose: () => void;
  month: string;
  year: string;
  hasMatches: boolean;
  onImport: (fixtures: ConsolidatedFixture[], period: FixtureQuery, mode: ImportMode) => void;
}
export default function FixtureSearchModal({ open, onClose, month, year, hasMatches, onImport }: Props) {
  const [searchMonth, setSearchMonth] = useState(monthNumber(month) || 1);
  const [searchYear, setSearchYear] = useState(year);
  const [result, setResult] = useState<FixtureSearchResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    if (open) {
      setSearchMonth(monthNumber(month) || 1); setSearchYear(year);
      setResult(null); setSelected(new Set()); setError(null); setConfirmImport(false); setLoading(false);
    }
    return () => { generation.current++; controller.current?.abort(); };
  }, [open]);

  const search = async () => {
    const numericYear = Number(searchYear);
    if (!Number.isInteger(numericYear) || numericYear < 2020 || numericYear > 2100) { setError('Informe um ano entre 2020 e 2100.'); return; }
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const requestGeneration = ++generation.current;
    setLoading(true); setError(null); setResult(null); setConfirmImport(false);
    const timer = setTimeout(() => abort.abort(), 60000);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('sync-palmeiras-fixtures', {
        body: { month: searchMonth, year: numericYear }, signal: abort.signal,
      });
      if (invokeError || !data || !Array.isArray(data.fixtures) || !Array.isArray(data.sourceErrors) ||
        data.month !== searchMonth || data.year !== numericYear) throw new Error();
      if (requestGeneration !== generation.current) return;
      setResult(data);
      setSelected(new Set((data as FixtureSearchResult).fixtures.filter(f => ['confirmed', 'base_date'].includes(f.status) &&
        f.date.startsWith(`${numericYear}-${String(searchMonth).padStart(2, '0')}-`)).map(f => f.id)));
    } catch {
      if (requestGeneration === generation.current) setError('Não foi possível buscar os jogos. Confira se a função sync-palmeiras-fixtures está publicada e tente novamente.');
    } finally {
      clearTimeout(timer);
      if (requestGeneration === generation.current) setLoading(false);
    }
  };
  const chosen = result?.fixtures.filter(f => selected.has(f.id)) || [];
  const samePeriod = !!result && monthNumber(month) === result.month && Number(year) === result.year;
  const finish = (mode: ImportMode) => {
    if (!result || !chosen.length) return;
    try { onImport(chosen, { month: result.month, year: result.year }, mode); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível importar.'); }
  };
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto border-white/15 bg-slate-900 text-white sm:max-w-3xl">
      <DialogTitle>Buscar jogos automaticamente</DialogTitle>
      <DialogDescription className="text-slate-300">Confira datas e fontes antes de importar. A busca não salva nem publica o calendário.</DialogDescription>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Mês<select className={style} value={searchMonth} disabled={loading} onChange={e => { setSearchMonth(Number(e.target.value)); setResult(null); setConfirmImport(false); }}>
          {calendarMonths.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">Ano<input type="number" min="2020" max="2100" className={`${style} w-28`} value={searchYear} disabled={loading}
          onChange={e => { setSearchYear(e.target.value); setResult(null); setConfirmImport(false); }} /></label>
        <button type="button" className={`${style} bg-emerald-600 disabled:opacity-50`} disabled={loading} onClick={search}>{loading ? 'Consultando fontes…' : 'Buscar jogos'}</button>
      </div>
      {loading && <p role="status" className="text-sm text-slate-300">Consultando fontes oficiais e secundárias. Isso pode levar alguns segundos.</p>}
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      {result && <>
        <div className="text-xs text-slate-300">{calendarMonths[result.month - 1]} / {result.year} · Datas em Brasília · Consulta: {new Date(result.fetchedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-300">{Object.entries(result.sourceCounts).map(([source, count]) => <span key={source}>{source}: {count} jogos</span>)}</div>
        {!!result.sourceErrors.length && <div role="status" className="space-y-1 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
          <p className="font-semibold">Cobertura parcial — confira as fontes antes de importar.</p>
          {result.sourceErrors.map((issue, i) => <p key={i}>{issue.source}: {issue.message}</p>)}
        </div>}
        {!result.fixtures.length && <p className="text-sm text-slate-300">Nenhum jogo encontrado nas fontes disponíveis. Isso não comprova que não há partidas neste mês.</p>}
        <div className="space-y-3">{result.fixtures.map(fixture => {
          const outside = !fixture.date.startsWith(`${result.year}-${String(result.month).padStart(2, '0')}-`);
          return <article key={fixture.id} className={`rounded-xl border p-3 ${fixture.status === 'confirmed' ? 'border-emerald-400/30' : 'border-amber-400/30 bg-amber-400/5'}`}>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" checked={selected.has(fixture.id)} disabled={outside} onChange={e => {
                setConfirmImport(false); setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(fixture.id); else next.delete(fixture.id); return next; });
              }} />
              <span><span className="font-semibold">{fixture.date.split('-').reverse().join('/')} · {fixture.kickoffTime || 'A definir'} · {fixture.homeTeam} x {fixture.awayTeam}</span>
                <span className="mt-1 block text-sm text-slate-300">{fixture.competition} · {statusLabels[fixture.status]} · Confiança {confidenceLabels[fixture.confidence].toLowerCase()}</span></span>
            </label>
            {fixture.note && <p className="mt-2 text-sm text-amber-200">{fixture.note}</p>}
            {outside && <p className="mt-2 text-sm text-rose-200">Data prioritária fora do mês consultado. Consulte esse mês para importar.</p>}
            <ul className="mt-2 space-y-1 text-xs text-slate-300">{fixture.sources.map((source, i) => <li key={i}>
              <a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.source}</a>: {source.date.split('-').reverse().join('/')} · {source.kickoffTime || 'A definir'} {source.confirmed ? '(data detalhada)' : '(sem confirmação detalhada)'}
            </li>)}</ul>
          </article>;
        })}</div>
        {chosen.some(f => f.status !== 'confirmed') && <p className="text-sm text-amber-200">Há jogos com data-base, divergência ou participação condicional selecionados. Revise-os antes de importar.</p>}
        {confirmImport ? <div className="space-y-3 rounded-xl border border-white/15 p-3">
          <p className="text-sm">O calendário já possui partidas. Como deseja importar?</p>
          {!samePeriod && <p className="text-xs text-amber-200">O mês consultado é diferente do calendário atual. Substituir também altera mês e ano; adicionar está indisponível.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={style} onClick={() => finish('replace')}>Substituir partidas atuais</button>
            <button type="button" className={`${style} disabled:opacity-40`} disabled={!samePeriod} onClick={() => finish('append')}>Adicionar aos jogos existentes</button>
            <button type="button" className={style} onClick={() => setConfirmImport(false)}>Cancelar</button>
          </div>
        </div> : <button type="button" className={`${style} bg-emerald-600 disabled:opacity-40`} disabled={!chosen.length}
          onClick={() => { if (hasMatches) setConfirmImport(true); else finish('replace'); }}>Importar selecionados ({chosen.length})</button>}
      </>}
    </DialogContent>
  </Dialog>;
}
