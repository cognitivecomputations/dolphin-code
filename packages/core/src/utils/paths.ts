/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';

export const DOLPHIN_CLI_DIR = '.dolphin-cli'; // Renamed from GEMINI_DIR
export const DEFAULT_CONTEXT_FILE_NAME = 'DOLPHIN-CLI.MD'; // Renamed
export const DEFAULT_CONFIG_FILE = 'config.yaml'; // This can remain generic

export function getProjectHash(projectRoot: string): string {
  return crypto.createHash('sha256').update(projectRoot).digest('hex');
}

// This function will now correctly create/use ~/.dolphin-cli/tmp/<hash>
export async function getProjectTempDir(): Promise<string | null> {
  try {
    const projectRoot = process.cwd();
    const hash = getProjectHash(projectRoot);
    const tempDir = path.join(os.homedir(), DOLPHIN_CLI_DIR, 'tmp', hash);
    // Ensure the directory exists
    await fs.mkdir(tempDir, { recursive: true });
    return tempDir;
  } catch (e) {
    // console.warn('Could not determine or create project temporary directory:', e);
    return null;
  }
}

export function tildeifyPath(filePath: string): string {
  const homeDir = os.homedir();
  if (filePath.startsWith(homeDir)) {
    return '~' + filePath.substring(homeDir.length);
  }
  return filePath;
}

export function unescapePath(filePath: string): string {
  return filePath.replace(/\\ /g, ' ');
}

export function shortenPath(filePath: string, maxLength: number = 50): string {
  if (filePath.length <= maxLength) {
    return filePath;
  }

  const tildePath = tildeifyPath(filePath);
  if (tildePath.length <= maxLength) {
    return tildePath;
  }

  const ellipsis = '...';
  const componentLength = Math.floor((maxLength - ellipsis.length) / 2);
  if (componentLength <= 0) return ellipsis;

  const firstPart = tildePath.substring(0, componentLength);
  const lastPart = tildePath.substring(tildePath.length - componentLength);

  return `${firstPart}${ellipsis}${lastPart}`;
}

// Environment variable names, assuming they are defined in core if used by core logic.
// If these are primarily client-side, they might be better defined in the client package.
export const DOLPHIN_CLI_API_KEY = 'DOLPHIN_CLI_API_KEY';
export const DOLPHIN_CLI_MODEL = 'DOLPHIN_CLI_MODEL';
export const DOLPHIN_CLI_SANDBOX = 'DOLPHIN_CLI_SANDBOX';
// GOOGLE_API_KEY would remain for Vertex AI specific key
// GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION also remain for GCP services.
