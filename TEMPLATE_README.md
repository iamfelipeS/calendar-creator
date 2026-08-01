# Calendar Creator

Ferramenta para criar, salvar e exportar calendários visuais de partidas. Este repositório inclui um template demonstrativo do Palmeiras pronto para Instagram Stories e Feed.

## 📋 Características

- **Formato Instagram**: 1080x1350 (4:5) - Perfeito para Stories e Feed
- **Design Premium**: Verde escuro elegante com tipografia sofisticada
- **Editável**: Fácil de customizar mês, ano e partidas
- **Marca d'água**: @meupalestra.1914 integrada com baixa opacidade
- **Dias de Partida Destacados**: Amarelo vibrante com espaço para logos dos times
- **Responsivo**: Renderiza perfeitamente em qualquer resolução
- **Tipografia Elegante**: Playfair Display (títulos) + Lato (corpo)

## 🎨 Design Highlights

- **Paleta de Cores**: Verde escuro (#065f2e) com acentos brancos e amarelo
- **Fundo**: Gradiente verde com textura sutil
- **Espaçamento**: Profissional e generoso
- **Logo**: Círculo branco com "P" (Palmeiras)
- **Header**: Mês e ano em tipografia elegante
- **Grid**: 7 colunas (DOM, SEG, TER, QUA, QUI, SEX, SÁB)
- **Dias com Partidas**: Destacados em amarelo com indicadores H × A para logos
- **Footer**: Branding "CALENDÁRIO OFICIAL • PALMEIRAS"

## 📁 Arquivos Inclusos

### Arquivos Principais

- **`calendar-template.html`** - Template HTML standalone
  - Contém toda a estrutura, CSS e JavaScript
  - Pode ser aberto diretamente no navegador
  - Função `window.updateCalendar()` para customização

- **`render_to_png.mjs`** - Script Node.js para renderizar PNG
  - Usa Puppeteer para captura de screenshot
  - Suporta customização de mês, ano e partidas
  - Gera PNG de alta qualidade (1080x1350)

- **`calendar_abril_2026_full.png`** - Exemplo de calendário renderizado
  - Abril de 2026 com 5 partidas de exemplo
  - Pronto para usar no Instagram

### Arquivos React (Projeto Web)

- **`client/src/components/PalmeirasCalendar.tsx`** - Componente React
- **`client/src/pages/Home.tsx`** - Página principal
- **`client/src/index.css`** - Estilos globais

## 🚀 Como Usar

### Opção 1: Usar o HTML Standalone

1. Abra `calendar-template.html` em um navegador
2. Para customizar, use a função JavaScript:

```javascript
window.updateCalendar('MAIO', '2026', 31, 4, [
    { day: 3, homeTeam: 'Palmeiras', awayTeam: 'Flamengo' },
    { day: 10, homeTeam: 'São Paulo', awayTeam: 'Palmeiras' },
    { day: 17, homeTeam: 'Palmeiras', awayTeam: 'Corinthians' },
]);
```

Parâmetros:
- `month` (string): Nome do mês (ex: "MAIO", "JUNHO")
- `year` (string): Ano (ex: "2026")
- `daysInMonth` (number): Número de dias no mês
- `firstDayOfWeek` (number): Primeiro dia da semana (0=Dom, 1=Seg, 2=Ter, etc.)
- `matches` (array): Array de partidas com `{ day, homeTeam, awayTeam }`

### Opção 2: Renderizar como PNG

```bash
# Renderizar calendário de Abril 2026
node render_to_png.mjs calendar_abril_2026.png ABRIL 2026

# Renderizar calendário de Maio 2026
node render_to_png.mjs calendar_maio_2026.png MAIO 2026

# Renderizar calendário de Junho 2026
node render_to_png.mjs calendar_junho_2026.png JUNHO 2026
```

### Opção 3: Usar o Componente React

```tsx
import PalmeirasCalendar from '@/components/PalmeirasCalendar';

export default function MyPage() {
  return (
    <PalmeirasCalendar month="ABRIL" year="2026" />
  );
}
```

## 📅 Configuração de Partidas

Para adicionar partidas ao calendário, edite o array `matches` no HTML ou passe como parâmetro:

```javascript
const matches = [
    { day: 2, homeTeam: 'Palmeiras', awayTeam: 'Corinthians' },
    { day: 7, homeTeam: 'São Paulo', awayTeam: 'Palmeiras' },
    { day: 12, homeTeam: 'Palmeiras', awayTeam: 'Flamengo' },
    { day: 18, homeTeam: 'Botafogo', awayTeam: 'Palmeiras' },
    { day: 25, homeTeam: 'Palmeiras', awayTeam: 'Grêmio' },
];
```

Os dias com partidas serão automaticamente destacados em amarelo com espaço para logos dos times.

## 🎯 Customizações Recomendadas

### Adicionar Logos dos Times

1. Obtenha as URLs dos logos dos times
2. Modifique o HTML para adicionar `homeLogoUrl` e `awayLogoUrl` aos matches:

```javascript
{ 
    day: 5, 
    homeTeam: 'Palmeiras', 
    awayTeam: 'Corinthians',
    homeLogoUrl: 'https://example.com/palmeiras-logo.png',
    awayLogoUrl: 'https://example.com/corinthians-logo.png'
}
```

3. Atualize o HTML para renderizar as imagens:

```html
${match.homeLogoUrl ? 
    `<img src="${match.homeLogoUrl}" alt="${match.homeTeam}" class="team-logo">` :
    '<div class="team-logo">H</div>'
}
```

### Alterar Cores

Edite as variáveis CSS no HTML:

```css
:root {
    --primary-green: #065f2e;      /* Verde principal */
    --accent-yellow: #fcd34d;      /* Amarelo dos dias de partida */
    --text-white: #ffffff;         /* Branco do texto */
}
```

### Mudar Tipografia

Altere as fontes Google no `<head>`:

```html
<link href="https://fonts.googleapis.com/css2?family=YourFont:wght@400;700&display=swap" rel="stylesheet">
```

## 📱 Uso no Instagram

1. **Stories**: Copie a imagem PNG e poste como Story
2. **Feed**: Poste a imagem PNG no feed com legenda
3. **Reels**: Use como background para criar reels
4. **Highlights**: Salve em highlights para referência

## 🔧 Requisitos Técnicos

### Para Renderizar PNG:
- Node.js 16+
- Puppeteer (instalado via `pnpm add -D puppeteer`)
- Chrome/Chromium (instalado via `npx puppeteer browsers install chrome`)

### Para Usar o HTML:
- Qualquer navegador moderno (Chrome, Firefox, Safari, Edge)

### Para Usar o Componente React:
- React 19+
- Tailwind CSS 4+

## 📊 Estrutura de Dados

### Objeto Match

```typescript
interface Match {
    day: number;              // Dia do mês (1-31)
    homeTeam?: string;        // Nome do time mandante
    awayTeam?: string;        // Nome do time visitante
    homeLogoUrl?: string;     // URL do logo do time mandante
    awayLogoUrl?: string;     // URL do logo do time visitante
}
```

### Configuração do Calendário

```typescript
interface CalendarConfig {
    daysInMonth: number;      // Número de dias no mês
    firstDayOfWeek: number;   // Primeiro dia da semana (0-6)
    matches: Match[];         // Array de partidas
}
```

## 💡 Dicas de Uso

1. **Planejamento**: Crie calendários para todos os meses no início da temporada
2. **Consistência**: Use sempre as mesmas cores e fontes
3. **Atualização**: Atualize as partidas conforme o calendário oficial é divulgado
4. **Backup**: Guarde os arquivos PNG em pasta separada para referência
5. **Logos**: Use logos dos times em alta resolução para melhor qualidade

## 🎓 Exemplos de Uso

### Exemplo 1: Calendário Simples

```bash
node render_to_png.mjs calendario_junho.png JUNHO 2026
```

### Exemplo 2: Calendário com Partidas Específicas

Edite o arquivo `render_to_png.mjs` e modifique o array `matches`:

```javascript
const matches = [
    { day: 1, homeTeam: 'Palmeiras', awayTeam: 'Atlético-MG' },
    { day: 8, homeTeam: 'Cruzeiro', awayTeam: 'Palmeiras' },
    { day: 15, homeTeam: 'Palmeiras', awayTeam: 'Vasco' },
];
```

Depois execute:

```bash
node render_to_png.mjs calendario_junho_custom.png JUNHO 2026
```

## 📝 Notas

- O template é totalmente editável e pode ser customizado conforme necessário
- A marca d'água @meupalestra.1914 pode ser alterada no HTML
- O logo "P" pode ser substituído por outro logo ou imagem
- As cores podem ser ajustadas via CSS
- A tipografia pode ser mudada via Google Fonts

## 🤝 Suporte

Para dúvidas ou sugestões sobre o template, entre em contato com o desenvolvedor.

---

**Desenvolvido para criar calendários visuais de partidas**

Versão: 1.0.0  
Última atualização: Abril 2026
