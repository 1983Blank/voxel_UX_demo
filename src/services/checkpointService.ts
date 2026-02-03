/**
 * Checkpoint Service
 *
 * Provides save/resume capability for multi-stage prototype generation.
 * Uses IndexedDB for local storage with optional Supabase sync.
 */

import type { Checkpoint, CheckpointStatus } from '../types/agentTypes';

// ============================================================================
// IndexedDB Setup
// ============================================================================

const DB_NAME = 'voxel-checkpoints';
const DB_VERSION = 1;
const STORE_NAME = 'checkpoints';

let db: IDBDatabase | null = null;

async function openDatabase(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[CheckpointService] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Create checkpoints store with indexes
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('sessionVariant', ['sessionId', 'variantIndex'], { unique: false });
        store.createIndex('stepKey', ['sessionId', 'variantIndex', 'stepKey'], { unique: true });
      }
    };
  });
}

// ============================================================================
// Checkpoint CRUD Operations
// ============================================================================

/**
 * Generate a unique checkpoint ID
 */
function generateCheckpointId(sessionId: string, variantIndex: number, stepKey: string): string {
  return `${sessionId}_${variantIndex}_${stepKey}`;
}

/**
 * Save a checkpoint for a generation step
 */
export async function saveCheckpoint(
  sessionId: string,
  variantIndex: number,
  stepKey: string,
  result: unknown,
  status: CheckpointStatus = 'completed'
): Promise<Checkpoint> {
  const database = await openDatabase();

  const checkpoint: Checkpoint = {
    id: generateCheckpointId(sessionId, variantIndex, stepKey),
    sessionId,
    variantIndex,
    stepKey,
    status,
    resultJson: result,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(checkpoint);

    request.onsuccess = () => {
      console.log('[CheckpointService] Saved checkpoint:', checkpoint.id);
      resolve(checkpoint);
    };

    request.onerror = () => {
      console.error('[CheckpointService] Failed to save checkpoint:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Get a specific checkpoint
 */
export async function getCheckpoint(
  sessionId: string,
  variantIndex: number,
  stepKey: string
): Promise<Checkpoint | null> {
  const database = await openDatabase();
  const id = generateCheckpointId(sessionId, variantIndex, stepKey);

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      console.error('[CheckpointService] Failed to get checkpoint:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Load all checkpoints for a session
 */
export async function loadCheckpoints(sessionId: string): Promise<Checkpoint[]> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('sessionId');
    const request = index.getAll(sessionId);

    request.onsuccess = () => {
      const checkpoints = request.result || [];
      console.log('[CheckpointService] Loaded checkpoints for session:', sessionId, checkpoints.length);
      resolve(checkpoints);
    };

    request.onerror = () => {
      console.error('[CheckpointService] Failed to load checkpoints:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Load checkpoints for a specific variant
 */
export async function loadVariantCheckpoints(
  sessionId: string,
  variantIndex: number
): Promise<Checkpoint[]> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('sessionVariant');
    const request = index.getAll([sessionId, variantIndex]);

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      console.error('[CheckpointService] Failed to load variant checkpoints:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Update checkpoint status
 */
export async function updateCheckpointStatus(
  sessionId: string,
  variantIndex: number,
  stepKey: string,
  status: CheckpointStatus,
  error?: string
): Promise<Checkpoint | null> {
  const checkpoint = await getCheckpoint(sessionId, variantIndex, stepKey);
  if (!checkpoint) return null;

  const database = await openDatabase();

  const updated: Checkpoint = {
    ...checkpoint,
    status,
    error,
    updatedAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(updated);

    request.onsuccess = () => {
      resolve(updated);
    };

    request.onerror = () => {
      console.error('[CheckpointService] Failed to update checkpoint:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Delete all checkpoints for a session
 */
export async function clearSessionCheckpoints(sessionId: string): Promise<void> {
  const database = await openDatabase();

  const checkpoints = await loadCheckpoints(sessionId);

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    let completed = 0;
    let hasError = false;

    if (checkpoints.length === 0) {
      resolve();
      return;
    }

    for (const checkpoint of checkpoints) {
      const request = store.delete(checkpoint.id);

      request.onsuccess = () => {
        completed++;
        if (completed === checkpoints.length && !hasError) {
          console.log('[CheckpointService] Cleared checkpoints for session:', sessionId);
          resolve();
        }
      };

      request.onerror = () => {
        if (!hasError) {
          hasError = true;
          reject(request.error);
        }
      };
    }
  });
}

/**
 * Delete a specific checkpoint
 */
export async function deleteCheckpoint(
  sessionId: string,
  variantIndex: number,
  stepKey: string
): Promise<void> {
  const database = await openDatabase();
  const id = generateCheckpointId(sessionId, variantIndex, stepKey);

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      console.error('[CheckpointService] Failed to delete checkpoint:', request.error);
      reject(request.error);
    };
  });
}

// ============================================================================
// Checkpoint Analysis
// ============================================================================

/**
 * Check if a variant has completed generation
 */
export async function isVariantComplete(
  sessionId: string,
  variantIndex: number
): Promise<boolean> {
  const checkpoint = await getCheckpoint(sessionId, variantIndex, 'index_html');
  return checkpoint?.status === 'completed';
}

/**
 * Get the last completed step for a variant
 */
export async function getLastCompletedStep(
  sessionId: string,
  variantIndex: number
): Promise<string | null> {
  const checkpoints = await loadVariantCheckpoints(sessionId, variantIndex);
  const completed = checkpoints
    .filter(c => c.status === 'completed')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return completed[0]?.stepKey || null;
}

/**
 * Get progress summary for a session
 */
export async function getSessionProgress(
  sessionId: string
): Promise<{
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  variantProgress: Record<number, { completed: number; failed: number; total: number }>;
}> {
  const checkpoints = await loadCheckpoints(sessionId);

  const variantProgress: Record<number, { completed: number; failed: number; total: number }> = {};

  for (const checkpoint of checkpoints) {
    if (!variantProgress[checkpoint.variantIndex]) {
      variantProgress[checkpoint.variantIndex] = { completed: 0, failed: 0, total: 0 };
    }

    variantProgress[checkpoint.variantIndex].total++;

    if (checkpoint.status === 'completed') {
      variantProgress[checkpoint.variantIndex].completed++;
    } else if (checkpoint.status === 'failed') {
      variantProgress[checkpoint.variantIndex].failed++;
    }
  }

  const totals = Object.values(variantProgress).reduce(
    (acc, v) => ({
      totalSteps: acc.totalSteps + v.total,
      completedSteps: acc.completedSteps + v.completed,
      failedSteps: acc.failedSteps + v.failed,
    }),
    { totalSteps: 0, completedSteps: 0, failedSteps: 0 }
  );

  return {
    ...totals,
    variantProgress,
  };
}

// ============================================================================
// Recovery Operations
// ============================================================================

/**
 * Get files from completed checkpoints for a variant
 */
export async function getFilesFromCheckpoints(
  sessionId: string,
  variantIndex: number
): Promise<Array<{ path: string; content: string; type: string }>> {
  const checkpoints = await loadVariantCheckpoints(sessionId, variantIndex);
  const files: Array<{ path: string; content: string; type: string }> = [];

  for (const checkpoint of checkpoints) {
    if (checkpoint.status === 'completed' && checkpoint.resultJson) {
      const result = checkpoint.resultJson as { path?: string; content?: string; type?: string };
      if (result.path && result.content) {
        files.push({
          path: result.path,
          content: result.content,
          type: result.type || 'html',
        });
      }
    }
  }

  return files;
}

/**
 * Clean up old checkpoints (older than 7 days)
 */
export async function cleanupOldCheckpoints(): Promise<number> {
  const database = await openDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    let deletedCount = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const checkpoint = cursor.value as Checkpoint;
        const createdAt = new Date(checkpoint.createdAt);

        if (createdAt < cutoffDate) {
          cursor.delete();
          deletedCount++;
        }

        cursor.continue();
      } else {
        console.log('[CheckpointService] Cleaned up old checkpoints:', deletedCount);
        resolve(deletedCount);
      }
    };

    request.onerror = () => {
      console.error('[CheckpointService] Failed to cleanup checkpoints:', request.error);
      reject(request.error);
    };
  });
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the checkpoint service
 */
export async function initCheckpointService(): Promise<void> {
  try {
    await openDatabase();
    console.log('[CheckpointService] Initialized');

    // Clean up old checkpoints on startup
    await cleanupOldCheckpoints();
  } catch (error) {
    console.error('[CheckpointService] Failed to initialize:', error);
    // Non-fatal - checkpointing will just not work
  }
}

export default {
  saveCheckpoint,
  getCheckpoint,
  loadCheckpoints,
  loadVariantCheckpoints,
  updateCheckpointStatus,
  clearSessionCheckpoints,
  deleteCheckpoint,
  isVariantComplete,
  getLastCompletedStep,
  getSessionProgress,
  getFilesFromCheckpoints,
  cleanupOldCheckpoints,
  initCheckpointService,
};
