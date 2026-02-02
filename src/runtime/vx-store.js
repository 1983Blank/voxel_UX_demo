/**
 * VxStore - Global state manager for Voxel prototypes
 *
 * A lightweight, reactive state management system for Web Components.
 * Supports dot-notation paths, subscription-based updates, and history for debugging.
 */

class VxStore {
  constructor(initialState = {}) {
    this._state = this._deepClone(initialState);
    this._subscribers = new Set();
    this._pathSubscribers = new Map(); // Path-specific subscribers
    this._history = [];
    this._historyLimit = 50;
    this._batchedUpdates = null;
    this._batchTimeout = null;
  }

  /**
   * Get a value from state using dot-notation path
   * @param {string} path - Dot-notation path (e.g., 'modal.open', 'form.email')
   * @returns {*} The value at the path, or undefined if not found
   */
  get(path) {
    if (!path) return this._state;
    return path.split('.').reduce((obj, key) => obj?.[key], this._state);
  }

  /**
   * Set a value in state using dot-notation path
   * @param {string} path - Dot-notation path
   * @param {*} value - Value to set
   * @param {Object} options - Options { silent: boolean, batch: boolean }
   */
  set(path, value, options = {}) {
    const { silent = false, batch = false } = options;

    // Save to history for undo/debugging
    if (!silent) {
      this._pushHistory();
    }

    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((obj, key) => {
      if (obj[key] === undefined || obj[key] === null) {
        obj[key] = {};
      }
      return obj[key];
    }, this._state);

    const oldValue = target[last];
    target[last] = value;

    if (!silent) {
      if (batch) {
        this._batchUpdate(path, oldValue, value);
      } else {
        this._notify(path, oldValue, value);
      }
    }

    return this;
  }

  /**
   * Update multiple values at once
   * @param {Object} updates - Object with path: value pairs
   */
  setMultiple(updates) {
    this._pushHistory();

    Object.entries(updates).forEach(([path, value]) => {
      this.set(path, value, { silent: true });
    });

    this._notify();
    return this;
  }

  /**
   * Toggle a boolean value
   * @param {string} path - Dot-notation path to boolean
   */
  toggle(path) {
    const current = this.get(path);
    if (typeof current === 'boolean') {
      this.set(path, !current);
    }
    return this;
  }

  /**
   * Increment a numeric value
   * @param {string} path - Dot-notation path to number
   * @param {number} amount - Amount to increment (default: 1)
   */
  increment(path, amount = 1) {
    const current = this.get(path);
    if (typeof current === 'number') {
      this.set(path, current + amount);
    }
    return this;
  }

  /**
   * Push an item to an array
   * @param {string} path - Dot-notation path to array
   * @param {*} item - Item to push
   */
  push(path, item) {
    const current = this.get(path);
    if (Array.isArray(current)) {
      this.set(path, [...current, item]);
    }
    return this;
  }

  /**
   * Remove an item from an array by index or predicate
   * @param {string} path - Dot-notation path to array
   * @param {number|function} indexOrPredicate - Index or filter function
   */
  remove(path, indexOrPredicate) {
    const current = this.get(path);
    if (Array.isArray(current)) {
      if (typeof indexOrPredicate === 'number') {
        const newArray = [...current];
        newArray.splice(indexOrPredicate, 1);
        this.set(path, newArray);
      } else if (typeof indexOrPredicate === 'function') {
        this.set(path, current.filter((item, idx) => !indexOrPredicate(item, idx)));
      }
    }
    return this;
  }

  /**
   * Subscribe to all state changes
   * @param {function} callback - Called with (state, changedPath, oldValue, newValue)
   * @returns {function} Unsubscribe function
   */
  subscribe(callback) {
    this._subscribers.add(callback);
    // Immediately call with current state
    callback(this._state, null, null, null);
    return () => this._subscribers.delete(callback);
  }

  /**
   * Subscribe to changes at a specific path
   * @param {string} path - Dot-notation path to watch
   * @param {function} callback - Called with (newValue, oldValue, state)
   * @returns {function} Unsubscribe function
   */
  subscribeTo(path, callback) {
    if (!this._pathSubscribers.has(path)) {
      this._pathSubscribers.set(path, new Set());
    }
    this._pathSubscribers.get(path).add(callback);

    // Immediately call with current value
    const currentValue = this.get(path);
    callback(currentValue, undefined, this._state);

    return () => {
      const subs = this._pathSubscribers.get(path);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this._pathSubscribers.delete(path);
        }
      }
    };
  }

  /**
   * Get the full state object (read-only clone)
   * @returns {Object} Deep clone of state
   */
  getState() {
    return this._deepClone(this._state);
  }

  /**
   * Reset state to initial or provided state
   * @param {Object} newState - New state (optional)
   */
  reset(newState = {}) {
    this._pushHistory();
    this._state = this._deepClone(newState);
    this._notify();
    return this;
  }

  /**
   * Undo the last state change
   * @returns {boolean} Whether undo was successful
   */
  undo() {
    if (this._history.length === 0) return false;
    this._state = this._history.pop();
    this._notify();
    return true;
  }

  /**
   * Get history for debugging
   * @returns {Array} Array of previous states
   */
  getHistory() {
    return this._history.map(s => this._deepClone(s));
  }

  /**
   * Clear history
   */
  clearHistory() {
    this._history = [];
    return this;
  }

  /**
   * Serialize state to JSON string
   * @returns {string} JSON string
   */
  toJSON() {
    return JSON.stringify(this._state, null, 2);
  }

  /**
   * Restore state from JSON string
   * @param {string} json - JSON string
   */
  fromJSON(json) {
    try {
      this._pushHistory();
      this._state = JSON.parse(json);
      this._notify();
      return true;
    } catch (e) {
      console.error('[VxStore] Failed to parse JSON:', e);
      return false;
    }
  }

  /**
   * Create a computed/derived value
   * @param {string[]} paths - Paths to watch
   * @param {function} compute - Function to compute derived value
   * @param {function} callback - Called when computed value changes
   * @returns {function} Unsubscribe function
   */
  computed(paths, compute, callback) {
    let lastValue = compute(this._state);
    callback(lastValue);

    return this.subscribe((state) => {
      const newValue = compute(state);
      if (!this._deepEqual(newValue, lastValue)) {
        lastValue = newValue;
        callback(newValue);
      }
    });
  }

  // Private methods

  _notify(changedPath = null, oldValue = null, newValue = null) {
    // Notify global subscribers
    this._subscribers.forEach(cb => {
      try {
        cb(this._state, changedPath, oldValue, newValue);
      } catch (e) {
        console.error('[VxStore] Subscriber error:', e);
      }
    });

    // Notify path-specific subscribers
    if (changedPath) {
      this._notifyPathSubscribers(changedPath, oldValue, newValue);
    } else {
      // Notify all path subscribers on reset/fromJSON
      this._pathSubscribers.forEach((subscribers, path) => {
        const value = this.get(path);
        subscribers.forEach(cb => {
          try {
            cb(value, undefined, this._state);
          } catch (e) {
            console.error('[VxStore] Path subscriber error:', e);
          }
        });
      });
    }
  }

  _notifyPathSubscribers(changedPath, oldValue, newValue) {
    // Check if any subscribed paths are affected
    this._pathSubscribers.forEach((subscribers, path) => {
      // Notify if the changed path is the subscribed path or a parent/child
      if (changedPath === path ||
          changedPath.startsWith(path + '.') ||
          path.startsWith(changedPath + '.')) {
        const currentValue = this.get(path);
        subscribers.forEach(cb => {
          try {
            cb(currentValue, path === changedPath ? oldValue : undefined, this._state);
          } catch (e) {
            console.error('[VxStore] Path subscriber error:', e);
          }
        });
      }
    });
  }

  _batchUpdate(path, oldValue, newValue) {
    if (!this._batchedUpdates) {
      this._batchedUpdates = [];
    }
    this._batchedUpdates.push({ path, oldValue, newValue });

    if (this._batchTimeout) {
      clearTimeout(this._batchTimeout);
    }

    this._batchTimeout = setTimeout(() => {
      const updates = this._batchedUpdates;
      this._batchedUpdates = null;
      this._batchTimeout = null;

      // Notify once for all batched updates
      this._notify();
    }, 0);
  }

  _pushHistory() {
    this._history.push(this._deepClone(this._state));
    if (this._history.length > this._historyLimit) {
      this._history.shift();
    }
  }

  _deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj);
    if (Array.isArray(obj)) return obj.map(item => this._deepClone(item));

    const cloned = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = this._deepClone(obj[key]);
      }
    }
    return cloned;
  }

  _deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;

    if (Array.isArray(a) !== Array.isArray(b)) return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every(key => this._deepEqual(a[key], b[key]));
  }
}

// Export for both ES modules and browser global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VxStore };
}

// Browser global - create default instance
if (typeof window !== 'undefined') {
  window.VxStore = window.VxStore || new VxStore();
  window.VxStoreClass = VxStore;
}

export { VxStore };
export default VxStore;
