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

export const teamLogos: Record<string, string> = {
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
