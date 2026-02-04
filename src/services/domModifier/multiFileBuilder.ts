/**
 * Multi-File Builder - Builds multi-screen prototype bundles
 *
 * Handles:
 * - Screen creation and management
 * - Navigation between screens
 * - Route definitions
 * - Bundle generation
 */

import type {
  ModificationSpec,
  NavigationConfig,
  NavigationManifest,
  PrototypeBundle,
  Route,
  Modification,
} from '@/types/toolSchema';

/**
 * Navigation script template for multi-screen prototypes
 */
const NAVIGATION_SCRIPT_TEMPLATE = `
(function() {
  // Voxel Prototype Navigation Runtime
  const VxNav = {
    routes: __ROUTES__,
    defaultScreen: '__DEFAULT_SCREEN__',
    defaultTransition: '__DEFAULT_TRANSITION__',
    currentScreen: null,
    history: [],

    init() {
      this.currentScreen = this.getScreenFromUrl() || this.defaultScreen;
      this.bindNavigationLinks();
      this.handlePopState();
    },

    getScreenFromUrl() {
      const path = window.location.pathname;
      for (const route of this.routes) {
        const pattern = this.pathToRegex(route.path);
        if (pattern.test(path)) {
          return route.screenId;
        }
      }
      return null;
    },

    pathToRegex(path) {
      const pattern = path
        .replace(/:[^/]+/g, '([^/]+)')
        .replace(/\\//g, '\\\\/');
      return new RegExp('^' + pattern + '$');
    },

    navigate(screenId, params = {}, transition = this.defaultTransition) {
      if (screenId === this.currentScreen) return;

      const route = this.routes.find(r => r.screenId === screenId);
      const url = route ? this.buildUrl(route.path, params) : '/' + screenId + '.html';

      this.history.push(this.currentScreen);
      this.currentScreen = screenId;

      this.transition(url, transition);
    },

    back(transition = 'slide-right') {
      if (this.history.length === 0) return;
      const prevScreen = this.history.pop();
      this.navigate(prevScreen, {}, transition);
    },

    buildUrl(path, params) {
      let url = path;
      for (const [key, value] of Object.entries(params)) {
        url = url.replace(':' + key, encodeURIComponent(String(value)));
      }
      return url;
    },

    transition(url, type) {
      const body = document.body;

      switch(type) {
        case 'fade':
          body.style.opacity = '0';
          setTimeout(() => {
            window.location.href = url;
          }, 200);
          break;

        case 'slide-left':
          body.style.transform = 'translateX(-100%)';
          body.style.transition = 'transform 0.3s ease-out';
          setTimeout(() => {
            window.location.href = url;
          }, 300);
          break;

        case 'slide-right':
          body.style.transform = 'translateX(100%)';
          body.style.transition = 'transform 0.3s ease-out';
          setTimeout(() => {
            window.location.href = url;
          }, 300);
          break;

        case 'slide-up':
          body.style.transform = 'translateY(-100%)';
          body.style.transition = 'transform 0.3s ease-out';
          setTimeout(() => {
            window.location.href = url;
          }, 300);
          break;

        case 'slide-down':
          body.style.transform = 'translateY(100%)';
          body.style.transition = 'transform 0.3s ease-out';
          setTimeout(() => {
            window.location.href = url;
          }, 300);
          break;

        default:
          window.location.href = url;
      }
    },

    bindNavigationLinks() {
      document.querySelectorAll('[data-vx-nav]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const screen = el.getAttribute('data-vx-nav');
          const transition = el.getAttribute('data-vx-transition') || this.defaultTransition;
          const params = JSON.parse(el.getAttribute('data-vx-params') || '{}');
          this.navigate(screen, params, transition);
        });
      });

      document.querySelectorAll('[data-vx-back]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const transition = el.getAttribute('data-vx-transition') || 'slide-right';
          this.back(transition);
        });
      });
    },

    handlePopState() {
      window.addEventListener('popstate', () => {
        const screen = this.getScreenFromUrl();
        if (screen && screen !== this.currentScreen) {
          this.currentScreen = screen;
        }
      });
    }
  };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VxNav.init());
  } else {
    VxNav.init();
  }

  // Expose globally for programmatic access
  window.VxNav = VxNav;
})();
`;

/**
 * Build navigation manifest from spec
 */
export function buildNavigationManifest(
  config: NavigationConfig | undefined,
  screens: Map<string, string>
): NavigationManifest {
  const screenIds = Array.from(screens.keys());

  if (!config) {
    // Default: each screen gets a simple route
    return {
      routes: screenIds.map(id => ({
        path: id === 'main' ? '/' : `/${id}`,
        screenId: id,
      })),
      defaultScreen: screenIds.includes('main') ? 'main' : screenIds[0] || 'main',
      defaultTransition: 'instant',
      screens: screenIds,
    };
  }

  return {
    routes: config.routes,
    defaultScreen: config.defaultScreen,
    defaultTransition: config.defaultTransition || 'instant',
    screens: screenIds,
  };
}

/**
 * Generate navigation JavaScript
 */
export function generateNavigationScript(manifest: NavigationManifest): string {
  return NAVIGATION_SCRIPT_TEMPLATE
    .replace('__ROUTES__', JSON.stringify(manifest.routes))
    .replace('__DEFAULT_SCREEN__', manifest.defaultScreen)
    .replace('__DEFAULT_TRANSITION__', manifest.defaultTransition);
}

/**
 * Inject navigation script into HTML
 */
export function injectNavigationScript(
  html: string,
  script: string
): string {
  // Find </body> and inject before it
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose === -1) {
    // No body tag, append to end
    return html + `<script>${script}</script>`;
  }

  return (
    html.substring(0, bodyClose) +
    `<script>${script}</script>` +
    html.substring(bodyClose)
  );
}

/**
 * Add navigation data attributes to element in HTML
 */
export function addNavigationToElement(
  doc: Document,
  selector: string,
  targetScreen: string,
  transition?: string,
  params?: Record<string, unknown>
): boolean {
  const element = doc.querySelector(selector);
  if (!element) return false;

  element.setAttribute('data-vx-nav', targetScreen);

  if (transition) {
    element.setAttribute('data-vx-transition', transition);
  }

  if (params && Object.keys(params).length > 0) {
    element.setAttribute('data-vx-params', JSON.stringify(params));
  }

  // Remove href if it's a link to prevent default navigation
  if (element.tagName.toLowerCase() === 'a') {
    element.setAttribute('href', '#');
  }

  return true;
}

/**
 * Add back navigation to element
 */
export function addBackNavigation(
  doc: Document,
  selector: string,
  transition?: string
): boolean {
  const element = doc.querySelector(selector);
  if (!element) return false;

  element.setAttribute('data-vx-back', 'true');

  if (transition) {
    element.setAttribute('data-vx-transition', transition);
  }

  if (element.tagName.toLowerCase() === 'a') {
    element.setAttribute('href', '#');
  }

  return true;
}

/**
 * Generate navigation menu HTML
 */
export function generateNavMenuHTML(
  items: Array<{ label: string; screenId: string; icon?: string }>,
  style: 'horizontal' | 'vertical' | 'tabs' | 'dropdown'
): string {
  const itemsHtml = items.map(item => {
    const icon = item.icon ? `<span class="nav-icon">${item.icon}</span>` : '';
    return `<a href="#" data-vx-nav="${item.screenId}" class="nav-item">${icon}${item.label}</a>`;
  }).join('');

  const className = `vx-nav vx-nav-${style}`;
  return `<nav class="${className}">${itemsHtml}</nav>`;
}

/**
 * Generate breadcrumb HTML
 */
export function generateBreadcrumbHTML(
  items: Array<{ label: string; screenId?: string }>
): string {
  const itemsHtml = items.map((item, i) => {
    const isLast = i === items.length - 1;
    if (isLast || !item.screenId) {
      return `<span class="breadcrumb-item current">${item.label}</span>`;
    }
    return `<a href="#" data-vx-nav="${item.screenId}" class="breadcrumb-item">${item.label}</a>`;
  }).join('<span class="breadcrumb-separator">/</span>');

  return `<nav class="vx-breadcrumb">${itemsHtml}</nav>`;
}

/**
 * Build complete prototype bundle
 */
export function buildPrototypeBundle(
  screens: Map<string, string>,
  navigation: NavigationManifest,
  spec: ModificationSpec
): PrototypeBundle {
  const files = new Map<string, string>();

  // Generate navigation script
  const navScript = generateNavigationScript(navigation);

  // Create HTML file per screen with navigation injected
  for (const [screenId, html] of screens) {
    const filename = `${screenId}.html`;
    const withNav = injectNavigationScript(html, navScript);
    files.set(filename, withNav);
  }

  // Store spec as JSON for editing
  files.set('_spec.json', JSON.stringify(spec, null, 2));

  // Determine entry point
  const entryPoint = `${navigation.defaultScreen}.html`;

  return {
    files,
    entryPoint,
    manifest: {
      screens: Array.from(screens.keys()),
      routes: navigation.routes,
      defaultScreen: navigation.defaultScreen,
    },
    spec,
  };
}

/**
 * Extract navigation config from modifications
 */
export function extractNavigationConfig(
  modifications: Modification[]
): NavigationConfig {
  const routes: Route[] = [];
  let defaultScreen = 'main';

  for (const mod of modifications) {
    if (mod.tool === 'define_route') {
      routes.push({
        path: mod.params.path as string,
        screenId: mod.params.screenId as string,
      });
    }

    if (mod.tool === 'set_default_screen') {
      defaultScreen = mod.params.screenId as string;
    }
  }

  return {
    routes,
    defaultScreen,
  };
}

/**
 * Execute screen management operation
 */
export function executeScreenOperation(
  doc: Document,
  mod: Modification,
  screens: Map<string, string>
): { success: boolean; error?: string; newScreen?: string } {
  const { tool, selector, params } = mod;

  switch (tool) {
    case 'add_navigation': {
      if (!selector) {
        return { success: false, error: 'Selector required for add_navigation' };
      }
      const success = addNavigationToElement(
        doc,
        selector,
        params.targetScreen as string,
        params.transition as string | undefined,
        params.params as Record<string, unknown> | undefined
      );
      return { success, error: success ? undefined : `Element not found: ${selector}` };
    }

    case 'add_back_navigation': {
      if (!selector) {
        return { success: false, error: 'Selector required for add_back_navigation' };
      }
      const success = addBackNavigation(
        doc,
        selector,
        params.transition as string | undefined
      );
      return { success, error: success ? undefined : `Element not found: ${selector}` };
    }

    case 'create_screen': {
      const screenId = params.screenId as string;
      // baseScreenId is captured for use by the main modifier, not used here directly
      const _baseScreenId = params.baseScreenId as string | undefined;
      void _baseScreenId; // Acknowledge intentionally unused

      if (screens.has(screenId)) {
        return { success: false, error: `Screen already exists: ${screenId}` };
      }

      // Create new screen (will be handled by the main modifier)
      return { success: true, newScreen: screenId };
    }

    case 'delete_screen': {
      const screenId = params.screenId as string;
      if (!screens.has(screenId)) {
        return { success: false, error: `Screen not found: ${screenId}` };
      }
      screens.delete(screenId);
      return { success: true };
    }

    // These don't modify DOM directly, just collect config
    case 'define_route':
    case 'set_default_screen':
    case 'switch_screen':
      return { success: true };

    case 'add_nav_menu': {
      if (!selector) {
        return { success: false, error: 'Selector required for add_nav_menu' };
      }
      const target = doc.querySelector(selector);
      if (!target) {
        return { success: false, error: `Element not found: ${selector}` };
      }
      const html = generateNavMenuHTML(
        params.items as Array<{ label: string; screenId: string; icon?: string }>,
        (params.style as 'horizontal' | 'vertical' | 'tabs' | 'dropdown') || 'horizontal'
      );
      const position = params.position || 'append';
      // This would need insertHTML from operations.ts
      target.insertAdjacentHTML(position === 'append' ? 'beforeend' : 'afterbegin', html);
      return { success: true };
    }

    case 'add_breadcrumb': {
      if (!selector) {
        return { success: false, error: 'Selector required for add_breadcrumb' };
      }
      const target = doc.querySelector(selector);
      if (!target) {
        return { success: false, error: `Element not found: ${selector}` };
      }
      const html = generateBreadcrumbHTML(
        params.items as Array<{ label: string; screenId?: string }>
      );
      const position = params.position || 'append';
      target.insertAdjacentHTML(position === 'append' ? 'beforeend' : 'afterbegin', html);
      return { success: true };
    }

    default:
      return { success: false, error: `Unknown screen operation: ${tool}` };
  }
}

/**
 * Check if a tool is a screen management tool
 */
export function isScreenTool(toolName: string): boolean {
  const screenTools = new Set([
    'create_screen',
    'switch_screen',
    'delete_screen',
    'add_navigation',
    'add_back_navigation',
    'define_route',
    'set_default_screen',
    'add_nav_menu',
    'add_breadcrumb',
  ]);
  return screenTools.has(toolName);
}
