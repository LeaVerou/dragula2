

import test from './lib/base.js';
import {dragula} from '../src/dragula.js';

test('drake defaults to no containers', function (t) {
  var drake = dragula();
  t.ok(Array.isArray(drake.containers), 'drake.containers is an array');
  t.equal(drake.containers.length, 0, 'drake.containers is empty');
});

test('drake reads containers from array argument', function (t) {
  var el = document.createElement('div');
  var containers = [el];
  var drake = dragula(containers);
  t.equal(drake.containers, containers, 'drake.containers matches input');
  t.equal(drake.containers.length, 1, 'drake.containers has one item');
});

test('drake reads containers from array in options', function (t) {
  var el = document.createElement('div');
  var containers = [el];
  var drake = dragula({ containers: containers });
  t.equal(drake.containers, containers, 'drake.containers matches input');
  t.equal(drake.containers.length, 1, 'drake.containers has one item');
});

test('containers in options take precedent', function (t) {
  var el = document.createElement('div');
  var containers = [el];
  var drake = dragula([], { containers: containers });
  t.equal(drake.containers, containers, 'drake.containers matches input');
  t.equal(drake.containers.length, 1, 'drake.containers has one item');
});
