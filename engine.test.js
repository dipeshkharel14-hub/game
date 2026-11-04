import test from 'node:test'; import assert from 'node:assert/strict';
import { createGame, submitClue, startDiscussionEnd, castVote, chameleonGuess } from '../gameEngine.js';
import { sanitizeFor } from '../sanitization.js';
import { validateClue } from '../validation.js';
const mk = (n = 4, settings = {}) => createGame({ players: [...Array(n)].map((_, i) => ({ id: 'p' + i, name: 'P' + i })), settings, categoryId: 'animals' }).game;
const clues = (g) => { while (g.phase === 'CLUE') submitClue(g, g.order[g.turn], 'hint'); };

test('clue validation: unicode ok, multiword rejected', () => {
  assert.ok(validateClue('  बाघ ').ok); assert.ok(validateClue('हात्ती').ok);
  assert.equal(validateClue('two words').code, 'errors.clueOneWord');
});
test('chameleon payload never contains the word, anywhere', () => {
  const g = mk(); const c = Object.keys(g.roles).find(k => g.roles[k] === 'CHAMELEON');
  const json = JSON.stringify(sanitizeFor(g, c));
  for (const l of ['en', 'ne', 'hi']) assert.ok(!json.includes(g.word[l]));
  const d = Object.keys(g.roles).find(k => g.roles[k] === 'DETECTIVE');
  assert.equal(sanitizeFor(g, d).word, g.word.en);
});
test('turn order, self-vote, double vote, wrong phase', () => {
  const g = mk(); const other = g.order.find(x => x !== g.order[0]);
  assert.equal(submitClue(g, other, 'x').code, 'errors.notYourTurn');
  assert.equal(castVote(g, 'p0', 'p1').code, 'errors.invalidPhase');
  clues(g); startDiscussionEnd(g);
  assert.equal(castVote(g, 'p0', 'p0').code, 'errors.selfVote');
  castVote(g, 'p0', 'p1'); assert.equal(castVote(g, 'p0', 'p2').code, 'errors.alreadyVoted');
});
test('full game: catch chameleon, wrong guess => detectives +2, scored once', () => {
  const g = mk(4, { rounds: 1 }); clues(g); startDiscussionEnd(g);
  const c = Object.keys(g.roles).find(k => g.roles[k] === 'CHAMELEON');
  for (const p of g.order) castVote(g, p, p === c ? g.order.find(x => x !== c) : c);
  assert.equal(g.phase, 'GUESS');
  const wrong = g.grid.find(x => x.en !== g.word.en).en;
  chameleonGuess(g, c, wrong);
  assert.equal(g.phase, 'FINAL');
  for (const [id, r] of Object.entries(g.roles)) assert.equal(g.scores[id], r === 'DETECTIVE' ? 2 : 0);
  assert.equal(chameleonGuess(g, c, wrong).ok, false);
});
test('innocent accused => chameleon +3; two chameleons need 8 players', () => {
  const g = mk(4, { rounds: 1 }); clues(g); startDiscussionEnd(g);
  const d = Object.keys(g.roles).find(k => g.roles[k] === 'DETECTIVE');
  for (const p of g.order) castVote(g, p, p === d ? g.order.find(x => x !== d) : d);
  const c = Object.keys(g.roles).find(k => g.roles[k] === 'CHAMELEON');
  assert.equal(g.scores[c], 3);
  assert.equal(createGame({ players: [...Array(6)].map((_, i) => ({ id: '' + i, name: '' })), settings: { chameleons: 2 }, categoryId: 'animals' }).ok, false);
});
