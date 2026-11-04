// The ONLY function allowed to turn internal state into something sent to a client.
export function sanitizeFor(g, pid, lang = 'en') {
  const mine = g.roles[pid], revealed = ['ROUND_SUMMARY', 'FINAL'].includes(g.phase);
  const out = { phase: g.phase, round: g.round, rounds: g.settings.rounds, players: g.players,
    scores: g.scores, clues: g.clues, activePlayer: g.phase === 'CLUE' ? g.order[g.turn] : null,
    votedCount: Object.keys(g.votes).length, role: mine, category: g.categoryId,
    word: mine === 'DETECTIVE' ? g.word[lang] ?? g.word.en : undefined };
  if (g.phase === 'GUESS' && pid === g.accused) out.guessGrid = g.grid.map(x => ({ id: x.en, label: x[lang] ?? x.en }));
  if (g.phase === 'GUESS') out.accused = g.accused;
  if (revealed) { out.result = g.result; out.roles = g.roles; out.secretWord = g.word[lang] ?? g.word.en; }
  return out;
}
