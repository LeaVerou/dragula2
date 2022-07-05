const documentElement = document.documentElement;

export function getImmediateChild (dropTarget, target) {
  let immediate = target;
  while (immediate !== dropTarget && getParent(immediate) !== dropTarget) {
    immediate = getParent(immediate);
  }
  if (immediate === documentElement) {
    return null;
  }
  return immediate;
}

export function getReference(dropTarget, target, x, y, direction) {
  const horizontal = direction === 'horizontal';
  return target !== dropTarget ? inside() : outside();

  function outside () { // slower, but able to figure out any position
    const len = dropTarget.children.length;
    for (let i = 0; i < len; i++) {
      const el = dropTarget.children[i];
      const rect = el.getBoundingClientRect();
      if (horizontal && (rect.left + rect.width / 2) > x) { return el; }
      if (!horizontal && (rect.top + rect.height / 2) > y) { return el; }
    }
    return null;
  }

  function inside () { // faster, but only available if dropped inside a child element
    const rect = target.getBoundingClientRect();
    if (horizontal) {
      return resolve(x > rect.left + rect.width / 2);
    }
    return resolve(y > rect.top + rect.height / 2);
  }

  function resolve (after) {
    return after ? target.nextElementSibling : target;
  }
}

export function getOffset (el) {
  const rect = el.getBoundingClientRect();

  return {
    left: rect.left + window.scrollX,
    top: rect.top + window.scrollY
  };
}

export function whichMouseButton (e) {
  if (e.touches !== void 0) { return e.touches.length; }
  if (e.which !== void 0 && e.which !== 0) { return e.which; } // see https://github.com/bevacqua/dragula/issues/261
  if (e.buttons !== void 0) { return e.buttons; }
  const button = e.button;
  if (button !== void 0) { // see https://github.com/jquery/jquery/blob/99e8ff1baa7ae341e94bb89c3e84570c7c3ad9ea/src/event.js#L573-L575
    return button & 1 ? 1 : button & 2 ? 3 : (button & 4 ? 2 : 0);
  }
}

export function getElementBehindPoint (point, x, y) {
  const pointEl = point || {};
  const state = pointEl.className || '';
  pointEl.className += ' gu-hide';
  const el = document.elementFromPoint(x, y);
  pointEl.className = state;
  return el;
}

export function getParent (el) { return el.parentNode === document ? null : el.parentNode; }
export function isInput (el) { return el?.matches('input, select, textarea') || isEditable(el); }
export function isEditable (el) {
  if (!el || el && el.contentEditable === 'false') { return false; } // no parents were editable or non editable
  if (el.contentEditable === 'true') { return true; } // found a contentEditable element in the chain
  return isEditable(getParent(el)); // contentEditable is set to 'inherit'
}
