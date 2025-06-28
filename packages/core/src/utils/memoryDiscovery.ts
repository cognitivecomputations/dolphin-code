/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DOLPHIN_CLI_DIR, DEFAULT_CONTEXT_FILE_NAME } from './paths.js'; // Corrected import
import { walkAndFilterFiles, isNodeError } from './fileUtils.js';


export function getAllDolphinCliMdFilenames(contextFileNameSettings?: string | string[]): string[] { // Renamed
  if (Array.isArray(contextFileNameSettings)) {
    return contextFileNameSettings.map(name => name.toUpperCase());
  }
  if (typeof contextFileNameSettings === 'string') {
    return [contextFileNameSettings.toUpperCase()];
  }
  return [DEFAULT_CONTEXT_FILE_NAME.toUpperCase()];
}

interface DolphinCliFileContent { // Renamed
  path: string;
  content: string;
}

async function getDolphinCliMdFilePathsInternal( // Renamed
  projectRoot: string,
  configuredContextFileNames: string[],
  debugMode = false,
): Promise<string[]> {
  const homeDir = os.homedir();
  const pathsToSearch: string[] = [];

  const globalDolphinCliDir = path.join(homeDir, DOLPHIN_CLI_DIR); // Uses new constant
  try {
    await fs.access(globalDolphinCliDir);
    for (const filename of configuredContextFileNames) {
      const globalPath = path.join(globalDolphinCliDir, filename);
       try {
        await fs.access(globalPath);
        pathsToSearch.push(globalPath);
      } catch (_e) { /* File doesn't exist, skip */ }
    }
  } catch (_e) { /* Global dir doesn't exist, skip */ }

  let currentDir = projectRoot;
  while (currentDir && currentDir !== path.parse(currentDir).root && currentDir !== homeDir) {
    for (const filename of configuredContextFileNames) {
      const potentialPath = path.join(currentDir, filename);
       try {
        await fs.access(potentialPath);
        if (!pathsToSearch.includes(potentialPath)) {
            pathsToSearch.push(potentialPath);
        }
      } catch (_e) { /* File doesn't exist, skip */ }
    }
    const projectScopeDolphinCliDir = path.join(currentDir, DOLPHIN_CLI_DIR); // Uses new constant
    try {
        await fs.access(projectScopeDolphinCliDir);
        for (const filename of configuredContextFileNames) {
            const potentialPath = path.join(projectScopeDolphinCliDir, filename);
            try {
                await fs.access(potentialPath);
                 if (!pathsToSearch.includes(potentialPath)) {
                    pathsToSearch.push(potentialPath);
                }
            } catch (_e) {/* File doesn't exist, skip */}
        }
    } catch (_e) { /* Project scope dir doesn't exist, skip */ }

    currentDir = path.dirname(currentDir);
  }

  if (homeDir && projectRoot !== homeDir && !projectRoot.startsWith(homeDir + path.sep)) {
     for (const filename of configuredContextFileNames) {
        const homePath = path.join(homeDir, filename); // Check root of home
        try {
            await fs.access(homePath);
            if (!pathsToSearch.includes(homePath)) pathsToSearch.push(homePath);
        } catch (_e) { /* File doesn't exist, skip */ }

        // Global .dolphin-cli dir already checked, so no need to re-check here specifically for filename
     }
  }

  const subDirFiles = await walkAndFilterFiles(
    projectRoot,
    (filePath, isDir) => {
      if (isDir) return false;
      const baseName = path.basename(filePath).toUpperCase();
      return configuredContextFileNames.includes(baseName);
    },
    true,
  );
  for (const file of subDirFiles) {
    if (!pathsToSearch.includes(file)) {
        pathsToSearch.push(file);
    }
  }

  const uniquePaths = Array.from(new Set(pathsToSearch));

  if (debugMode) {
    console.log(
      `Dolphin CLI Core Debug: Found potential context files at: ${JSON.stringify(uniquePaths)}`,
    );
  }
  return uniquePaths;
}


async function readDolphinCliMdFiles( // Renamed
  filePaths: string[],
  debugMode = false,
): Promise<DolphinCliFileContent[]> { // Renamed
  const results: DolphinCliFileContent[] = []; // Renamed
  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      results.push({ path: filePath, content });
    } catch (e) {
      if (debugMode) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn(
          `Warning: Could not read context file at ${filePath}. Error: ${message}`,
        );
      }
    }
  }
  return results;
}

function formatMemoryForLLM(
  instructionContents: DolphinCliFileContent[], // Renamed
  debugMode = false,
): string {
  if (instructionContents.length === 0) {
    return '';
  }
  if (!debugMode) {
    return instructionContents.map((item) => item.content).join('\n\n---\n\n');
  }

  return instructionContents
    .map((item) => `--- Context from: ${item.path} ---\n${item.content}`)
    .join('\n\n');
}

export async function getMemoryContents(
  projectRoot: string,
  configuredContextFileNamesInput?: string | string[],
  debugMode = false,
): Promise<string> {
  const configuredNames = getAllDolphinCliMdFilenames(configuredContextFileNamesInput); // Renamed
  const filePaths = await getDolphinCliMdFilePathsInternal( // Renamed
    projectRoot,
    configuredNames,
    debugMode,
  );
  if (debugMode) {
    console.log(`Dolphin CLI Core Debug: Reading context files from: ${JSON.stringify(filePaths)}`);
  }
  const contentsWithPaths = await readDolphinCliMdFiles(filePaths, debugMode); // Renamed
  return formatMemoryForLLM(contentsWithPaths, debugMode);
}
