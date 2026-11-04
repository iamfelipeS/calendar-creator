// The validator invokes the same discovery-first orchestration as the Edge Function.
import { renderReport, validateAllSources, type ValidationReport } from './fixture-live-validation.ts';

if (import.meta.main) {
  let report: ValidationReport;
  try {
    report = await validateAllSources(fetch, Deno.env.get('CONMEBOL_FIXTURES_URL')?.trim() || undefined);
  } catch {
    report = { generatedAt: new Date().toISOString(), execution: 'live', months: [], criticalErrors: ['Erro de código impediu executar o validador.'] };
  }
  const markdown = renderReport(report);
  await Deno.mkdir('artifacts', { recursive: true });
  await Deno.writeTextFile('artifacts/fixture-live-validation.md', markdown);
  await Deno.writeTextFile('artifacts/fixture-live-validation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(markdown);
  if (report.criticalErrors.length) Deno.exitCode = 1;
}
