import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { changeSummary } from '../../lib/util/summary.js';

// Plain text, so the tests don't depend on terminal colours
const summary = (oldYaml, newYaml) => changeSummary(oldYaml, newYaml).map(line => line.replace(/\x1b\[[0-9;]*m/g, ''));

const BASE = `name: Coffee app
users:
  - name: Customer
    step: Browse
steps:
  - Browse
  - Pay
legend:
  - color: "#fef08a"
    label: Tasks
slices:
  - name: MVP
    stories:
      Browse:
        - name: List drinks
        - name: Search
      Pay:
        - name: Card payment
  - name: Later
    stories:
      Pay:
        - name: Gift cards
notes: Oat milk
`;
const edit = (from, to) => BASE.replace(from, to);

describe('changeSummary', () => {
  test('nothing changed means no lines', () => {
    assert.deepEqual(summary(BASE, BASE), []);
  });

  test('a renamed map', () => {
    assert.deepEqual(summary(BASE, edit('name: Coffee app', 'name: Tea app')), ['  name: Coffee app → Tea app']);
  });

  test('added and removed steps', () => {
    assert.deepEqual(summary(BASE, edit('  - Pay\nlegend', '  - Pay\n  - Collect\nlegend')), ['  steps: +1', '    + Collect']);
  });

  test('reordered steps', () => {
    assert.ok(summary(BASE, edit('  - Browse\n  - Pay\n', '  - Pay\n  - Browse\n')).includes('  ~ steps reordered'));
  });

  test('added, removed and renamed cards in a slice', () => {
    assert.deepEqual(summary(BASE, edit('        - name: Search\n', '        - name: Search\n        - name: Filter\n')), ['  + MVP: 1 card']);
    assert.deepEqual(summary(BASE, edit('        - name: Search\n', '')), ['  - MVP: 1 card']);
    assert.deepEqual(summary(BASE, edit('name: Search', 'name: Find')), ['  ~ MVP: 1 card renamed']);
  });

  test('a card moved to another slice', () => {
    const moved = edit('      Pay:\n        - name: Card payment\n', '').replace('        - name: Gift cards\n', '        - name: Gift cards\n        - name: Card payment\n');
    assert.deepEqual(summary(BASE, moved), ['  ~ Later: 1 card moved']);
  });

  test('a card with changed fields names them', () => {
    assert.deepEqual(summary(BASE, edit('        - name: Search\n', '        - name: Search\n          status: done\n          points: 2\n')), ['  ~ MVP: 1 card updated (status, points)']);
  });

  test('renamed and added slices', () => {
    assert.deepEqual(summary(BASE, edit('name: Later', 'name: Release 2')), ['  ~ slice: Later → Release 2']);
    const added = edit('notes: Oat milk', '  - name: Release 3\n    stories:\n      Pay:\n        - name: Refunds\nnotes: Oat milk');
    assert.deepEqual(summary(BASE, added), ['  + slice: Release 3', '  + Release 3: 1 card']);
  });

  test('a completed slice', () => {
    assert.deepEqual(summary(BASE, edit('  - name: Later\n', '  - name: Later\n    collapsed: true\n    closedReason: complete\n')), ['  ~ slice: Later completed']);
  });

  test('a slice goal and target date set, changed and removed', () => {
    const withGoal = edit('  - name: Later\n', '  - name: Later\n    goal: Gift cards\n    targetDate: "2027-01-04"\n');
    assert.deepEqual(summary(BASE, withGoal), ['  ~ slice: Later goal set', '  ~ slice: Later target date set to 2027-01-04']);
    assert.deepEqual(summary(withGoal, withGoal.replace('Gift cards', 'Vouchers').replace('2027-01-04', '2027-02-01')),
      ['  ~ slice: Later goal changed', '  ~ slice: Later target date moved to 2027-02-01']);
    assert.deepEqual(summary(withGoal, BASE), ['  ~ slice: Later goal removed', '  ~ slice: Later target date removed']);
  });

  test('an unquoted target date, which YAML reads as a date, is not a change', () => {
    const quoted = edit('  - name: Later\n', '  - name: Later\n    targetDate: "2027-01-04"\n');
    assert.deepEqual(summary(quoted, quoted.replace('"2027-01-04"', '2027-01-04')), []);
  });

  test('legend renames, and notes added, changed or removed', () => {
    assert.deepEqual(summary(BASE, edit('label: Tasks', 'label: Jobs')), ['  ~ legend: Tasks → Jobs']);
    assert.deepEqual(summary(BASE, edit('notes: Oat milk', 'notes: Soy milk')), ['  ~ notes updated']);
    assert.deepEqual(summary(BASE, edit('notes: Oat milk\n', '')), ['  - notes']);
  });
});
