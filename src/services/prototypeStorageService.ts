/**
 * Prototype Storage Service
 *
 * Handles uploading file-based prototypes to Supabase Storage
 * for sharing and persistence.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { VirtualFS } from '../runtime/virtual-fs';
import type { PrototypeMetadata } from '../types/implementationScript';

const BUCKET_NAME = 'vibe-files';

// ============ Types ============

export interface UploadPrototypeResult {
  success: boolean;
  publicUrl?: string;
  files?: string[];
  error?: string;
}

export interface PrototypeInfo {
  variantId: string;
  sessionId: string;
  publicUrl: string;
  createdAt: string;
  fileCount: number;
  totalSize: number;
}

export interface GetPrototypeResult {
  success: boolean;
  virtualFS?: VirtualFS;
  metadata?: PrototypeMetadata;
  error?: string;
}

// ============ MIME Types ============

const MIME_TYPES: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  js: 'application/javascript',
  mjs: 'application/javascript',
  css: 'text/css',
  json: 'application/json',
  txt: 'text/plain',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// ============ Upload Functions ============

/**
 * Upload a complete prototype (all files) to Supabase Storage
 */
export async function uploadPrototype(
  sessionId: string,
  variantId: string,
  virtualFS: VirtualFS,
  metadata?: Partial<PrototypeMetadata>
): Promise<UploadPrototypeResult> {
  if (!isSupabaseConfigured()) {
    // For development, just return the blob URL
    const previewUrl = virtualFS.createPreviewUrl();
    return { success: true, publicUrl: previewUrl, files: virtualFS.listAllFiles() };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be logged in to upload prototypes' };
    }

    const basePath = `${user.id}/${sessionId}/${variantId}`;
    const uploadedFiles: string[] = [];
    const errors: string[] = [];

    // Upload each file
    for (const [path, file] of virtualFS.entries()) {
      const storagePath = `${basePath}/${path}`;
      const content = file.content;
      const mimeType = getMimeType(path);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, content, {
          contentType: mimeType,
          upsert: true,
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error(`Failed to upload ${path}:`, uploadError);
        errors.push(`${path}: ${uploadError.message}`);
      } else {
        uploadedFiles.push(storagePath);
      }
    }

    // Upload metadata file
    const metadataContent = JSON.stringify({
      ...metadata,
      variantId,
      sessionId,
      userId: user.id,
      createdAt: new Date().toISOString(),
      fileCount: uploadedFiles.length,
      totalSize: virtualFS.getTotalSize(),
    }, null, 2);

    await supabase.storage
      .from(BUCKET_NAME)
      .upload(`${basePath}/_metadata.json`, metadataContent, {
        contentType: 'application/json',
        upsert: true,
      });

    if (errors.length > 0 && uploadedFiles.length === 0) {
      return { success: false, error: errors.join('; ') };
    }

    // Get public URL for index.html
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(`${basePath}/index.html`);

    return {
      success: true,
      publicUrl,
      files: uploadedFiles,
    };
  } catch (error) {
    console.error('Upload prototype error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Upload a single file to an existing prototype
 */
export async function uploadPrototypeFile(
  sessionId: string,
  variantId: string,
  filePath: string,
  content: string | ArrayBuffer
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be logged in' };
    }

    const storagePath = `${user.id}/${sessionId}/${variantId}/${filePath}`;
    const mimeType = getMimeType(filePath);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, content, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    return { success: true, publicUrl };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

// ============ Download Functions ============

/**
 * Download a complete prototype from Supabase Storage
 */
export async function downloadPrototype(
  sessionId: string,
  variantId: string,
  userId?: string
): Promise<GetPrototypeResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // Get current user if userId not provided
    let targetUserId = userId;
    if (!targetUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'You must be logged in' };
      }
      targetUserId = user.id;
    }

    const basePath = `${targetUserId}/${sessionId}/${variantId}`;

    // List all files in the variant directory
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(basePath, {
        limit: 1000,
      });

    if (listError) {
      return { success: false, error: listError.message };
    }

    if (!files || files.length === 0) {
      return { success: false, error: 'Prototype not found' };
    }

    const virtualFS = new VirtualFS({ sessionId, variantId });
    let metadata: PrototypeMetadata | undefined;

    // Download each file
    for (const file of files) {
      if (file.name === '.gitkeep') continue;

      const filePath = `${basePath}/${file.name}`;
      const { data, error: downloadError } = await supabase.storage
        .from(BUCKET_NAME)
        .download(filePath);

      if (downloadError) {
        console.error(`Failed to download ${file.name}:`, downloadError);
        continue;
      }

      if (file.name === '_metadata.json') {
        const text = await data.text();
        metadata = JSON.parse(text);
        continue;
      }

      const content = await data.text();
      virtualFS.writeFile(file.name, content);
    }

    // Handle nested directories (components/, styles/, etc.)
    const directories = ['components', 'state', 'flows', 'styles'];
    for (const dir of directories) {
      const { data: dirFiles } = await supabase.storage
        .from(BUCKET_NAME)
        .list(`${basePath}/${dir}`, { limit: 100 });

      if (dirFiles) {
        for (const file of dirFiles) {
          if (file.name === '.gitkeep') continue;

          const filePath = `${basePath}/${dir}/${file.name}`;
          const { data } = await supabase.storage
            .from(BUCKET_NAME)
            .download(filePath);

          if (data) {
            const content = await data.text();
            virtualFS.writeFile(`${dir}/${file.name}`, content);
          }
        }
      }
    }

    return {
      success: true,
      virtualFS,
      metadata,
    };
  } catch (error) {
    console.error('Download prototype error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Download failed',
    };
  }
}

/**
 * Get public URL for a prototype
 */
export function getPrototypePublicUrl(
  userId: string,
  sessionId: string,
  variantId: string
): string {
  if (!isSupabaseConfigured()) {
    return '';
  }

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(`${userId}/${sessionId}/${variantId}/index.html`);

  return publicUrl;
}

// ============ List Functions ============

/**
 * List all prototypes for the current user
 */
export async function listUserPrototypes(): Promise<PrototypeInfo[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // List sessions
    const { data: sessions, error: sessionsError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(user.id, { limit: 100 });

    if (sessionsError || !sessions) {
      return [];
    }

    const prototypes: PrototypeInfo[] = [];

    for (const session of sessions) {
      if (session.name.startsWith('.')) continue;

      // List variants in session
      const { data: variants } = await supabase.storage
        .from(BUCKET_NAME)
        .list(`${user.id}/${session.name}`, { limit: 20 });

      if (!variants) continue;

      for (const variant of variants) {
        if (variant.name.startsWith('.')) continue;

        // Try to get metadata
        const { data: metadataFile } = await supabase.storage
          .from(BUCKET_NAME)
          .download(`${user.id}/${session.name}/${variant.name}/_metadata.json`);

        let metadata: Partial<PrototypeMetadata> = {};
        if (metadataFile) {
          try {
            metadata = JSON.parse(await metadataFile.text());
          } catch { /* ignore */ }
        }

        const { data: { publicUrl } } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(`${user.id}/${session.name}/${variant.name}/index.html`);

        prototypes.push({
          variantId: variant.name,
          sessionId: session.name,
          publicUrl,
          createdAt: (metadata as any).createdAt || new Date().toISOString(),
          fileCount: (metadata as any).fileCount || 0,
          totalSize: (metadata as any).totalSize || 0,
        });
      }
    }

    return prototypes;
  } catch (error) {
    console.error('List prototypes error:', error);
    return [];
  }
}

// ============ Delete Functions ============

/**
 * Delete a prototype
 */
export async function deletePrototype(
  sessionId: string,
  variantId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be logged in' };
    }

    const basePath = `${user.id}/${sessionId}/${variantId}`;

    // List all files
    const { data: files } = await supabase.storage
      .from(BUCKET_NAME)
      .list(basePath, { limit: 1000 });

    if (!files) {
      return { success: true };
    }

    // Delete all files
    const filePaths = files.map(f => `${basePath}/${f.name}`);

    // Also check subdirectories
    const directories = ['components', 'state', 'flows', 'styles'];
    for (const dir of directories) {
      const { data: dirFiles } = await supabase.storage
        .from(BUCKET_NAME)
        .list(`${basePath}/${dir}`, { limit: 100 });

      if (dirFiles) {
        dirFiles.forEach(f => filePaths.push(`${basePath}/${dir}/${f.name}`));
      }
    }

    if (filePaths.length > 0) {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(filePaths);

      if (error) {
        return { success: false, error: error.message };
      }
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    };
  }
}

/**
 * Delete all prototypes for a session
 */
export async function deleteSessionPrototypes(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be logged in' };
    }

    const basePath = `${user.id}/${sessionId}`;

    // List all variants
    const { data: variants } = await supabase.storage
      .from(BUCKET_NAME)
      .list(basePath, { limit: 20 });

    if (!variants) {
      return { success: true };
    }

    // Delete each variant
    for (const variant of variants) {
      await deletePrototype(sessionId, variant.name);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    };
  }
}

// ============ Utility Functions ============

/**
 * Check if a prototype exists
 */
export async function prototypeExists(
  sessionId: string,
  variantId: string,
  userId?: string
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  try {
    let targetUserId = userId;
    if (!targetUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      targetUserId = user.id;
    }

    const { data } = await supabase.storage
      .from(BUCKET_NAME)
      .list(`${targetUserId}/${sessionId}/${variantId}`, { limit: 1 });

    return (data && data.length > 0) || false;
  } catch {
    return false;
  }
}

/**
 * Generate a shareable URL for a prototype
 */
export function generateShareableUrl(
  userId: string,
  sessionId: string,
  variantId: string
): string {
  // This would be a custom domain or edge function that serves the prototype
  // For now, return the direct storage URL
  return getPrototypePublicUrl(userId, sessionId, variantId);
}
