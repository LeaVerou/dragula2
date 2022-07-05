

import test, {events} from './lib/base.js';
import {dragula} from '../src/dragula.js';

describe('remove does not throw when not dragging', function () {
  test('a single time', function once (st) {
    var drake = dragula();
    st.doesNotThrow(function () {
      drake.remove();
    }, 'dragula ignores a single call to drake.remove');
  });

  test('multiple times', function once (st) {
    var drake = dragula();
    st.doesNotThrow(function () {
      drake.remove();
      drake.remove();
      drake.remove();
      drake.remove();
    }, 'dragula ignores multiple calls to drake.remove');
  });
});

test('when dragging and remove gets called, element is removed', function (t) {
  var div = document.createElement('div');
  var item = document.createElement('div');
  var drake = dragula([div]);
  div.appendChild(item);
  document.body.appendChild(div);
  drake.start(item);
  drake.remove();
  t.equal(div.children.length, 0, 'item got removed from container');
  t.equal(drake.dragging, false, 'drake has stopped dragging');
});

test('when dragging and remove gets called, remove event is emitted', function (t) {
  var div = document.createElement('div');
  var item = document.createElement('div');
  var drake = dragula([div]);
  div.appendChild(item);
  document.body.appendChild(div);
  drake.start(item);
  drake.on('remove', remove);
  drake.on('dragend', dragend);
  drake.remove();
  // t.plan(3);
  function dragend () {
    t.pass('dragend got called');
  }
  function remove (target, container) {
    t.equal(target, item, 'remove was invoked with item');
    t.equal(container, div, 'remove was invoked with container');
  }
});

test('when dragging a copy and remove gets called, cancel event is emitted', function (t) {
  var div = document.createElement('div');
  var item = document.createElement('div');
  var drake = dragula([div], { copy: true });
  div.appendChild(item);
  document.body.appendChild(div);
  events.raise(item, 'pointerdown', { which: 1 });
  events.raise(item, 'pointermove', { which: 1 });
  drake.on('cancel', cancel);
  drake.on('dragend', dragend);
  drake.remove();
  // t.plan(4);
  function dragend () {
    t.pass('dragend got called');
  }
  function cancel (target, container) {
    t.equal(target.className, 'gu-transit', 'cancel was invoked with item');
    t.notEqual(target, item, 'item is a copy and not the original');
    t.equal(container, null, 'cancel was invoked with container');
  }
});
