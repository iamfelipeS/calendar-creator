export const normalizeTeamSlug = (teamName: string) => teamName.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ').trim().toUpperCase();
