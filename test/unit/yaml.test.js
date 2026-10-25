import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import jsyaml from 'js-yaml';
import { exportToYaml, importFromYaml, validateYaml, yamlObjToJson } from '../../lib/core/yaml.js';

const MAP = `name: Coffee app
users:
  - name: Customer
    color: "#fca5a5"
    step: Browse
activities:
  - name: Order coffee
    color: "#93c5fd"
    step: Browse
steps:
  - Browse
  - name: Pay
    color: "#fecdd3"
    status: done
    points: 3
legend:
  - color: "#fef08a"
    label: Tasks
slices:
  - name: MVP
    stories:
      Browse:
        - name: List drinks
          status: in-progress
          points: 0
          tags:
            - menu
      Pay:
        - name: Card payment
          body: Visa and Mastercard
          url: https://example.com/pay
notes: Remember the oat milk
`;

// YAML -> the map JSON the app uses -> YAML, the way pull, push and diff normalise files
const roundTrip = (yaml) => exportToYaml(yamlObjToJson(jsyaml.load(yaml)));

describe('YAML to map JSON', () => {
  test('reads steps, cards and their fields into positional arrays', () => {
    const json = importFromYaml(MAP);
    assert.equal(json.name, 'Coffee app');
    assert.deepEqual(json.steps.map(s => s.name), ['Browse', 'Pay']);
    assert.deepEqual(json.steps[1], { name: 'Pay', color: '#fecdd3', status: 'done', points: 3 });
    assert.deepEqual(json.users, [[{ name: 'Customer', color: '#fca5a5' }], []]);
    assert.deepEqual(json.slices[0].stories[0], [{ name: 'List drinks', status: 'in-progress', points: 0, tags: ['menu'] }]);
    assert.equal(json.slices[0].stories[1][0].url, 'https://example.com/pay');
    assert.equal(json.notes, 'Remember the oat milk');
  });

  test('a spacer becomes a hidden step', () => {
    const json = importFromYaml('name: x\nsteps:\n  - A\n  - spacer\n  - B\n');
    assert.equal(json.steps[1].hidden, true);
  });

  test('numbered duplicate steps, as the server writes them, come back with their real names', () => {
    const json = importFromYaml('name: x\nsteps:\n  - Confirm[0]\n  - Confirm[1]\nslices:\n  - name: MVP\n    stories:\n      Confirm[1]:\n        - name: Review\n');
    assert.deepEqual(json.steps.map(s => s.name), ['Confirm', 'Confirm']);
    assert.deepEqual(json.slices[0].stories, [[], [{ name: 'Review' }]]);
  });

  test('keeps a slice goal and target date', () => {
    const json = importFromYaml('name: x\nsteps:\n  - A\nslices:\n  - name: MVP\n    goal: Ship it\n    targetDate: "2027-01-04"\n');
    assert.equal(json.slices[0].goal, 'Ship it');
    assert.equal(json.slices[0].targetDate, '2027-01-04');
  });
});

describe('round trips', () => {
  test('a map comes back the same after normalising', () => {
    const once = roundTrip(MAP);
    assert.equal(roundTrip(once), once);
    assert.deepEqual(yamlObjToJson(jsyaml.load(once)).slices, importFromYaml(MAP).slices);
  });

  test('steps with the same name are written numbered and come back unchanged', () => {
    const json = { name: 'x', steps: [{ name: 'Confirm' }, { name: 'Confirm' }], slices: [{ name: 'MVP', stories: [[], [{ name: 'Review' }]] }] };
    const yaml = exportToYaml(json);
    assert.deepEqual(jsyaml.load(yaml).steps, ['Confirm[0]', 'Confirm[1]']);
    const back = yamlObjToJson(jsyaml.load(yaml));
    assert.deepEqual(back.steps.map(s => s.name), ['Confirm', 'Confirm']);
    assert.deepEqual(back.slices[0].stories[1], [{ name: 'Review' }]);
  });

  test('cards under a hidden step survive', () => {
    const json = { name: 'x', steps: [{ name: 'Browse' }, { name: '', hidden: true }], slices: [{ name: 'MVP', stories: [[], [{ name: 'Kept' }]] }] };
    assert.deepEqual(yamlObjToJson(jsyaml.load(exportToYaml(json))).slices[0].stories[1], [{ name: 'Kept' }]);
  });

  test('a slice goal and target date survive normalising', () => {
    const yaml = roundTrip('name: x\nsteps:\n  - A\nslices:\n  - name: MVP\n    goal: Ship it\n    targetDate: "2027-01-04"\n');
    assert.match(yaml, /goal: Ship it/);
    assert.match(yaml, /targetDate: ['"]?2027-01-04/);
  });
});

describe('validateYaml', () => {
  const check = (yaml) => validateYaml(jsyaml.load(yaml));

  test('a valid map passes', () => {
    assert.deepEqual(check(MAP), { valid: true, errors: [], warnings: [] });
  });

  test('needs at least one step', () => {
    assert.deepEqual(check('name: x\n').errors, ['Missing or empty "steps" list']);
  });

  test('rejects duplicate step names and cards under unknown steps', () => {
    assert.match(check('name: x\nsteps:\n  - A\n  - A\n').errors[0], /Duplicate step names: A/);
    assert.deepEqual(check('name: x\nsteps:\n  - A\nslices:\n  - name: MVP\n    stories:\n      Nope:\n        - name: Card\n').errors, ['Slice "MVP" references unknown step "Nope"']);
  });

  test('warns about an unknown status but still passes', () => {
    const result = check('name: x\nsteps:\n  - A\nslices:\n  - name: MVP\n    stories:\n      A:\n        - name: Card\n          status: someday\n');
    assert.equal(result.valid, true);
    assert.equal(result.warnings.length, 1);
  });

  test('accepts cards under an unnamed step, as the server does', () => {
    const result = check('name: x\nsteps:\n  - ""\n  - Pay\nslices:\n  - name: MVP\n    stories:\n      "":\n        - name: Card\n');
    assert.deepEqual(result.errors, []);
  });

  test('importFromYaml throws with the validation errors attached', () => {
    assert.throws(() => importFromYaml('name: x\nsteps: []\n'), (err) => err.validationErrors?.length === 1);
  });
});
