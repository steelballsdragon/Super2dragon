import { X } from 'lucide-react';
import { ChroniclesPanel } from '../../panels/ChroniclesPanel';
import { ConstructionPanel } from '../../panels/ConstructionPanel';
import { CourtPanel } from '../../panels/CourtPanel';
import { DeveloperPanel } from '../../panels/DeveloperPanel';
import { DiplomacyPanel } from '../../panels/DiplomacyPanel';
import { EconomyPanel } from '../../panels/EconomyPanel';
import { EspionagePanel } from '../../panels/EspionagePanel';
import { LawsPanel } from '../../panels/LawsPanel';
import { MilitaryPanel } from '../../panels/MilitaryPanel';
import { OverviewPanel } from '../../panels/OverviewPanel';
import { ReportsPanel } from '../../panels/ReportsPanel';
import { TechnologyPanel } from '../../panels/TechnologyPanel';
import { TradePanel } from '../../panels/TradePanel';
import { useGame, type PanelId } from '../../store/game';
import { PANELS } from './NavRail';

const VIEWS: Record<PanelId, () => React.ReactElement> = {
  overview: OverviewPanel, court: CourtPanel, economy: EconomyPanel, construction: ConstructionPanel, military: MilitaryPanel,
  diplomacy: DiplomacyPanel, technology: TechnologyPanel, espionage: EspionagePanel, trade: TradePanel, laws: LawsPanel,
  chronicles: ChroniclesPanel, reports: ReportsPanel, developer: DeveloperPanel,
};

export function PanelHost() {
  const { panel, openPanel } = useGame();
  if (!panel) return null;
  const meta = PANELS.find((p) => p.id === panel)!;
  const View = VIEWS[panel];
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-navy sm:inset-y-0 sm:left-0 sm:right-auto sm:w-[min(480px,calc(100%-24px))] sm:border-r sm:border-gold/25 sm:shadow-[12px_0_30px_rgba(0,0,0,0.45)] animate-fade-in" onPointerDown={(e) => e.stopPropagation()} role="region" aria-label={meta.label}>
      <div className="flex items-center gap-2 border-b border-gold/20 bg-gradient-to-r from-navy-2 to-navy px-4 py-2.5">
        <meta.icon size={17} className="text-gold" />
        <h2 className="font-display text-[14px] uppercase tracking-[0.16em] text-gold-bright">{meta.label}</h2>
        <button className="btn btn-quiet ml-auto !min-h-0 !p-1" onClick={() => openPanel(null)} aria-label="Close panel"><X size={17} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 scroll-thin"><View /></div>
    </div>
  );
}
