/**
 * Storage Diagnostics
 *
 * Utilities to debug and fix storage-related issues
 * with prototype URLs.
 */

import { supabase, isSupabaseConfigured } from './supabase';

export interface DiagnosticResult {
  success: boolean;
  bucketExists: boolean;
  bucketPublic: boolean;
  fileExists: boolean;
  urlAccessible: boolean;
  url?: string;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Check if a variant's HTML file is accessible
 */
export async function diagnoseVariantUrl(
  variantId: string
): Promise<DiagnosticResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      bucketExists: false,
      bucketPublic: false,
      fileExists: false,
      urlAccessible: false,
      error: 'Supabase not configured',
    };
  }

  try {
    // Get variant from database
    const { data: variant, error: variantError } = await supabase
      .from('vibe_variants')
      .select('*')
      .eq('id', variantId)
      .single();

    if (variantError || !variant) {
      return {
        success: false,
        bucketExists: true,
        bucketPublic: true,
        fileExists: false,
        urlAccessible: false,
        error: `Variant not found: ${variantError?.message || 'No data'}`,
      };
    }

    const result: DiagnosticResult = {
      success: true,
      bucketExists: true,
      bucketPublic: true,
      fileExists: false,
      urlAccessible: false,
      url: variant.html_url,
      details: {
        variantId: variant.id,
        sessionId: variant.session_id,
        htmlPath: variant.html_path,
        htmlUrl: variant.html_url,
        status: variant.status,
        createdAt: variant.created_at,
      },
    };

    // Check if the file exists in storage
    if (variant.html_path) {
      const { data: fileData, error: fileError } = await supabase.storage
        .from('vibe-files')
        .download(variant.html_path);

      if (fileError) {
        result.error = `File not found in storage: ${fileError.message}`;
        console.error('[StorageDiagnostics] File error:', fileError);
      } else if (fileData) {
        result.fileExists = true;
        result.details!.fileSize = fileData.size;
      }
    }

    // Try to fetch the URL
    if (variant.html_url) {
      try {
        const response = await fetch(variant.html_url, { method: 'HEAD' });
        result.urlAccessible = response.ok;
        result.details!.httpStatus = response.status;
        result.details!.httpStatusText = response.statusText;

        if (!response.ok) {
          result.error = `URL returned ${response.status}: ${response.statusText}`;
        }
      } catch (fetchError) {
        result.error = `Failed to fetch URL: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`;
        result.details!.fetchError = fetchError instanceof Error ? fetchError.message : 'Unknown';
      }
    }

    result.success = result.fileExists && result.urlAccessible;
    return result;

  } catch (error) {
    return {
      success: false,
      bucketExists: false,
      bucketPublic: false,
      fileExists: false,
      urlAccessible: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Regenerate URL for a variant
 */
export async function regenerateVariantUrl(
  variantId: string
): Promise<{ success: boolean; newUrl?: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // Get variant
    const { data: variant, error: variantError } = await supabase
      .from('vibe_variants')
      .select('html_path')
      .eq('id', variantId)
      .single();

    if (variantError || !variant?.html_path) {
      return { success: false, error: 'Variant or html_path not found' };
    }

    // Get fresh public URL
    const { data: urlData } = supabase.storage
      .from('vibe-files')
      .getPublicUrl(variant.html_path);

    // Update variant with new URL
    const { error: updateError } = await supabase
      .from('vibe_variants')
      .update({ html_url: urlData.publicUrl })
      .eq('id', variantId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, newUrl: urlData.publicUrl };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check bucket configuration
 */
export async function checkBucketConfig(): Promise<{
  exists: boolean;
  public: boolean;
  policies?: string[];
  error?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { exists: false, public: false, error: 'Supabase not configured' };
  }

  try {
    // Try to list files (will fail if bucket doesn't exist or no access)
    const { error } = await supabase.storage
      .from('vibe-files')
      .list('', { limit: 1 });

    if (error) {
      return {
        exists: false,
        public: false,
        error: `Bucket error: ${error.message}`,
      };
    }

    // Bucket exists, try to get a public URL
    const testPath = 'test-public-access';
    const { data: urlData } = supabase.storage
      .from('vibe-files')
      .getPublicUrl(testPath);

    // Check if URL is accessible format (not signed)
    const isPublicFormat = urlData.publicUrl.includes('/public/') ||
                          !urlData.publicUrl.includes('token=');

    return {
      exists: true,
      public: isPublicFormat,
      policies: ['Check Supabase dashboard for policy details'],
    };

  } catch (error) {
    return {
      exists: false,
      public: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fix all variants for a session by regenerating URLs
 */
export async function fixSessionVariants(
  sessionId: string
): Promise<{ fixed: number; failed: number; errors: string[] }> {
  if (!isSupabaseConfigured()) {
    return { fixed: 0, failed: 0, errors: ['Supabase not configured'] };
  }

  try {
    // Get all variants for session
    const { data: variants, error } = await supabase
      .from('vibe_variants')
      .select('id, html_path')
      .eq('session_id', sessionId);

    if (error || !variants) {
      return { fixed: 0, failed: 0, errors: [error?.message || 'No variants found'] };
    }

    let fixed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const variant of variants) {
      if (!variant.html_path) {
        failed++;
        errors.push(`Variant ${variant.id}: No html_path`);
        continue;
      }

      const result = await regenerateVariantUrl(variant.id);
      if (result.success) {
        fixed++;
      } else {
        failed++;
        errors.push(`Variant ${variant.id}: ${result.error}`);
      }
    }

    return { fixed, failed, errors };

  } catch (error) {
    return {
      fixed: 0,
      failed: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

// Export for console debugging
if (typeof window !== 'undefined') {
  (window as any).storageDiagnostics = {
    diagnoseVariantUrl,
    regenerateVariantUrl,
    checkBucketConfig,
    fixSessionVariants,
  };
}
