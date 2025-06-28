/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { DOLPHIN_CLI_DIR } from './paths.js'; // Corrected import

const USER_ID_FILE = 'user_id.txt';

function ensureDolphinCliDirExists() { // Renamed
  const dirPath = path.join(os.homedir(), DOLPHIN_CLI_DIR); // Uses new constant
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (e) {
      // console.warn(`Could not create ${DOLPHIN_CLI_DIR} directory:`, e);
    }
  }
}

export function getOrSetUserId(): string {
  ensureDolphinCliDirExists(); // Renamed call
  const userIdFilePath = path.join(os.homedir(), DOLPHIN_CLI_DIR, USER_ID_FILE); // Uses new constant

  try {
    if (fs.existsSync(userIdFilePath)) {
      const userId = fs.readFileSync(userIdFilePath, 'utf-8').trim();
      if (userId) {
        return userId;
      }
    }
  } catch (e) {
    // console.warn("Error reading user ID file, will generate a new one:", e);
  }

  const newUserId = randomUUID();
  try {
    fs.writeFileSync(userIdFilePath, newUserId, 'utf-8');
    return newUserId;
  } catch (e) {
    // console.warn("Error writing user ID file, ID will be ephemeral for this session:", e);
    return newUserId;
  }
}
