// Yields to the next macrotask. Use this when a click handler triggers a
// React state update that unmounts the very element being clicked
// (Leaflet popups, ConfirmModal buttons, etc.) — running the action on
// the next tick lets the current event cycle complete cleanly first.
//
// Why setTimeout(0) and not queueMicrotask: microtasks finish before the
// next paint but still run inside the current task. Leaflet's internal
// event dispatcher continues after the click handler returns; we need to
// fully yield so the DOM teardown (map.remove() or modal unmount) happens
// after Leaflet/the modal have finished walking their handler chain.
export function defer(fn) {
  setTimeout(() => {
    try {
      fn();
    } catch (err) {
      console.error('Deferred callback threw', err);
    }
  }, 0);
}
