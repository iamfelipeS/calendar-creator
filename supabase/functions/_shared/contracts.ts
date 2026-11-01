export type FixtureSource = 'CBF' | 'CONMEBOL' | 'Palmeiras' | 'ESPN';
export type Competition = 'Brasileirão' | 'Copa do Brasil' | 'Libertadores';
export type FixtureStatus = 'confirmed' | 'base_date' | 'conditional' | 'conflict';
export type Confidence = 'high' | 'medium' | 'low';
export interface FixtureQuery { month: number; year: number }
export interface SourceFixture {
  source: FixtureSource;
  sourceId: string;
  url: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  competition: Competition;
  round?: string;
  leg?: string;
  confirmed: boolean;
  conditional: boolean;
  note?: string;
}
export interface ConsolidatedFixture {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  competition: Competition;
  status: FixtureStatus;
  confidence: Confidence;
  sources: SourceFixture[];
  note: string | null;
}
export interface SourceError { source: FixtureSource; message: string }
export interface SourceResult { source: FixtureSource; fixtures: SourceFixture[]; warnings: string[] }
export interface FixtureSearchResult extends FixtureQuery {
  fixtures: ConsolidatedFixture[];
  sourceErrors: SourceError[];
  sourceCounts: Partial<Record<FixtureSource, number>>;
  fetchedAt: string;
  timezone: 'America/Sao_Paulo';
}
