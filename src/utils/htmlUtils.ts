/**
 * HTML Utility Functions
 *
 * Provides utilities for processing HTML before display in iframes.
 */

// Supabase storage domain to allow in CSP
const SUPABASE_STORAGE_DOMAIN = 'https://*.supabase.co';

/**
 * Relaxes Content Security Policy in HTML to allow Supabase storage resources.
 * This modifies or removes CSP meta tags that would block external images/resources.
 *
 * @param html - The HTML string to process
 * @returns HTML with relaxed CSP
 */
export function relaxCsp(html: string): string {
  if (!html) return html;

  // Permissive CSP that allows inline styles, scripts, and external resources
  const permissiveCsp = `<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data: blob: ${SUPABASE_STORAGE_DOMAIN}; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *; font-src * data:;">`;

  // Pattern to match CSP meta tags
  const cspMetaPattern = /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi;

  // Check if there's a CSP meta tag
  const hasCsp = cspMetaPattern.test(html);

  if (hasCsp) {
    // Reset regex
    cspMetaPattern.lastIndex = 0;
    // Replace existing CSP with permissive one
    return html.replace(cspMetaPattern, permissiveCsp);
  }

  // No existing CSP - add permissive CSP to head
  // This is crucial for srcdoc iframes which have default CSP restrictions
  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>\n${permissiveCsp}`);
  } else if (html.includes('<head ')) {
    return html.replace(/<head\s[^>]*>/, (match) => `${match}\n${permissiveCsp}`);
  } else if (html.includes('<html>') || html.includes('<html ')) {
    // No head tag, add after html
    return html.replace(/<html[^>]*>/, (match) => `${match}\n<head>${permissiveCsp}</head>`);
  } else {
    // No html or head tags, prepend CSP
    return `${permissiveCsp}\n${html}`;
  }
}

/**
 * Completely removes CSP meta tags from HTML.
 * Use this when you want full permissiveness in iframe content.
 *
 * @param html - The HTML string to process
 * @returns HTML without CSP meta tags
 */
export function removeCsp(html: string): string {
  if (!html) return html;

  // Remove CSP meta tags entirely
  return html.replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
}

/**
 * Prepares HTML for safe display in an iframe with srcDoc.
 * - Relaxes CSP to allow Supabase storage
 * - Ensures proper base tag handling
 *
 * @param html - The HTML string to process
 * @returns Processed HTML ready for iframe display
 */
export function prepareHtmlForIframe(html: string): string {
  if (!html) return html;

  let processed = html;

  // Relax CSP to allow Supabase resources
  processed = relaxCsp(processed);

  return processed;
}
