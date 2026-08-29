const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test?sslmode=disable';
process.env.JWT_SECRET ||= 'test-secret-with-at-least-thirty-two-characters';

const statsRouter = require('../src/routes/stats.routes');
const { calcStats, MINIMUM_VERIFIED_SAMPLE } = statsRouter;

test('le bilan utilise un échantillon minimum explicite', () => {
  assert.equal(MINIMUM_VERIFIED_SAMPLE, 20);
});

test('calcStats calcule le résultat, le score exact et le score proche sans sélection de fenêtre', () => {
  const rows = [
    { equipe1: 'France', equipe2: 'Italie', score_p1: 2, score_p2: 1, favori: 'France', score_exact: '2-1' },
    { equipe1: 'Portugal', equipe2: 'Espagne', score_p1: 1, score_p2: 1, favori: 'Match nul', score_exact: '0-0' },
    { equipe1: 'Brésil', equipe2: 'Argentine', score_p1: 0, score_p2: 2, favori: 'Brésil', score_exact: '1-2' },
  ];

  assert.deepEqual(calcStats(rows), {
    total: 3,
    correct: 2,
    scoreExact: 1,
    proche: 3,
    pctCorrect: 67,
    pctScoreExact: 33,
    pctProche: 100,
  });
});
