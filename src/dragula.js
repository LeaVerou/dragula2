import {
  getImmediateChild,
  getReference,
  getOffset,
  whichMouseButton,
  getElementBehindPoint,
  getParent,
  isInput,
} from './utils.js';

const documentElement = document.documentElement;

class Dragula extends EventTarget {
  constructor (initialContainers, options) {

    super();
    var len = arguments.length;
    if (len === 1 && Array.isArray(initialContainers) === false) {
      [options, initialContainers] = [initialContainers, []];
    }

    var o = this.options = Object.assign({}, Dragula.defaultOptions, options);
    this.containers = o.containers = o.containers || initialContainers || [];

    if (typeof o.copy !== 'function') {
      let copy = o.copy;
      o.copy = () => copy;
    }

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

    if (this.options.removeOnSpill === true) {
      this.on('over', spillOver).on('out', spillOut);
    }

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
      return drake.containers.includes(el) || drake.options.isContainer(el);
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
      if ((e.clientX !== void 0 && Math.abs(e.clientX - _moveX) <= (drake.options.slideFactorX || 0)) &&
      (e.clientY !== void 0 && Math.abs(e.clientY - _moveY) <= (drake.options.slideFactorY || 0))) {
        return;
      }

      if (drake.options.ignoreInputTextSelection) {
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
        if (drake.options.invalid(item, handle)) {
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
      if (drake.options.invalid(item, handle)) {
        return;
      }

      var movable = drake.options.moves(item, source, handle, item.nextElementSibling);
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
      if (o.copy(context.item, context.source)) {
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

      if (dropTarget && ((_copy && drake.options.copySortSource) || (!_copy || dropTarget !== _source))) {
        drop(item, dropTarget);
      }
      else if (drake.options.removeOnSpill) {
        remove();
      }
      else {
        cancel();
      }
    }

    function drop (item, target) {
      if (_copy && drake.options.copySortSource && target === _source) {
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
      var reverts = arguments.length > 0 ? revert : drake.options.revertOnSpill;
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
        var reference = getReference(target, immediate, clientX, clientY, drake.options.direction);
        var initial = isInitialPlacement(target, reference);
        if (initial) {
          return true; // should always be able to drop it right back where it was
        }
        return drake.options.accepts(_item, target, _source, reference);
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
      if (dropTarget === _source && _copy && !drake.options.copySortSource) {
        if (parent) {
          item.remove();
        }
        return;
      }
      var reference;
      var immediate = getImmediateChild(dropTarget, elementBehindCursor);
      if (immediate !== null) {
        reference = getReference(dropTarget, immediate, clientX, clientY, drake.options.direction);
      } else if (drake.options.revertOnSpill === true && !_copy) {
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
      if (el) {
        el.classList.remove('gu-hide');
      }
    }

    function spillOut (el) {
      if (drake.dragging && el) {
        el.classList.add('gu-hide');
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

      drake.options.mirrorContainer.appendChild(_mirror);
      documentElement.addEventListener('pointermove', drag);
      drake.options.mirrorContainer.classList.add('gu-unselectable');
      drake.emit('cloned', {
        clone: _mirror,
        original: _item,
        type: 'mirror'
      });
    }

    function removeMirrorImage () {
      if (_mirror) {
        drake.options.mirrorContainer.classList.remove('gu-unselectable');
        documentElement.removeEventListener('pointermove', drag);
        _mirror.remove();
        _mirror = null;
      }
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
    moves: () => true,
    accepts: () => true,
    invalid: () => false,
    isContainer: () => false,
    copy: false,
    copySortSource: false,
    revertOnSpill: false,
    removeOnSpill: false,
    direction: 'vertical',
    ignoreInputTextSelection: true,
    mirrorContainer: document.body
  }
}

export const dragula = (...args) => (new Dragula(...args));
export default dragula;
