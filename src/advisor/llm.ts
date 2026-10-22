// Optional: let a Claude model interpret the player's orders. The model only *proposes* actions
// from a fixed schema; every proposal is then validated by the game's own rules (previewAction),
// so it cannot invent resources, armies or treaties. Without an API key the rule-based council
// in game/advisor.ts is used, and the game is fully playable.
import type Anthropic from '@anthropic-ai/sdk';
import { BUILDINGS } from '../data/buildings';
import { LAWS } from '../data/laws';
import type { GameAction } from '../game/actions';
import { interpretCommand, matchCountries, matchProvince, planFromActions, type CommandPlan } from '../game/advisor';
import { buildBlocker } from '../game/construction';
import { SPY_OPS } from '../game/espionage';
import { lawBlocker } from '../game/society';
import { alliesOf, armiesOf, armyRegiments, atWar, def, neighbourCountries, opinion, provinceName, provincesOf, sideOf, warsOf } from '../game/state';
import { availableTechs } from '../game/tech';
import { casusBelli, emptyTerms, powerScore } from '../game/war';
import type { LawCategory, MinisterRole, WorldState } from '../game/types';

export const LLM_MODEL = 'claude-opus-5-5';
const PREF_KEY = 'totw1800:pref:llm';

export interface LlmSettings { enabled: boolean; apiKey: string }

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return { enabled: false, apiKey: '', ...(JSON.parse(raw) as Partial<LlmSettings>) };
  } catch { /* storage unavailable */ }
  return { enabled: false, apiKey: '' };
}

export function saveLlmSettings(s: LlmSettings): void {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function llmActive(): boolean {
  const s = loadLlmSettings();
  return s.enabled && s.apiKey.trim().length > 20;
}

const ACTION_TYPES = ['setTax', 'setTariff', 'setBudget', 'takeLoan', 'build', 'recruit', 'buildShips', 'moveArmy', 'research', 'enactLaw', 'diplomacy', 'declareWar', 'whitePeace', 'spyFocus', 'spyOp', 'court'] as const;
const DIPLO_KINDS = ['alliance', 'trade', 'marriage', 'guarantee', 'nap', 'access', 'tribute_demand', 'offer_tribute', 'insult', 'envoy', 'recall_envoy', 'break_alliance', 'subsidy', 'stop_subsidy', 'break_trade'];
const COURT_KINDS = ['anticorruption', 'festival', 'appoint', 'designateHeir', 'newGeneral'];
const ROLES: MinisterRole[] = ['finance', 'foreign', 'military', 'admin', 'intelligence'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'minister', 'actions'],
  properties: {
    reply: { type: 'string', description: 'One to three sentences spoken by the responsible minister to the ruler, in period voice. Explain what you propose, or why it cannot be done.' },
    minister: { type: 'string', enum: ROLES },
    actions: {
      type: 'array',
      description: 'At most 8 concrete actions. Empty if the order cannot be carried out with the listed options.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type'],
        properties: {
          type: { type: 'string', enum: [...ACTION_TYPES] },
          province: { type: 'string', description: 'Province id from the context' },
          building: { type: 'string', enum: BUILDINGS.map((b) => b.id) },
          unit: { type: 'string', enum: ['infantry', 'cavalry', 'artillery', 'irregulars'] },
          ship: { type: 'string', enum: ['line', 'frigate', 'transport'] },
          count: { type: 'integer' },
          target: { type: 'string', description: 'Country id (diplomacy, war, espionage) or province id (moveArmy)' },
          kind: { type: 'string', enum: DIPLO_KINDS },
          amount: { type: 'number', description: '£ thousands' },
          value: { type: 'number', description: 'Rate as a fraction, e.g. 0.12 for 12%' },
          tech: { type: 'string', description: 'Technology id from the context' },
          category: { type: 'string', enum: LAWS.map((l) => l.id) },
          option: { type: 'string', description: 'Law option id from the context' },
          army: { type: 'string', description: 'Army id from the context' },
          op: { type: 'string', enum: Object.keys(SPY_OPS) },
          court: { type: 'string', enum: COURT_KINDS },
          role: { type: 'string', enum: ROLES },
          budget: { type: 'string', enum: ['research', 'espionage', 'administration'] },
          optional: { type: 'boolean', description: 'True for a suggested extra the ruler may skip' },
        },
      },
    },
  },
} as const;

interface RawAction {
  type: (typeof ACTION_TYPES)[number];
  province?: string; building?: string; unit?: string; ship?: string; count?: number; target?: string; kind?: string; amount?: number;
  value?: number; tech?: string; category?: string; option?: string; army?: string; op?: string; court?: string; role?: string; budget?: string; optional?: boolean;
}

function gameContext(w: WorldState, c: string): string {
  const country = w.countries[c];
  const provs = provincesOf(w, c).filter((id) => w.provinces[id].controller === c).sort((a, b) => w.provinces[b].pop - w.provinces[a].pop).slice(0, 40);
  const others = new Set<string>([...neighbourCountries(w, c), ...alliesOf(w, c), ...country.rivals, ...warsOf(w, c).flatMap((x) => [...x.attackers, ...x.defenders])]);
  for (const x of Object.values(w.countries).filter((x) => x.alive).sort((a, b) => powerScore(w, b.id) - powerScore(w, a.id)).slice(0, 12)) others.add(x.id);
  others.delete(c);
  const laws: Record<string, string[]> = {};
  for (const cat of LAWS) laws[cat.id] = cat.options.filter((o) => !lawBlocker(w, c, cat.id as LawCategory, o.id)).map((o) => o.id);
  return JSON.stringify({
    date: `${1800 + Math.floor(w.turn / 12)}-${String((w.turn % 12) + 1).padStart(2, '0')}`,
    realm: { id: c, name: def(c).name, government: def(c).government, treasury_k: Math.round(country.treasury), income_k: Math.round(country.last.income), expenses_k: Math.round(country.last.expenses), tax_rate: country.taxRate, tariff: country.tariff, stability: Math.round(country.stability), legitimacy: Math.round(country.legitimacy), corruption: Math.round(country.corruption), manpower_k: Math.round(country.manpower), capital: country.capital, research: country.research.tech, laws: country.laws },
    provinces: provs.map((id) => ({ id, name: provinceName(id), pop_k: Math.round(w.provinces[id].pop), unrest: Math.round(w.provinces[id].unrest), buildings: w.provinces[id].buildings, can_build: BUILDINGS.filter((b) => !buildBlocker(w, c, id, b.id)).map((b) => b.id) })),
    armies: armiesOf(w, c).map((a) => ({ id: a.id, name: a.name, at: a.location, regiments: Math.round(armyRegiments(a) * 10) / 10, status: a.status })),
    countries: [...others].map((o) => ({ id: o, name: def(o).name, opinion: Math.round(opinion(w, c, o)), at_war: atWar(w, c, o), ally: alliesOf(w, c).includes(o), rival: country.rivals.includes(o), power: Math.round(powerScore(w, o)), casus_belli: casusBelli(w, c, o).map((x) => x.type) })),
    wars: warsOf(w, c).map((x) => ({ id: x.id, name: x.name, our_side_score: Math.round(sideOf(x, c) === 'attackers' ? x.score : -x.score), enemies: sideOf(x, c) === 'attackers' ? x.defenders : x.attackers })),
    technologies_available: availableTechs(w, c).slice(0, 30).map((t) => ({ id: t.id, name: t.name, category: t.category })),
    law_options_available: laws,
  });
}

const SYSTEM = `You are the royal council of a polity in a grand-strategy game set in 1800. The ruler gives orders in plain language. Translate each order into concrete game actions using only the action schema and only ids that appear in the context (province, country, army, technology and law ids). Do not invent resources, units, treaties or ids, and do not assume an action succeeds: the game validates every action and reports costs. Prefer a few well-chosen actions (at most 8). When an order cannot be carried out with the available options, return no actions and explain why in the reply. Choose the minister whose portfolio fits: finance (taxes, loans, budget), foreign (diplomacy), military (armies, navy, war), admin (construction, laws, research, order), intelligence (espionage).`;

function toAction(w: WorldState, c: string, r: RawAction): GameAction | string {
  const province = r.province && w.provinces[r.province] ? r.province : r.province ? matchProvince(r.province) ?? r.province : w.countries[c].capital;
  const country = r.target && w.countries[r.target] ? r.target : r.target ? matchCountries(w, r.target, c)[0] : undefined;
  switch (r.type) {
    case 'setTax': return { type: 'setTax', value: r.value ?? w.countries[c].taxRate };
    case 'setTariff': return { type: 'setTariff', value: r.value ?? w.countries[c].tariff };
    case 'setBudget': return r.budget ? { type: 'setBudget', [r.budget]: Math.max(0, Math.min(2, r.value ?? 1)) } : 'No budget line named.';
    case 'takeLoan': return { type: 'takeLoan', amount: Math.round(r.amount ?? 0) };
    case 'build': return r.building ? { type: 'build', province, building: r.building as never } : 'No building named.';
    case 'recruit': return { type: 'recruit', province, unit: (r.unit ?? 'infantry') as never, count: Math.max(1, Math.min(30, r.count ?? 1)) };
    case 'buildShips': return { type: 'buildShips', province, ship: (r.ship ?? 'frigate') as never, count: Math.max(1, Math.min(20, r.count ?? 1)) };
    case 'moveArmy': {
      const target = r.target && w.provinces[r.target] ? r.target : r.target ? matchProvince(r.target) : null;
      return r.army && target ? { type: 'moveArmy', army: r.army, target } : 'Unknown army or destination.';
    }
    case 'research': return r.tech ? { type: 'research', tech: r.tech } : 'No technology named.';
    case 'enactLaw': return r.category && r.option ? { type: 'enactLaw', category: r.category as LawCategory, option: r.option } : 'No law named.';
    case 'diplomacy': return country && r.kind ? { type: 'diplomacy', kind: r.kind as never, target: country, amount: r.amount } : 'Unknown country.';
    case 'declareWar': {
      if (!country) return 'Unknown country.';
      const cb = casusBelli(w, c, country).sort((a, b) => a.infamy - b.infamy).find((x) => x.type !== 'none') ?? casusBelli(w, c, country)[0];
      return cb ? { type: 'declareWar', target: country, cb: cb.type } : 'No grounds for war.';
    }
    case 'whitePeace': {
      const war = warsOf(w, c).find((x) => !country || x.attackers.includes(country) || x.defenders.includes(country));
      return war ? { type: 'proposePeace', war: war.id, terms: emptyTerms(), mode: 'offer' } : 'We are not at war.';
    }
    case 'spyFocus': return country ? { type: 'spyFocus', target: country, on: true } : 'Unknown country.';
    case 'spyOp': return country && r.op ? { type: 'spyOp', target: country, op: r.op as never } : 'Unknown target.';
    case 'court': {
      const kind = (r.court ?? 'festival') as 'anticorruption' | 'festival' | 'appoint' | 'designateHeir' | 'newGeneral';
      const army = kind === 'newGeneral' ? (r.army ?? armiesOf(w, c).find((a) => !a.general)?.id) : undefined;
      return { type: 'court', kind, role: r.role as MinisterRole | undefined, army };
    }
  }
  return 'Unknown action.';
}

export type LlmResult = { ok: true; plan: CommandPlan } | { ok: false; error: string; fallback: CommandPlan };

/** Asks the model to interpret an order; on any failure returns the rule-based plan as a fallback. */
export async function interpretWithClaude(w: WorldState, c: string, text: string): Promise<LlmResult> {
  const settings = loadLlmSettings();
  const fallback = () => interpretCommand(w, c, text);
  if (!settings.enabled || !settings.apiKey.trim()) return { ok: false, error: 'The AI council is not configured.', fallback: fallback() };
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk');
  // The player supplies their own key; requests go straight from this browser to the Claude API.
  const client = new AnthropicSDK({ apiKey: settings.apiKey.trim(), dangerouslyAllowBrowser: true });
  try {
    const response = await client.beta.messages.create({
      model: LLM_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
      messages: [{ role: 'user', content: `Game state:\n${gameContext(w, c)}\n\nThe ruler's order: ${text}` }],
    });
    if (response.stop_reason === 'refusal') return { ok: false, error: 'The AI council declined this order.', fallback: fallback() };
    if (response.stop_reason === 'max_tokens') return { ok: false, error: 'The AI council ran out of room to answer.', fallback: fallback() };
    const textBlock = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
    if (!textBlock) return { ok: false, error: 'The AI council gave no answer.', fallback: fallback() };
    let parsed: { reply: string; minister: MinisterRole; actions: RawAction[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return { ok: false, error: 'The AI council answered in an unreadable form.', fallback: fallback() };
    }
    const notes: string[] = [];
    const actions: { action: GameAction; optional?: boolean }[] = [];
    for (const raw of (parsed.actions ?? []).slice(0, 8)) {
      const a = toAction(w, c, raw);
      if (typeof a === 'string') notes.push(`Skipped a proposal: ${a}`);
      else actions.push({ action: a, optional: raw.optional });
    }
    notes.push(`Interpreted by ${LLM_MODEL}; every step is checked by the game's rules.`);
    const minister = ROLES.includes(parsed.minister) ? parsed.minister : 'admin';
    return { ok: true, plan: planFromActions(w, c, text, { title: 'Council deliberation', minister, reply: parsed.reply, notes }, actions) };
  } catch (err) {
    const { default: SDK } = await import('@anthropic-ai/sdk');
    let message = 'The AI council could not be reached.';
    if (err instanceof SDK.AuthenticationError) message = 'The API key was rejected.';
    else if (err instanceof SDK.PermissionDeniedError) message = 'This API key may not use that model.';
    else if (err instanceof SDK.RateLimitError) message = 'The AI council is rate-limited; try again shortly.';
    else if (err instanceof SDK.BadRequestError) message = `The request was rejected: ${err.message}`;
    else if (err instanceof SDK.APIError) message = `The Claude API returned an error (${err.status ?? 'network'}).`;
    console.warn(err);
    return { ok: false, error: message, fallback: fallback() };
  }
}
