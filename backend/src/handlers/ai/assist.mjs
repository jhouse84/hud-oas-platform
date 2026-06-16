import { ok, badRequest, parseBody, wrap, HttpError } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

/**
 * AI assist — the platform's secured, server-side Claude injection point.
 *
 * The browser never holds the model key. Admin-gated. One reusable endpoint
 * (POST /ai/assist) dispatches by `task`; the first task, `classify`, resolves
 * the bulk importer's ambiguous tail — files the deterministic rule engine
 * left "Unsorted" — into the canonical data-room taxonomy, with a reason and a
 * confidence per file. Built so later AI tasks (pool suggestions, asset
 * summaries, BIP drafting) reuse the same secured proxy.
 *
 * Key comes from ANTHROPIC_API_KEY (Lambda env). Model from AI_MODEL.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6';

// The canonical taxonomy, kept in lockstep with shared/doc-classify.js.
const BIDDER_CATS = ['Bidder Information Package', 'Loan Tape', 'Asset Summaries', 'Sale Procedures', 'Forms & Agreements', 'Valuation', 'Property Reports', 'Collateral & Case Files', 'Due Diligence Files'];
const ADMIN_CATS = ['BEM & Pricing', 'Bid Day Ops', 'Pricing & Analytics', 'Results & Post-Sale', 'TS Internal', 'Borrower & Award Letters', 'Unsorted'];
const ALL_CATS = new Set([...BIDDER_CATS, ...ADMIN_CATS]);
const FHA_RE = /\d{3}-?\d{7}/;

async function callClaude({ system, messages, tools, tool_choice, max_tokens = 4096 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError('AI assist is not configured on this environment (no model key).', 503, 'AINotConfigured');
  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens, system, messages, tools, tool_choice })
    });
  } catch (e) {
    throw new HttpError('Could not reach the model endpoint.', 502, 'AIUpstream');
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('Anthropic API error', { status: res.status, body: txt.slice(0, 400) });
    throw new HttpError('The model call failed (' + res.status + ').', 502, 'AIUpstream');
  }
  return res.json();
}

function toolInput(resp, toolName) {
  const block = (resp?.content || []).find((c) => c.type === 'tool_use' && (!toolName || c.name === toolName));
  return block?.input || null;
}

// ------------------------------------------------------------------
// Task: classify — sort ambiguous file paths into the taxonomy.
// ------------------------------------------------------------------
async function classify(body) {
  const files = (body.files || [])
    .map((f) => String(f.path || f.name || '').slice(0, 400))
    .filter(Boolean)
    .slice(0, 250);
  if (!files.length) return { task: 'classify', results: [] };

  const system =
    'You sort files into a HUD loan-sale data room. Every file is classified into exactly one category and a visibility.\n\n' +
    'BIDDER-VISIBLE categories (released to qualified bidders):\n' +
    '- Bidder Information Package: the BIP / offering memo / supplements.\n' +
    '- Loan Tape: the ALD/SALD loan-level data file, stratifications, loan lists.\n' +
    '- Asset Summaries: per-asset narrative summaries.\n' +
    '- Sale Procedures: sale & bid-day procedures, bidder instructions.\n' +
    '- Forms & Agreements: blank CA/NDA, BAUF, BTAF, deposit/change forms, qualification statements, the unexecuted loan sale agreement.\n' +
    '- Valuation: BPOs, AVMs, appraisals.\n' +
    '- Property Reports: PCNA / physical needs, environmental/Phase I, engineering, rent rolls, operating/financial statements.\n' +
    '- Collateral & Case Files: notes, mortgages/deeds, titles, case files, servicing/payment history, occupancy, escrow.\n' +
    '- Due Diligence Files: general per-asset due-diligence not better described above.\n\n' +
    'ADMIN-ONLY categories (internal — never shown to bidders):\n' +
    '- BEM & Pricing: bid evaluation model, bid forms used internally.\n' +
    '- Bid Day Ops: deposits, wires, bid-day logistics.\n' +
    '- Pricing & Analytics: pricing methodology, portfolio analytics, floor prices, bid estimates.\n' +
    '- Results & Post-Sale: EXECUTED agreements/CAAs, final bid results, post-sale reports, MFNs.\n' +
    '- TS Internal: transaction-specialist internal docs — meeting minutes, project plans, marketing/ads, deliverables, surveys.\n' +
    '- Borrower & Award Letters: borrower notification / goodbye / award letters.\n' +
    '- Unsorted: use ONLY if you genuinely cannot tell. Unsorted is admin-only.\n\n' +
    'Rules: An EXECUTED agreement is Results & Post-Sale (admin), never Forms. When unsure between bidder and admin, choose admin. ' +
    'scope is "asset" if the file is about one specific loan (its name usually carries an FHA case number like 024-5777326), otherwise "sale". ' +
    'If scope is asset, set asset to the FHA case number found in the name, else null. Give a one-line reason and a confidence of high, medium, or low.';

  const tool = {
    name: 'record_classifications',
    description: 'Record the classification of every file provided, in order.',
    input_schema: {
      type: 'object',
      properties: {
        classifications: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'the file path, copied exactly from the input' },
              category: { type: 'string', enum: [...BIDDER_CATS, ...ADMIN_CATS] },
              scope: { type: 'string', enum: ['asset', 'sale'] },
              asset: { type: ['string', 'null'], description: 'FHA case number if scope is asset, else null' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              reason: { type: 'string' }
            },
            required: ['path', 'category', 'scope', 'confidence', 'reason']
          }
        }
      },
      required: ['classifications']
    }
  };

  const resp = await callClaude({
    system,
    messages: [{ role: 'user', content: 'Classify each of these files. Return one entry per file, in the same order:\n\n' + files.join('\n') }],
    tools: [tool],
    tool_choice: { type: 'tool', name: 'record_classifications' },
    max_tokens: 8192
  });

  const input = toolInput(resp, 'record_classifications');
  const raw = (input && Array.isArray(input.classifications)) ? input.classifications : [];

  // Sanitize: force categories into the allowed set, derive visibility from the
  // category (never trust a model-asserted visibility), re-extract the asset.
  const results = raw.map((r) => {
    const category = ALL_CATS.has(r.category) ? r.category : 'Unsorted';
    const visibility = BIDDER_CATS.includes(category) ? 'bidder' : 'admin';
    const path = String(r.path || '');
    const scope = r.scope === 'asset' ? 'asset' : 'sale';
    let asset = null;
    if (scope === 'asset') { const m = FHA_RE.exec(path) || (r.asset ? FHA_RE.exec(String(r.asset)) : null); asset = m ? m[0] : (r.asset || null); }
    return {
      path, name: path.split('/').pop(),
      category, visibility, scope, asset,
      confidence: ['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'medium',
      reason: String(r.reason || '').slice(0, 240)
    };
  });

  return { task: 'classify', model: MODEL, simulated: false, results };
}

export const handler = wrap(async (event) => {
  requireAdmin(event);
  const body = parseBody(event);
  const task = body.task;
  if (task === 'classify') return ok(await classify(body));
  return badRequest('Unknown or unsupported AI task: ' + (task || '(none)'));
});
