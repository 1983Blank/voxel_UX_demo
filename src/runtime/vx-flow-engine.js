/**
 * VxFlowEngine - Flow execution engine for Voxel prototypes
 *
 * Executes user flows defined in JSON, managing state transitions,
 * delays, conditions, and template processing.
 */

class VxFlowEngine {
  constructor(store, flows = [], options = {}) {
    this._store = store;
    this._flows = flows;
    this._options = {
      debug: false,
      onFlowStart: null,
      onFlowEnd: null,
      onStepExecute: null,
      ...options
    };

    // Active flow execution tracking
    this._activeFlows = new Map();

    // Event listeners
    this._eventListeners = new Map();

    // Initialize event listeners for flows
    this._setupFlowTriggers();
  }

  // ============ Public API ============

  /**
   * Load flows from JSON definition
   */
  loadFlows(flows) {
    this._flows = flows;
    this._setupFlowTriggers();
  }

  /**
   * Add a single flow
   */
  addFlow(flow) {
    this._flows.push(flow);
    this._setupFlowTrigger(flow);
  }

  /**
   * Execute a flow by name
   * @param {string} flowName - Name of the flow to execute
   * @param {Object} context - Additional context data
   * @returns {Promise<boolean>} Whether flow completed successfully
   */
  async executeFlow(flowName, context = {}) {
    const flow = this._flows.find(f => f.name === flowName);

    if (!flow) {
      console.warn(`[VxFlowEngine] Flow not found: ${flowName}`);
      return false;
    }

    // Check if flow is already running
    if (this._activeFlows.has(flowName)) {
      this._log(`Flow already running: ${flowName}`);
      return false;
    }

    // Check flow conditions
    if (flow.when && !this._evaluateCondition(flow.when)) {
      this._log(`Flow condition not met: ${flowName}`);
      return false;
    }

    // Mark flow as active
    const flowContext = {
      name: flowName,
      startTime: Date.now(),
      currentStep: 0,
      context,
      aborted: false
    };
    this._activeFlows.set(flowName, flowContext);

    this._log(`Starting flow: ${flowName}`);
    this._options.onFlowStart?.(flowName, flowContext);

    try {
      // Execute each step
      for (let i = 0; i < flow.steps.length; i++) {
        if (flowContext.aborted) {
          this._log(`Flow aborted: ${flowName}`);
          break;
        }

        flowContext.currentStep = i;
        const step = flow.steps[i];

        await this._executeStep(step, flowContext);
      }

      this._log(`Completed flow: ${flowName}`);
      this._options.onFlowEnd?.(flowName, flowContext, true);
      return true;

    } catch (error) {
      console.error(`[VxFlowEngine] Error in flow ${flowName}:`, error);
      this._options.onFlowEnd?.(flowName, flowContext, false, error);
      return false;

    } finally {
      this._activeFlows.delete(flowName);
    }
  }

  /**
   * Abort a running flow
   */
  abortFlow(flowName) {
    const flowContext = this._activeFlows.get(flowName);
    if (flowContext) {
      flowContext.aborted = true;
      this._log(`Aborting flow: ${flowName}`);
    }
  }

  /**
   * Abort all running flows
   */
  abortAll() {
    this._activeFlows.forEach((_, name) => this.abortFlow(name));
  }

  /**
   * Check if a flow is currently running
   */
  isFlowRunning(flowName) {
    return this._activeFlows.has(flowName);
  }

  /**
   * Get list of active flows
   */
  getActiveFlows() {
    return Array.from(this._activeFlows.keys());
  }

  /**
   * Trigger a flow via event
   */
  trigger(eventName, data = {}) {
    this._log(`Trigger event: ${eventName}`);

    // Find flows that respond to this event
    this._flows.forEach(flow => {
      if (flow.trigger?.event === eventName) {
        // Check trigger condition
        if (flow.trigger.when && !this._evaluateCondition(flow.trigger.when)) {
          return;
        }
        this.executeFlow(flow.name, { ...data, triggerEvent: eventName });
      }
    });
  }

  /**
   * Clean up engine
   */
  destroy() {
    this.abortAll();
    this._eventListeners.forEach((listener, element) => {
      element.removeEventListener(listener.event, listener.handler);
    });
    this._eventListeners.clear();
  }

  // ============ Step Execution ============

  async _executeStep(step, flowContext) {
    this._log(`Executing step: ${JSON.stringify(step)}`);
    this._options.onStepExecute?.(step, flowContext);

    // Handle different step types

    // Set state value
    if (step.set !== undefined) {
      const value = this._processValue(step.to, flowContext);
      this._store.set(step.set, value);
    }

    // Toggle boolean
    if (step.toggle !== undefined) {
      this._store.toggle(step.toggle);
    }

    // Increment number
    if (step.increment !== undefined) {
      this._store.increment(step.increment, step.by ?? 1);
    }

    // Push to array
    if (step.push !== undefined) {
      const value = this._processValue(step.value, flowContext);
      this._store.push(step.push, value);
    }

    // Remove from array
    if (step.remove !== undefined) {
      this._store.remove(step.remove, step.at ?? step.where);
    }

    // Simple delay
    if (step.delay !== undefined) {
      await this._delay(step.delay);
    }

    // Delayed action (after)
    if (step.after !== undefined) {
      const afterStep = { ...step };
      delete afterStep.after;

      setTimeout(() => {
        this._executeStep(afterStep, flowContext);
      }, step.after);
    }

    // Conditional execution
    if (step.if !== undefined) {
      if (this._evaluateCondition(step.if)) {
        if (step.then) {
          for (const thenStep of step.then) {
            await this._executeStep(thenStep, flowContext);
          }
        }
      } else if (step.else) {
        for (const elseStep of step.else) {
          await this._executeStep(elseStep, flowContext);
        }
      }
    }

    // Loop execution
    if (step.repeat !== undefined) {
      const count = this._processValue(step.repeat, flowContext);
      for (let i = 0; i < count; i++) {
        for (const loopStep of step.steps || []) {
          await this._executeStep(loopStep, { ...flowContext, loopIndex: i });
        }
      }
    }

    // Execute another flow
    if (step.flow !== undefined) {
      await this.executeFlow(step.flow, flowContext.context);
    }

    // Dispatch custom event
    if (step.dispatch !== undefined) {
      const detail = step.detail ? this._processValue(step.detail, flowContext) : {};
      const event = new CustomEvent(step.dispatch, {
        bubbles: true,
        composed: true,
        detail
      });
      document.dispatchEvent(event);
    }

    // Log for debugging
    if (step.log !== undefined) {
      const message = this._processValue(step.log, flowContext);
      console.log(`[VxFlow] ${message}`);
    }

    // Emit analytics event
    if (step.analytics !== undefined) {
      const eventData = this._processValue(step.data || {}, flowContext);
      this._emitAnalytics(step.analytics, eventData);
    }

    // Wait for condition
    if (step.waitFor !== undefined) {
      await this._waitForCondition(step.waitFor, step.timeout || 10000);
    }
  }

  // ============ Value Processing ============

  _processValue(value, flowContext) {
    if (typeof value !== 'string') return value;

    // Handle template expressions: {{...}}
    return value.replace(/\{\{(.+?)\}\}/g, (match, expr) => {
      return this._evaluateExpression(expr.trim(), flowContext);
    });
  }

  _evaluateExpression(expr, flowContext) {
    // Random string: random:6
    if (expr.startsWith('random:')) {
      const length = parseInt(expr.split(':')[1]) || 6;
      return this._generateRandom(length);
    }

    // Random number: randomInt:1:100
    if (expr.startsWith('randomInt:')) {
      const [, min, max] = expr.split(':').map(Number);
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Current timestamp
    if (expr === 'timestamp') {
      return Date.now();
    }

    // Date formatting
    if (expr === 'date') {
      return new Date().toLocaleDateString();
    }

    if (expr === 'time') {
      return new Date().toLocaleTimeString();
    }

    if (expr === 'datetime') {
      return new Date().toLocaleString();
    }

    // UUID-like
    if (expr === 'uuid') {
      return this._generateUUID();
    }

    // Loop index
    if (expr === 'index') {
      return flowContext.loopIndex ?? 0;
    }

    // Context data
    if (expr.startsWith('context.')) {
      const path = expr.substring(8);
      return this._getPath(flowContext.context, path);
    }

    // State value
    if (expr.startsWith('state.')) {
      const path = expr.substring(6);
      return this._store.get(path);
    }

    // Direct state path (no prefix)
    return this._store.get(expr);
  }

  _evaluateCondition(condition) {
    if (typeof condition === 'string') {
      // Simple state path check (truthy)
      return !!this._store.get(condition);
    }

    if (typeof condition === 'object') {
      // Object with path: value pairs (all must match)
      return Object.entries(condition).every(([path, expected]) => {
        const actual = this._store.get(path);

        // Handle special operators
        if (typeof expected === 'object' && expected !== null) {
          if (expected.$ne !== undefined) return actual !== expected.$ne;
          if (expected.$gt !== undefined) return actual > expected.$gt;
          if (expected.$gte !== undefined) return actual >= expected.$gte;
          if (expected.$lt !== undefined) return actual < expected.$lt;
          if (expected.$lte !== undefined) return actual <= expected.$lte;
          if (expected.$in !== undefined) return expected.$in.includes(actual);
          if (expected.$nin !== undefined) return !expected.$nin.includes(actual);
          if (expected.$exists !== undefined) return (actual !== undefined) === expected.$exists;
        }

        return actual === expected;
      });
    }

    return false;
  }

  // ============ Helpers ============

  _setupFlowTriggers() {
    this._flows.forEach(flow => this._setupFlowTrigger(flow));
  }

  _setupFlowTrigger(flow) {
    if (!flow.trigger) return;

    const { event, selector } = flow.trigger;

    if (selector) {
      // DOM element trigger
      document.querySelectorAll(selector).forEach(element => {
        const handler = (e) => {
          if (flow.trigger.preventDefault) {
            e.preventDefault();
          }
          this.trigger(event, { element, event: e });
        };

        element.addEventListener(event, handler);
        this._eventListeners.set(element, { event, handler });
      });
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async _waitForCondition(condition, timeout) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this._evaluateCondition(condition)) {
        return true;
      }
      await this._delay(100);
    }

    console.warn(`[VxFlowEngine] Wait timeout for condition: ${JSON.stringify(condition)}`);
    return false;
  }

  _generateRandom(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  _getPath(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  _emitAnalytics(eventName, data) {
    // Dispatch analytics event that can be captured by parent frame
    window.dispatchEvent(new CustomEvent('vx-analytics', {
      detail: { event: eventName, data, timestamp: Date.now() }
    }));

    // Also try postMessage for iframe communication
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'vx-analytics',
        event: eventName,
        data,
        timestamp: Date.now()
      }, '*');
    }
  }

  _log(message) {
    if (this._options.debug) {
      console.log(`[VxFlowEngine] ${message}`);
    }
  }
}

// Static factory method for creating from JSON
VxFlowEngine.fromJSON = function(store, json) {
  const config = typeof json === 'string' ? JSON.parse(json) : json;
  return new VxFlowEngine(store, config.flows || [], config.options || {});
};

// Export for both ES modules and browser global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VxFlowEngine };
}

if (typeof window !== 'undefined') {
  window.VxFlowEngine = VxFlowEngine;
}

export { VxFlowEngine };
export default VxFlowEngine;
