

import test from './lib/base.js';
import {dragula} from '../src/dragula.js';

test('public api matches expectation', function (t) {
  t.equal(typeof dragula, 'function', 'dragula is a function');
});
