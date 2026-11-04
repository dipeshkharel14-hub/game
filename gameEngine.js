import { validateClue, validateSettings } from './validation.js';
import { assignRoles, secureRng } from './roleManager.js';
import { pickWord, guessGrid } from './wordManager.js';
import { awardRound } from './scoringEngine.js';
const err = (code) => ({ ok: false, code });

export function createGame({ players, settings, categoryId, rng = secureRng }) {
  const s = validateSettings(settings, players.length); if (!s.ok) return s;
  const g = { settings: s.value, categoryId, rng, players: players.map(p => ({ id: p.id, name: p.name })),
    scores: Object.fromEntries(players.map(p => [p.id, 0])), awardedRounds: [], round: 0, stats: { detective: 0, chameleon: 0 } };
  startRound(g); return { ok: true, game: g };
}
export function startRound(g) {
  g.round++; g.phase = 'CLUE';
  const ids = g.players.map(p => p.id);
  g.roles = assignRoles(ids, g.settings.chameleons, g.rng);
  g.word = pickWord(g.categoryId, g.rng);               // server-only
  g.order = g.rng.shuffle(ids); g.turn = 0; g.clues = [];
  g.votes = {}; g.accused = null; g.revoteAmong = null; g.grid = null; g.result = null;
}
const active = (g) => g.order[g.turn];

export function submitClue(g, pid, raw) {
  if (g.phase !== 'CLUE') return err('errors.invalidPhase');
  if (pid !== active(g)) return err('errors.notYourTurn');
  const v = validateClue(raw); if (!v.ok) return v;
  g.clues.push({ playerId: pid, clue: v.value, turnNumber: g.turn });
  return advance(g);
}
// Also used for expired turns (no clue recorded).
export function advance(g) {
  if (g.phase !== 'CLUE') return err('errors.invalidPhase');
  if (++g.turn >= g.order.length) g.phase = 'DISCUSSION';
  return { ok: true };
}
export function startDiscussionEnd(g) {           // timer or host ends discussion
  if (g.phase !== 'DISCUSSION') return err('errors.invalidPhase');
  g.phase = 'VOTING'; return { ok: true };
}
export function castVote(g, voter, target) {
  if (g.phase !== 'VOTING') return err('errors.invalidPhase');
  const pool = g.revoteAmong ?? g.order;
  if (voter === target) return err('errors.selfVote');
  if (!g.order.includes(voter) || !pool.includes(target)) return err('errors.invalidAction');
  if (g.votes[voter] && !g.settings.allowVoteChange) return err('errors.alreadyVoted');
  g.votes[voter] = target;
  return Object.keys(g.votes).length === g.order.length ? closeVoting(g) : { ok: true };
}
export function closeVoting(g) {                   // call on timer expiry too
  if (g.phase !== 'VOTING') return err('errors.invalidPhase');
  const tally = {}; for (const t of Object.values(g.votes)) tally[t] = (tally[t] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(tally));
  const top = Object.keys(tally).filter(k => tally[k] === max);
  if (top.length === 1) return accuse(g, top[0]);
  if (top.length === 0) top.push(...g.order);
  if (!g.revoteAmong) { g.revoteAmong = top; g.votes = {}; return { ok: true, revote: top }; }
  if (g.settings.tieBreak === 'random') return accuse(g, top[g.rng.int(top.length)]);
  g.accused = null; return resolve(g, 'CHAMELEON_WIN', 'unresolvedTie');
}
function accuse(g, id) {
  g.accused = id;
  if (g.roles[id] !== 'CHAMELEON') return resolve(g, 'CHAMELEON_WIN', 'innocentAccused');
  g.phase = 'GUESS'; g.grid = guessGrid(g.categoryId, g.word, g.rng); return { ok: true };
}
export function chameleonGuess(g, pid, wordEn) {
  if (g.phase !== 'GUESS') return err('errors.invalidPhase');
  if (pid !== g.accused) return err('errors.unauthorized');
  if (!g.grid.some(x => x.en === wordEn)) return err('errors.invalidAction');
  return resolve(g, wordEn === g.word.en ? 'CHAMELEON_WIN' : 'DETECTIVE_WIN', 'guess');
}
// With 2 chameleons they win/lose as a team: catching either one triggers the guess.
function resolve(g, outcome, reason) {
  const r = awardRound(g.scores, g.awardedRounds, g.round, g.roles, outcome, g.settings.scoring);
  g.scores = r.scores; g.awardedRounds = r.awardedRounds;
  g.stats[outcome === 'CHAMELEON_WIN' ? 'chameleon' : 'detective']++;
  g.result = { outcome, reason, accused: g.accused, delta: r.delta };
  g.phase = g.round >= g.settings.rounds ? 'FINAL' : 'ROUND_SUMMARY';
  return { ok: true, done: true };
}
export function nextRound(g) { if (g.phase !== 'ROUND_SUMMARY') return err('errors.invalidPhase'); startRound(g); return { ok: true }; }
