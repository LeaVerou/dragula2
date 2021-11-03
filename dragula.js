'use strict';

class Dragula extends EventTarget {
  constructor (initialContainers, options) {

  super();
  var len = arguments.length;
  if (len === 1 && Array.isArray(initialContainers) === false) {
    [options, initialContainers] = [initialContainers, []];
  }

  var o = this.options = Object.assign({}, Dragula.defaultOptions, options);
  o.containers = o.containers || initialContainers || [];
  this.containers = o.containers;
  this.dragging = false;

  var _mirror; // mirror image
  var _source; // source container
  var _item; // item being dragged
  var _offsetX; // reference x
  var _offsetY; // reference y
  var _moveX; // reference move x
  var _moveY; // reference move y
  var _initialSibling; // reference sibling when grabbed
  var _currentSibling; // reference sibling now
  var _copy; // item used for copying
  var _renderTimer; // timer for setTimeout renderMirrorImage
  var _lastDropTarget = null; // last container item was over
  var _grabbed; // holds pointerdown context until first pointermove

  let drake = this;

  if (o.removeOnSpill === true) {
    this.on('over', spillOver).on('out', spillOut);
  }

  var documentElement = document.documentElement;
  documentElement.addEventListener('pointerdown', grab);
  documentElement.addEventListener('pointerup', release);

  Object.assign(this, {
    start: manualStart,
    end: end,
    cancel: cancel,
    remove: remove,
    destroy: destroy,
    canMove: canMove
  });

  function isContainer (el) {
    return drake.containers.includes(el) || o.isContainer(el);
  }

  function eventualMovements (remove) {
    var op = remove ? 'remove' : 'add';
    documentElement[op + 'EventListener']('pointermove', startBecauseMouseMoved);
  }

  function movements (remove) {
    var op = remove ? 'remove' : 'add';
    documentElement[op + 'EventListener']('click', preventGrabbed);
  }

  function destroy () {
    documentElement.removeEventListener('pointerdown', grab);
    documentElement.removeEventListener('pointerup', release);
    release({});
  }

  function preventGrabbed (e) {
    if (_grabbed) {
      e.preventDefault();
    }
  }

  function grab (e) {
    _moveX = e.clientX;
    _moveY = e.clientY;

    var ignore = whichMouseButton(e) !== 1 || e.metaKey || e.ctrlKey;
    if (ignore) {
      return; // we only care about honest-to-god left clicks and touch events
    }
    var item = e.target;
    var context = canStart(item);
    if (!context) {
      return;
    }
    _grabbed = context;
    eventualMovements();
    if (e.type === 'pointerdown') {
      if (isInput(item)) { // see also: https://github.com/bevacqua/dragula/issues/208
        item.focus(); // fixes https://github.com/bevacqua/dragula/issues/176
      } else {
        e.preventDefault(); // fixes https://github.com/bevacqua/dragula/issues/155
      }
    }
  }

  function startBecauseMouseMoved (e) {
    if (!_grabbed) {
      return;
    }
    if (whichMouseButton(e) === 0) {
      release({});
      return; // when text is selected on an input and then dragged, pointerup doesn't fire. this is our only hope
    }

    // truthy check fixes #239, equality fixes #207, fixes #501
    if ((e.clientX !== void 0 && Math.abs(e.clientX - _moveX) <= (o.slideFactorX || 0)) &&
      (e.clientY !== void 0 && Math.abs(e.clientY - _moveY) <= (o.slideFactorY || 0))) {
      return;
    }

    if (o.ignoreInputTextSelection) {
      var clientX = e.clientX || 0;
      var clientY = e.clientY || 0;
      var elementBehindCursor = document.elementFromPoint(clientX, clientY);

      if (isInput(elementBehindCursor)) {
        return;
      }
    }

    var grabbed = _grabbed; // call to end() unsets _grabbed
    eventualMovements(true);
    movements();
    end();
    start(grabbed);

    var offset = getOffset(_item);
    _offsetX = e.pageX - offset.left;
    _offsetY = e.pageY - offset.top;

    var inTransit = _copy || _item;
    if (inTransit) {
      inTransit.classList.add('gu-transit');
    }
    renderMirrorImage();
    drag(e);
  }

  function canStart (item) {
    if (drake.dragging && _mirror) {
      return;
    }
    if (isContainer(item)) {
      return; // don't drag container itself
    }
    var handle = item;
    while (getParent(item) && isContainer(getParent(item)) === false) {
      if (o.invalid(item, handle)) {
        return;
      }
      item = getParent(item); // drag target should be a top element
      if (!item) {
        return;
      }
    }
    var source = getParent(item);
    if (!source) {
      return;
    }
    if (o.invalid(item, handle)) {
      return;
    }

    var movable = o.moves(item, source, handle, item.nextElementSibling);
    if (!movable) {
      return;
    }

    return {
      item: item,
      source: source
    };
  }

  function canMove (item) {
    return !!canStart(item);
  }

  function manualStart (item) {
    var context = canStart(item);
    if (context) {
      start(context);
    }
  }

  function start (context) {
    if (isCopy(context.item, context.source)) {
      _copy = context.item.cloneNode(true);
      drake.emit('cloned', {
        clone: _copy,
        original: context.item,
        type: 'copy'
      });
    }

    _source = context.source;
    _item = context.item;
    _initialSibling = _currentSibling = context.item.nextElementSibling;

    drake.dragging = true;
    drake.emit('drag', {
      element: _item,
      source: _source
    });
  }



  function end () {
    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    drop(item, getParent(item));
  }

  function ungrab () {
    _grabbed = false;
    eventualMovements(true);
    movements(true);
  }

  function release (e) {
    ungrab();

    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    var clientX = e.clientX || 0;
    var clientY = e.clientY || 0;
    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);

    if (dropTarget && ((_copy && o.copySortSource) || (!_copy || dropTarget !== _source))) {
      drop(item, dropTarget);
    }
    else if (o.removeOnSpill) {
      remove();
    }
    else {
      cancel();
    }
  }

  function drop (item, target) {
    if (_copy && o.copySortSource && target === _source) {
      _item.remove();
    }

    if (isInitialPlacement(target)) {
      drake.emit('cancel', {
        element: item,
        container: _source,
        source: _source
      });
    }
    else {
      drake.emit('drop', {
        element: item,
        target,
        source: _source,
        sibling: _currentSibling
      });
    }

    cleanup();
  }

  function remove () {
    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    var parent = getParent(item);
    if (parent) {
      item.remove();
    }

    drake.emit(_copy ? 'cancel' : 'remove', {
      element: item,
      container: parent,
      source: _source
    });
    cleanup();
  }

  function cancel (revert) {
    if (!drake.dragging) {
      return;
    }
    var reverts = arguments.length > 0 ? revert : o.revertOnSpill;
    var item = _copy || _item;
    var parent = getParent(item);
    var initial = isInitialPlacement(parent);
    if (initial === false && reverts) {
      if (_copy) {
        if (parent) {
          _copy.remove();
        }
      } else {
        _source.insertBefore(item, _initialSibling);
      }
    }

    if (initial || reverts) {
      drake.emit('cancel', {
        element: item,
        container: _source,
        source: _source
      });
    }
    else {
      drake.emit('drop', {
        element: item,
        target: parent,
        source: _source,
        sibling: _currentSibling
      });
    }

    cleanup();
  }

  function cleanup () {
    var item = _copy || _item;
    ungrab();
    removeMirrorImage();
    if (item) {
      item.classList.remove('gu-transit');
    }
    if (_renderTimer) {
      clearTimeout(_renderTimer);
    }
    drake.dragging = false;
    if (_lastDropTarget) {
      drake.emit('out', {
        element: item,
        container: _lastDropTarget,
        source: _source
      });
    }
    drake.emit('dragend', { element: item });
    _source = _item = _copy = _initialSibling = _currentSibling = _renderTimer = _lastDropTarget = null;
  }

  function isInitialPlacement (target, s) {
    var sibling;
    if (s !== void 0) {
      sibling = s;
    } else if (_mirror) {
      sibling = _currentSibling;
    } else {
      sibling = (_copy || _item).nextElementSibling;
    }
    return target === _source && sibling === _initialSibling;
  }

  function findDropTarget (elementBehindCursor, clientX, clientY) {
    var target = elementBehindCursor;
    while (target && !accepted()) {
      target = getParent(target);
    }
    return target;

    function accepted () {
      var droppable = isContainer(target);
      if (droppable === false) {
        return false;
      }

      var immediate = getImmediateChild(target, elementBehindCursor);
      var reference = getReference(target, immediate, clientX, clientY);
      var initial = isInitialPlacement(target, reference);
      if (initial) {
        return true; // should always be able to drop it right back where it was
      }
      return o.accepts(_item, target, _source, reference);
    }
  }

  function drag (e) {
    if (!_mirror) {
      return;
    }
    e.preventDefault();

    var clientX = e.clientX || 0;
    var clientY = e.clientY || 0;
    var x = clientX - _offsetX;
    var y = clientY - _offsetY;

    _mirror.style.left = x + 'px';
    _mirror.style.top = y + 'px';

    var item = _copy || _item;
    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
    var changed = dropTarget !== null && dropTarget !== _lastDropTarget;
    if (changed || dropTarget === null) {
      out();
      _lastDropTarget = dropTarget;
      over();
    }
    var parent = getParent(item);
    if (dropTarget === _source && _copy && !o.copySortSource) {
      if (parent) {
        item.remove();
      }
      return;
    }
    var reference;
    var immediate = getImmediateChild(dropTarget, elementBehindCursor);
    if (immediate !== null) {
      reference = getReference(dropTarget, immediate, clientX, clientY);
    } else if (o.revertOnSpill === true && !_copy) {
      reference = _initialSibling;
      dropTarget = _source;
    } else {
      if (_copy && parent) {
        item.remove();
      }
      return;
    }
    if (
      (reference === null && changed) ||
      reference !== item &&
      reference !== item.nextElementSibling
    ) {
      _currentSibling = reference;
      dropTarget.insertBefore(item, reference);
      drake.emit('shadow', {
        element: item,
        container: dropTarget,
        source: _source
      });
    }
    function moved (type) {
      drake.emit(type, {
        element: item,
        container: _lastDropTarget,
        source: _source
      });
    }
    function over () { if (changed) { moved('over'); } }
    function out () { if (_lastDropTarget) { moved('out'); } }
  }

  function spillOver (el) {
    el && el.classList.remove('gu-hide');
  }

  function spillOut (el) {
    if (drake.dragging) {
      el && el.classList.add('gu-hide');
    }
  }

  function renderMirrorImage () {
    if (_mirror) {
      return;
    }
    var rect = _item.getBoundingClientRect();
    _mirror = _item.cloneNode(true);
    _mirror.style.width = rect.width + 'px';
    _mirror.style.height = rect.height + 'px';

    _mirror.classList.remove('gu-transit');
    _mirror.classList.add('gu-mirror');

    o.mirrorContainer.appendChild(_mirror);
    documentElement.addEventListener('pointermove', drag);
    o.mirrorContainer.classList.add('gu-unselectable');
    drake.emit('cloned', {
      clone: _mirror,
      original: _item,
      type: 'mirror'
    });
  }

  function removeMirrorImage () {
    if (_mirror) {
      o.mirrorContainer.classList.remove('gu-unselectable');
      documentElement.removeEventListener('pointermove', drag);
      _mirror.remove();
      _mirror = null;
    }
  }

  function getImmediateChild (dropTarget, target) {
    var immediate = target;
    while (immediate !== dropTarget && getParent(immediate) !== dropTarget) {
      immediate = getParent(immediate);
    }
    if (immediate === documentElement) {
      return null;
    }
    return immediate;
  }

  function getReference (dropTarget, target, x, y) {
    var horizontal = o.direction === 'horizontal';
    var reference = target !== dropTarget ? inside() : outside();
    return reference;

    function outside () { // slower, but able to figure out any position
      var len = dropTarget.children.length;
      var i;
      var el;
      var rect;
      for (i = 0; i < len; i++) {
        el = dropTarget.children[i];
        rect = el.getBoundingClientRect();
        if (horizontal && (rect.left + rect.width / 2) > x) { return el; }
        if (!horizontal && (rect.top + rect.height / 2) > y) { return el; }
      }
      return null;
    }

    function inside () { // faster, but only available if dropped inside a child element
      var rect = target.getBoundingClientRect();
      if (horizontal) {
        return resolve(x > rect.left + rect.width / 2);
      }
      return resolve(y > rect.top + rect.height / 2);
    }

    function resolve (after) {
      return after ? target.nextElementSibling : target;
    }
  }

  function isCopy (item, container) {
    return typeof o.copy === 'boolean' ? o.copy : o.copy(item, container);
  }
} // End constructor

  on (eventType, callback) {
    this.addEventListener(eventType, evt => {
      callback.call(this, ...Object.values(evt.detail));
    });

    return this;
  }

  off (eventType, callback) {
    this.removeEventListener(eventType, callback);

    return this;
  }

  emit (eventType, detail, ...args) {
    if (detail instanceof Node) {
      // Old syntax with positional arguments
      detail = [detail, ...args];
    }
    let evt = new CustomEvent(eventType, { detail });
    this.dispatchEvent(evt);
    return this;
  }

  static defaultOptions = {
    moves: _ => true,
    accepts: _ => true,
    invalid: _ => false,
    isContainer: _ => false,
    copy: false,
    copySortSource: false,
    revertOnSpill: false,
    removeOnSpill: false,
    direction: 'vertical',
    ignoreInputTextSelection: true,
    mirrorContainer: document.body
  }
}

export default function dragula (...args) {
  return new Dragula(...args);
}

function whichMouseButton (e) {
  if (e.touches !== void 0) { return e.touches.length; }
  if (e.which !== void 0 && e.which !== 0) { return e.which; } // see https://github.com/bevacqua/dragula/issues/261
  if (e.buttons !== void 0) { return e.buttons; }
  var button = e.button;
  if (button !== void 0) { // see https://github.com/jquery/jquery/blob/99e8ff1baa7ae341e94bb89c3e84570c7c3ad9ea/src/event.js#L573-L575
    return button & 1 ? 1 : button & 2 ? 3 : (button & 4 ? 2 : 0);
  }
}

function getOffset (el) {
  var rect = el.getBoundingClientRect();
  return {
    left: rect.left + window.scrollX,
    top: rect.top + window.scrollY
  };
}

function getElementBehindPoint (point, x, y) {
  point = point || {};
  var state = point.className || '';
  var el;
  point.className += ' gu-hide';
  el = document.elementFromPoint(x, y);
  point.className = state;
  return el;
}

function getParent (el) { return el.parentNode === document ? null : el.parentNode; }
function isInput (el) { return el?.matches("input, select, textarea") || isEditable(el); }
function isEditable (el) {
  if (!el) { return false; } // no parents were editable
  if (el.contentEditable === 'false') { return false; } // stop the lookup
  if (el.contentEditable === 'true') { return true; } // found a contentEditable element in the chain
  return isEditable(getParent(el)); // contentEditable is set to 'inherit'
}