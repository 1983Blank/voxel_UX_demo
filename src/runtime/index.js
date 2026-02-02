/**
 * Voxel Runtime - Core runtime for file-based prototypes
 *
 * This module exports all Web Components, state management,
 * and flow engine needed for interactive prototypes.
 */

// Core modules
export { VxStore } from './vx-store.js';
export { VxFlowEngine } from './vx-flow-engine.js';
export { VxComponent } from './base/vx-component.js';

// Form components
export { VxButton } from './components/forms/vx-button.js';
export { VxInput } from './components/forms/vx-input.js';
export { VxForm } from './components/forms/vx-form.js';
export { VxDropdown } from './components/forms/vx-dropdown.js';

// Layout components
export { VxModal } from './components/layout/vx-modal.js';
export { VxTabs } from './components/layout/vx-tabs.js';
export { VxAccordion } from './components/layout/vx-accordion.js';
export { VxStepper } from './components/layout/vx-stepper.js';

// Feedback components
export { VxToast } from './components/feedback/vx-toast.js';
export { VxLoading } from './components/feedback/vx-loading.js';

/**
 * Initialize the Voxel runtime
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.initialState - Initial state for VxStore
 * @param {Array} options.flows - Flow definitions for VxFlowEngine
 * @param {boolean} options.debug - Enable debug mode
 */
export function initVxRuntime(options = {}) {
  const { initialState = {}, flows = [], debug = false } = options;

  // Initialize global store
  if (typeof window !== 'undefined') {
    // Import VxStore class
    const { VxStore: VxStoreClass } = window.VxStoreClass
      ? { VxStore: window.VxStoreClass }
      : require('./vx-store.js');

    window.VxStore = new VxStoreClass(initialState);

    // Initialize flow engine if flows provided
    if (flows.length > 0) {
      const { VxFlowEngine: VxFlowEngineClass } = window.VxFlowEngine?.constructor
        ? { VxFlowEngine: window.VxFlowEngine.constructor }
        : require('./vx-flow-engine.js');

      window.VxFlowEngine = new VxFlowEngineClass(window.VxStore, flows, { debug });
    }

    if (debug) {
      console.log('[VxRuntime] Initialized with state:', initialState);
      console.log('[VxRuntime] Registered flows:', flows.map(f => f.name));
    }
  }

  return {
    store: window?.VxStore,
    flowEngine: window?.VxFlowEngine,
  };
}

/**
 * Generate runtime bundle code as a string for embedding in prototypes
 *
 * This is used by the generation system to include the runtime
 * in generated prototype files.
 */
export function getVxRuntimeBundle() {
  // In production, this would return the bundled/minified runtime code
  // For now, we return a placeholder that can be replaced during build
  return `
<!-- Voxel Runtime -->
<script type="module">
  // VxStore, VxComponent, and components will be bundled here
  // during prototype generation
</script>
  `.trim();
}

/**
 * List of all available component tag names
 */
export const VX_COMPONENTS = [
  'vx-button',
  'vx-input',
  'vx-form',
  'vx-dropdown',
  'vx-modal',
  'vx-tabs',
  'vx-accordion',
  'vx-stepper',
  'vx-toast',
  'vx-loading',
];

/**
 * Check if a tag name is a Voxel component
 */
export function isVxComponent(tagName) {
  return VX_COMPONENTS.includes(tagName.toLowerCase());
}

export default {
  VxStore: typeof window !== 'undefined' ? window.VxStore : null,
  VxFlowEngine: typeof window !== 'undefined' ? window.VxFlowEngine : null,
  initVxRuntime,
  getVxRuntimeBundle,
  VX_COMPONENTS,
  isVxComponent,
};
