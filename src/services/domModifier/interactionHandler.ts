/**
 * Interaction Handler - Processes interaction tool calls and injects JavaScript
 *
 * This module handles interaction tools like:
 * - add_click_toggle: Connect trigger elements to show/hide targets
 * - set_initial_hidden: Hide elements initially
 * - add_hover_effect: Show elements on hover
 * - add_tab_interaction: Tab navigation
 * - add_accordion_interaction: Accordion behavior
 */

import type { Modification } from '@/types/toolSchema';

export interface InteractionResult {
  success: boolean;
  error?: string;
}

/**
 * Check if a tool is an interaction tool
 */
export function isInteractionTool(tool: string): boolean {
  const interactionTools = [
    'add_click_toggle',
    'set_initial_hidden',
    'add_hover_effect',
    'add_tab_interaction',
    'add_accordion_interaction',
    'add_form_validation',
  ];
  return interactionTools.includes(tool);
}

/**
 * Interaction configuration stored for later JavaScript injection
 */
export interface ClickToggleConfig {
  triggerSelector: string;
  targetSelector: string;
  closeOnClickOutside?: boolean;
  closeButtonSelector?: string;
}

export interface HoverEffectConfig {
  triggerSelector: string;
  targetSelector: string;
  showDelay?: number;
  hideDelay?: number;
}

export interface TabInteractionConfig {
  tabsSelector: string;
  panelsSelector: string;
  activeClass?: string;
}

export interface AccordionConfig {
  containerSelector: string;
  headerSelector: string;
  contentSelector: string;
  allowMultiple?: boolean;
}

export interface FormValidationConfig {
  formSelector: string;
  submitButtonSelector?: string;
  errorClass?: string;
}

export interface InteractionState {
  hiddenSelectors: string[];
  clickToggles: ClickToggleConfig[];
  hoverEffects: HoverEffectConfig[];
  tabInteractions: TabInteractionConfig[];
  accordions: AccordionConfig[];
  formValidations: FormValidationConfig[];
}

/**
 * Create a fresh interaction state
 */
export function createInteractionState(): InteractionState {
  return {
    hiddenSelectors: [],
    clickToggles: [],
    hoverEffects: [],
    tabInteractions: [],
    accordions: [],
    formValidations: [],
  };
}

/**
 * Process an interaction tool call and update the state
 */
export function processInteractionTool(
  mod: Modification,
  state: InteractionState
): InteractionResult {
  const { tool, params } = mod;

  switch (tool) {
    case 'set_initial_hidden': {
      const selector = params.selector as string;
      if (!selector) {
        return { success: false, error: 'set_initial_hidden requires selector' };
      }
      state.hiddenSelectors.push(selector);
      return { success: true };
    }

    case 'add_click_toggle': {
      const triggerSelector = params.triggerSelector as string;
      const targetSelector = params.targetSelector as string;
      if (!triggerSelector || !targetSelector) {
        return { success: false, error: 'add_click_toggle requires triggerSelector and targetSelector' };
      }
      state.clickToggles.push({
        triggerSelector,
        targetSelector,
        closeOnClickOutside: params.closeOnClickOutside as boolean | undefined,
        closeButtonSelector: params.closeButtonSelector as string | undefined,
      });
      return { success: true };
    }

    case 'add_hover_effect': {
      const triggerSelector = params.triggerSelector as string;
      const targetSelector = params.targetSelector as string;
      if (!triggerSelector || !targetSelector) {
        return { success: false, error: 'add_hover_effect requires triggerSelector and targetSelector' };
      }
      state.hoverEffects.push({
        triggerSelector,
        targetSelector,
        showDelay: params.showDelay as number | undefined,
        hideDelay: params.hideDelay as number | undefined,
      });
      return { success: true };
    }

    case 'add_tab_interaction': {
      const tabsSelector = params.tabsSelector as string;
      const panelsSelector = params.panelsSelector as string;
      if (!tabsSelector || !panelsSelector) {
        return { success: false, error: 'add_tab_interaction requires tabsSelector and panelsSelector' };
      }
      state.tabInteractions.push({
        tabsSelector,
        panelsSelector,
        activeClass: params.activeClass as string | undefined,
      });
      return { success: true };
    }

    case 'add_accordion_interaction': {
      const containerSelector = params.containerSelector as string;
      const headerSelector = params.headerSelector as string;
      const contentSelector = params.contentSelector as string;
      if (!containerSelector || !headerSelector || !contentSelector) {
        return { success: false, error: 'add_accordion_interaction requires containerSelector, headerSelector, contentSelector' };
      }
      state.accordions.push({
        containerSelector,
        headerSelector,
        contentSelector,
        allowMultiple: params.allowMultiple as boolean | undefined,
      });
      return { success: true };
    }

    case 'add_form_validation': {
      const formSelector = params.formSelector as string;
      if (!formSelector) {
        return { success: false, error: 'add_form_validation requires formSelector' };
      }
      state.formValidations.push({
        formSelector,
        submitButtonSelector: params.submitButtonSelector as string | undefined,
        errorClass: params.errorClass as string | undefined,
      });
      return { success: true };
    }

    default:
      return { success: false, error: `Unknown interaction tool: ${tool}` };
  }
}

/**
 * Generate JavaScript code from interaction state
 * This script will be injected into the HTML
 */
export function generateInteractionScript(state: InteractionState): string {
  const parts: string[] = [];

  // Opening IIFE
  parts.push(`(function() {
  'use strict';

  // Wait for DOM ready
  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  ready(function() {
    console.log('[VxInteractions] Initializing interactions...');
`);

  // Hide initially hidden elements
  if (state.hiddenSelectors.length > 0) {
    parts.push(`
    // Hide initially hidden elements
    var hiddenSelectors = ${JSON.stringify(state.hiddenSelectors)};
    hiddenSelectors.forEach(function(selector) {
      var el = document.querySelector(selector);
      if (el) {
        el.style.display = 'none';
        el.setAttribute('data-vx-hidden', 'true');
        console.log('[VxInteractions] Hidden:', selector);
      } else {
        console.warn('[VxInteractions] Element not found for hiding:', selector);
      }
    });
`);
  }

  // Click toggles
  if (state.clickToggles.length > 0) {
    parts.push(`
    // Click toggle interactions
    var clickToggles = ${JSON.stringify(state.clickToggles)};
    clickToggles.forEach(function(config) {
      var trigger = document.querySelector(config.triggerSelector);
      var target = document.querySelector(config.targetSelector);

      if (!trigger) {
        console.warn('[VxInteractions] Trigger not found:', config.triggerSelector);
        return;
      }
      if (!target) {
        console.warn('[VxInteractions] Target not found:', config.targetSelector);
        return;
      }

      // Show/hide function
      function toggleTarget() {
        var isHidden = target.style.display === 'none' || target.getAttribute('data-vx-hidden') === 'true';
        if (isHidden) {
          target.style.display = '';
          target.removeAttribute('data-vx-hidden');
          target.classList.add('vx-visible');
          console.log('[VxInteractions] Showing:', config.targetSelector);
        } else {
          target.style.display = 'none';
          target.setAttribute('data-vx-hidden', 'true');
          target.classList.remove('vx-visible');
          console.log('[VxInteractions] Hiding:', config.targetSelector);
        }
      }

      function hideTarget() {
        target.style.display = 'none';
        target.setAttribute('data-vx-hidden', 'true');
        target.classList.remove('vx-visible');
      }

      // Trigger click
      trigger.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleTarget();
      });

      // Close button
      if (config.closeButtonSelector) {
        var closeBtn = target.querySelector(config.closeButtonSelector);
        if (closeBtn) {
          closeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            hideTarget();
          });
        }
      }

      // Close on click outside
      if (config.closeOnClickOutside !== false) {
        document.addEventListener('click', function(e) {
          if (!target.contains(e.target) && !trigger.contains(e.target)) {
            var isVisible = target.style.display !== 'none' && target.getAttribute('data-vx-hidden') !== 'true';
            if (isVisible) {
              hideTarget();
            }
          }
        });
      }

      console.log('[VxInteractions] Click toggle configured:', config.triggerSelector, '->', config.targetSelector);
    });
`);
  }

  // Hover effects
  if (state.hoverEffects.length > 0) {
    parts.push(`
    // Hover effects
    var hoverEffects = ${JSON.stringify(state.hoverEffects)};
    hoverEffects.forEach(function(config) {
      var trigger = document.querySelector(config.triggerSelector);
      var target = document.querySelector(config.targetSelector);
      var showTimer, hideTimer;
      var showDelay = config.showDelay || 0;
      var hideDelay = config.hideDelay || 200;

      if (!trigger || !target) {
        console.warn('[VxInteractions] Hover elements not found');
        return;
      }

      trigger.addEventListener('mouseenter', function() {
        clearTimeout(hideTimer);
        showTimer = setTimeout(function() {
          target.style.display = '';
          target.removeAttribute('data-vx-hidden');
        }, showDelay);
      });

      trigger.addEventListener('mouseleave', function() {
        clearTimeout(showTimer);
        hideTimer = setTimeout(function() {
          target.style.display = 'none';
          target.setAttribute('data-vx-hidden', 'true');
        }, hideDelay);
      });

      console.log('[VxInteractions] Hover effect configured:', config.triggerSelector);
    });
`);
  }

  // Tab interactions
  if (state.tabInteractions.length > 0) {
    parts.push(`
    // Tab interactions
    var tabInteractions = ${JSON.stringify(state.tabInteractions)};
    tabInteractions.forEach(function(config) {
      var tabsContainer = document.querySelector(config.tabsSelector);
      var panelsContainer = document.querySelector(config.panelsSelector);
      var activeClass = config.activeClass || 'active';

      if (!tabsContainer || !panelsContainer) {
        console.warn('[VxInteractions] Tab containers not found');
        return;
      }

      var tabs = tabsContainer.children;
      var panels = panelsContainer.children;

      Array.from(tabs).forEach(function(tab, index) {
        tab.addEventListener('click', function(e) {
          e.preventDefault();

          // Remove active from all tabs
          Array.from(tabs).forEach(function(t) { t.classList.remove(activeClass); });
          // Hide all panels
          Array.from(panels).forEach(function(p) { p.style.display = 'none'; });

          // Activate clicked tab
          tab.classList.add(activeClass);
          if (panels[index]) {
            panels[index].style.display = '';
          }
        });
      });

      // Activate first tab
      if (tabs[0] && panels[0]) {
        tabs[0].classList.add(activeClass);
        Array.from(panels).forEach(function(p, i) {
          p.style.display = i === 0 ? '' : 'none';
        });
      }

      console.log('[VxInteractions] Tab interaction configured');
    });
`);
  }

  // Accordions
  if (state.accordions.length > 0) {
    parts.push(`
    // Accordion interactions
    var accordions = ${JSON.stringify(state.accordions)};
    accordions.forEach(function(config) {
      var container = document.querySelector(config.containerSelector);
      if (!container) {
        console.warn('[VxInteractions] Accordion container not found');
        return;
      }

      var headers = container.querySelectorAll(config.headerSelector);
      var contents = container.querySelectorAll(config.contentSelector);
      var allowMultiple = config.allowMultiple || false;

      // Initially hide all content
      contents.forEach(function(c) { c.style.display = 'none'; });

      headers.forEach(function(header, index) {
        header.addEventListener('click', function(e) {
          e.preventDefault();
          var content = contents[index];
          if (!content) return;

          var isOpen = content.style.display !== 'none';

          if (!allowMultiple) {
            // Close all others
            contents.forEach(function(c) { c.style.display = 'none'; });
            headers.forEach(function(h) { h.classList.remove('active'); });
          }

          if (isOpen) {
            content.style.display = 'none';
            header.classList.remove('active');
          } else {
            content.style.display = '';
            header.classList.add('active');
          }
        });
      });

      console.log('[VxInteractions] Accordion configured');
    });
`);
  }

  // Form validation
  if (state.formValidations.length > 0) {
    parts.push(`
    // Form validation
    var formValidations = ${JSON.stringify(state.formValidations)};
    formValidations.forEach(function(config) {
      var form = document.querySelector(config.formSelector);
      if (!form) {
        console.warn('[VxInteractions] Form not found');
        return;
      }

      var errorClass = config.errorClass || 'error';

      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var isValid = true;
        var requiredInputs = form.querySelectorAll('[required]');

        requiredInputs.forEach(function(input) {
          input.classList.remove(errorClass);
          if (!input.value.trim()) {
            input.classList.add(errorClass);
            isValid = false;
          }
        });

        if (isValid) {
          console.log('[VxInteractions] Form valid, would submit');
          // In a real app, this would submit the form
          alert('Form submitted successfully!');
        } else {
          console.log('[VxInteractions] Form validation failed');
        }
      });

      console.log('[VxInteractions] Form validation configured');
    });
`);
  }

  // Close IIFE
  parts.push(`
    console.log('[VxInteractions] Initialization complete');
  });
})();
`);

  return parts.join('');
}

/**
 * Inject interaction script into HTML document
 */
export function injectInteractionScript(doc: Document, state: InteractionState): void {
  // Only inject if there are interactions
  const hasInteractions =
    state.hiddenSelectors.length > 0 ||
    state.clickToggles.length > 0 ||
    state.hoverEffects.length > 0 ||
    state.tabInteractions.length > 0 ||
    state.accordions.length > 0 ||
    state.formValidations.length > 0;

  if (!hasInteractions) {
    console.log('[interactionHandler] No interactions to inject');
    return;
  }

  const scriptContent = generateInteractionScript(state);

  // Create script element
  const script = doc.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('data-vx-interactions', 'true');
  script.textContent = scriptContent;

  // Inject at end of body
  if (doc.body) {
    doc.body.appendChild(script);
    console.log('[interactionHandler] Injected interaction script with', {
      hiddenCount: state.hiddenSelectors.length,
      clickToggles: state.clickToggles.length,
      hoverEffects: state.hoverEffects.length,
      tabs: state.tabInteractions.length,
      accordions: state.accordions.length,
      forms: state.formValidations.length,
    });
  } else {
    console.warn('[interactionHandler] No body element found to inject script');
  }
}

/**
 * Add CSS for interaction states (vx-visible class, error styles, etc.)
 */
export function injectInteractionStyles(doc: Document): void {
  const styleContent = `
/* VxInteractions - Styles for interactive prototypes */
.vx-visible {
  display: block !important;
}

/* Modal overlay styles */
.modal-overlay, [data-vx-modal], .modal, .dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Modal content - prevent overflow */
.modal-content, .modal-dialog, .dialog-content, [data-vx-modal-content] {
  background: white;
  border-radius: 8px;
  max-height: 90vh;
  max-width: 90vw;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

/* Side panel styles - fixed overflow issues */
.slide-panel, .side-panel, [data-vx-panel], .panel, .drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 400px;
  max-width: 90vw;
  background: white;
  z-index: 9998;
  box-shadow: -2px 0 10px rgba(0,0,0,0.2);
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

/* Panel content area - scrollable */
.panel-content, .side-panel-content, .drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* Panel footer with buttons - fixed at bottom, no overflow */
.panel-footer, .side-panel-footer, .drawer-footer, .panel-actions {
  flex-shrink: 0;
  padding: 16px;
  border-top: 1px solid #e0e0e0;
  background: white;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* Ensure buttons don't overflow */
.panel-footer button, .side-panel-footer button, .drawer-footer button,
.modal-footer button, .dialog-footer button {
  flex-shrink: 0;
  white-space: nowrap;
}

/* Close button positioning */
.close-btn, .close-button, .modal-close, .panel-close, [data-close] {
  position: absolute;
  top: 12px;
  right: 12px;
  background: transparent;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
  z-index: 1;
}

.close-btn:hover, .close-button:hover, .modal-close:hover, .panel-close:hover {
  background: rgba(0,0,0,0.1);
  border-radius: 4px;
}

/* Form error styles */
input.error, select.error, textarea.error {
  border-color: #dc3545 !important;
  background-color: #fff5f5 !important;
}

/* Accordion styles */
.accordion-header, [data-vx-accordion-header] {
  cursor: pointer;
  padding: 12px 16px;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  margin-bottom: -1px;
}

.accordion-header.active, [data-vx-accordion-header].active {
  background-color: #e8e8e8;
}

.accordion-content, [data-vx-accordion-content] {
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-top: none;
}

/* Tab styles */
.tab-list, .tabs {
  display: flex;
  border-bottom: 1px solid #e0e0e0;
}

.tab, .tab-button {
  padding: 12px 24px;
  cursor: pointer;
  border: none;
  background: transparent;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tab.active, .tab-button.active {
  border-bottom-color: #007bff;
  color: #007bff;
}

.tab-panel, .tab-content {
  padding: 16px;
}

/* Step/Progress indicator styles for task breakdowns */
.steps, .stepper, .progress-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step, .step-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.step:hover, .step-item:hover {
  background: #f0f0f0;
}

.step.active, .step-item.active {
  background: #e3f2fd;
  border-left: 3px solid #2196f3;
}

.step.completed, .step-item.completed {
  background: #e8f5e9;
}

.step-number, .step-indicator {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  flex-shrink: 0;
}

.step.active .step-number, .step-item.active .step-indicator {
  background: #2196f3;
  color: white;
}

.step.completed .step-number, .step-item.completed .step-indicator {
  background: #4caf50;
  color: white;
}

.step-content {
  flex: 1;
}

.step-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.step-description {
  color: #666;
  font-size: 14px;
}

/* Expandable/collapsible content */
.expandable-content, .collapsible-content {
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.expandable-content.collapsed, .collapsible-content.collapsed {
  max-height: 0;
}
`;

  // Check if already injected
  if (doc.querySelector('style[data-vx-interaction-styles]')) {
    return;
  }

  const style = doc.createElement('style');
  style.setAttribute('data-vx-interaction-styles', 'true');
  style.textContent = styleContent;

  if (doc.head) {
    doc.head.appendChild(style);
  } else if (doc.body) {
    doc.body.insertBefore(style, doc.body.firstChild);
  }
}
