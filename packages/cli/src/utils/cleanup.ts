/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectTempDir, isNodeError } from '@google/dolphin-cli-core'; // Corrected import

const MAX_CHECKPOINT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function cleanupCheckpoints() {
  const tempDir = await getProjectTempDir(); // This now correctly resolves to .dolphin-cli/tmp
  if (!tempDir) {
    // console.warn('Could not determine project temporary directory for cleanup.');
    return;
  }

  const checkpointsDir = path.join(tempDir, 'checkpoints');

  try {
    await fs.access(checkpointsDir);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return;
    }
    // console.warn(`Error accessing checkpoints directory ${checkpointsDir}:`, error);
    return;
  }

  try {
    const files = await fs.readdir(checkpointsDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(checkpointsDir, file);
        try {
          const stats = await fs.stat(filePath);
          const ageMs = Date.now() - stats.mtime.getTime();
          if (ageMs > MAX_CHECKPOINT_AGE_MS) {
            await fs.unlink(filePath);
            // console.log(`Cleaned up old checkpoint: ${filePath}`);
          }
        } catch (statError) {
          // console.warn(`Error processing checkpoint file ${filePath}:`, statError);
        }
      }
    }
  } catch (readdirError) {
    // console.warn(`Error reading checkpoints directory ${checkpointsDir}:`, readdirError);
  }
}
