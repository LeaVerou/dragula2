import {
  getImmediateChild,
  getReference,
  getOffset,
  whichMouseButton,
  getElementBehindPoint,
  getParent,
  isInput,
} from './utils.js';

const { documentElement } = document;

class Dragula extends EventTarget {
  constructor (initialContainers, options) {
    super();
    let len = arguments.length;
    if (len === 1 && Array.isArray(initialContainers) === false) {
      [options, initialContainers] = [initialContainers, []];
    }

    const o = this.options = Object.assign({}, Dragula.defaultOptions, options);
    this.containers = o.containers = o.containers || initialContainers || [];

    if (typeof o.copy !== 'function') {
      let copy = o.copy;
      o.copy = () => copy;
    }

    this.dragging = false;

    let _mirror; // mirror image
    let _source; // source container
    let _item; // item being dragged
    let _offsetX; // reference x
    let _offsetY; // reference y
    let _moveX; // reference move x
    let _moveY; // reference move y
    let _initialSibling; // reference sibling when grabbed
    let _currentSibling; // reference sibling now
    let _copy; // item used for copying
    let _renderTimer; // timer for setTimeout renderMirrorImage
    let _lastDropTarget = null; // last container item was over
    let _grabbed; // holds pointerdown context until first pointermove

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
      documentElement[`${remove ? 'remove' : 'add'}EventListener`]('pointermove', startBecauseMouseMoved);
    }

    function movements (remove) {
      documentElement[`${remove ? 'remove' : 'add'}EventListener`]('click', preventGrabbed);
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

      const ignore = whichMouseButton(e) !== 1 || e.metaKey || e.ctrlKey;
      if (ignore) {
        return; // we only care about honest-to-god left clicks and touch events
      }
      const item = e.target;
      const context = canStart(item);
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
        const clientX = e.clientX || 0;
        const clientY = e.clientY || 0;
        const elementBehindCursor = document.elementFromPoint(clientX, clientY);

        if (isInput(elementBehindCursor)) {
          return;
        }
      }

      const grabbed = _grabbed; // call to end() unsets _grabbed
      eventualMovements(true);
      movements();
      end();
      start(grabbed);

      const offset = getOffset(_item);
      _offsetX = e.pageX - offset.left;
      _offsetY = e.pageY - offset.top;

      const inTransit = _copy || _item;
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
      const handle = item;
      while (getParent(item) && isContainer(getParent(item)) === false) {
        if (drake.options.invalid(item, handle)) {
          return;
        }
        item = getParent(item); // drag target should be a top element
        if (!item) {
          return;
        }
      }
      const source = getParent(item);
      if (!source) {
        return;
      }
      if (drake.options.invalid(item, handle)) {
        return;
      }

      const movable = drake.options.moves(item, source, handle, item.nextElementSibling);
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
      const context = canStart(item);
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
      const item = _copy || _item;
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
      const item = _copy || _item;
      const clientX = e.clientX || 0;
      const clientY = e.clientY || 0;
      const elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
      const dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);

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
      const item = _copy || _item;
      const parent = getParent(item);
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
      const reverts = arguments.length > 0 ? revert : drake.options.revertOnSpill;
      const item = _copy || _item;
      const parent = getParent(item);
      const initial = isInitialPlacement(parent);
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
      const item = _copy || _item;
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
      let sibling;
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
      let target = elementBehindCursor;
      while (target && !accepted()) {
        target = getParent(target);
      }
      return target;

      function accepted () {
        const droppable = isContainer(target);
        if (droppable === false) {
          return false;
        }

        const immediate = getImmediateChild(target, elementBehindCursor);
        const reference = getReference(target, immediate, clientX, clientY, drake.options.direction);
        const initial = isInitialPlacement(target, reference);
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

      const clientX = e.clientX || 0;
      const clientY = e.clientY || 0;
      const x = clientX - _offsetX;
      const y = clientY - _offsetY;

      _mirror.style.left = x + 'px';
      _mirror.style.top = y + 'px';

      const item = _copy || _item;
      const elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
      const dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
      const changed = dropTarget !== null && dropTarget !== _lastDropTarget;
      if (changed || dropTarget === null) {
        out();
        _lastDropTarget = dropTarget;
        over();
      }
      const parent = getParent(item);
      if (dropTarget === _source && _copy && !drake.options.copySortSource) {
        if (parent) {
          item.remove();
        }
        return;
      }
      let reference;
      const immediate = getImmediateChild(dropTarget, elementBehindCursor);
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
      const rect = _item.getBoundingClientRect();
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
    this.addEventListener(eventType, evt => callback.call(this, ...Object.values(evt.detail)));

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
