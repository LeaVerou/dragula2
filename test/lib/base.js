// Migrate Tape to Mocha style
import { expect, assert } from '@esm-bundle/chai';

assert.ok = assert.isOk.bind(assert);
assert.pass = assert.isOk.bind(assert, true);

let test = function(title, fn) {
  return it.call(this, title, () => {
    fn.call(this, assert);
  });
};

function raise (el, type, options) {
  var o = options || {};
  var e = new Event(type, {bubbles: true, cancelable: true});
  Object.keys(o).forEach(apply);
  el.dispatchEvent(e);
  function apply (key) {
	  e[key] = o[key];
  }
}

let events = {raise};

export default test;
export {expect, assert, events};