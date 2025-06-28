/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  getMemoryContents,
  getAllDolphinCliMdFilenames, // Renamed
  DOLPHIN_CLI_DIR, // Renamed
  DEFAULT_CONTEXT_FILE_NAME, // This should now be DOLPHIN-CLI.MD or similar
} from './memoryDiscovery.js';

const mockFs = {
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve(undefined)),
};
vi.mock('fs/promises', () => mockFs);

const MOCK_HOME_DIR = '/mock/home';
vi.spyOn(os, 'homedir').mockReturnValue(MOCK_HOME_DIR);


describe('memoryDiscovery', () => {
  const projectRoot = '/test/project';
  const homeDolphinCliDir = path.join(MOCK_HOME_DIR, DOLPHIN_CLI_DIR); // Uses new constant
  const projectDolphinCliDir = path.join(projectRoot, DOLPHIN_CLI_DIR); // Uses new constant

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.readFile.mockResolvedValue('');
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockImplementation(async (p: string) => {
        if (mockFs.readdir.mock.calls.some(call => p.startsWith(call[0]))) {
             return { isDirectory: () => false, isFile: () => true } as unknown as fs.Stats;
        }
        return { isDirectory: () => true, isFile: () => false } as unknown as fs.Stats;
    });
    mockFs.mkdir.mockImplementation(async (p) => {
        if (p === homeDolphinCliDir || p === projectDolphinCliDir) return undefined;
        if ((p as string).startsWith(homeDolphinCliDir) || (p as string).startsWith(projectDolphinCliDir)) return undefined;
        const originalMkdir = await vi.importActual<typeof fs>('fs/promises').then(m => m.mkdir);
        return originalMkdir(p as fs.PathLike, {recursive: true});
    });
  });

  describe('getAllDolphinCliMdFilenames', () => { // Renamed test suite
    it('should return the default context file name (DOLPHIN-CLI.MD)', () => {
      const defaultName = getAllDolphinCliMdFilenames()[0];
      expect(defaultName).toBe(DEFAULT_CONTEXT_FILE_NAME.toUpperCase()); // Check against the new default
    });
     it('should return uppercase version of single string input', () => {
      expect(getAllDolphinCliMdFilenames('custom.md')).toEqual(['CUSTOM.MD']);
    });
    it('should return uppercase versions of array input', () => {
      expect(getAllDolphinCliMdFilenames(['another.md', 'TEST.MD'])).toEqual(['ANOTHER.MD', 'TEST.MD']);
    });
  });

  describe('getMemoryContents', () => {
    it('should read from global, project root, and subdirectories using DOLPHIN-CLI.MD', async () => {
      const globalPath = path.join(homeDolphinCliDir, 'DOLPHIN-CLI.MD'); // Updated filename
      const rootPath = path.join(projectRoot, 'DOLPHIN-CLI.MD'); // Updated filename
      const subDirPath = path.join(projectRoot, 'subdir', 'DOLPHIN-CLI.MD'); // Updated filename

      mockFs.stat.mockImplementation(async (p: string) => ({
        isDirectory: () => p.endsWith('subdir') || p === projectRoot || p === homeDolphinCliDir,
        isFile: () => p.endsWith('.MD'), // Keep it generic for .MD
      }) as fs.Stats);

      mockFs.readdir.mockImplementation(async (p: string) => {
        if (p === projectRoot) return [{ name: 'DOLPHIN-CLI.MD', isDirectory: () => false, isFile: () => true }, { name: 'subdir', isDirectory: () => true, isFile: () => false }] as any;
        if (p === path.join(projectRoot, 'subdir')) return [{ name: 'DOLPHIN-CLI.MD', isDirectory: () => false, isFile: () => true }] as any;
        if (p === homeDolphinCliDir) return [{ name: 'DOLPHIN-CLI.MD', isDirectory: () => false, isFile: () => true }] as any;
        return [];
      });

      mockFs.readFile.mockImplementation(async (p: string) => {
        if (p === globalPath) return 'Global content';
        if (p === rootPath) return 'Project root content';
        if (p === subDirPath) return 'Subdir content';
        return '';
      });

      const originalPathResolve = path.resolve;
      vi.spyOn(path, 'resolve').mockImplementation((...paths) => {
        if (paths.length === 1 && paths[0].startsWith(`~${path.sep}`)) {
          return originalPathResolve(paths[0].replace(`~${path.sep}`, `${MOCK_HOME_DIR}${path.sep}`));
        }
        return originalPathResolve(...paths);
      });

      // Pass undefined for contextFileNameSettings to use default (DOLPHIN-CLI.MD)
      const contents = await getMemoryContents(projectRoot, undefined, false);

      expect(mockFs.readFile).toHaveBeenCalledWith(globalPath, 'utf-8');
      expect(mockFs.readFile).toHaveBeenCalledWith(rootPath, 'utf-8');
      expect(mockFs.readFile).toHaveBeenCalledWith(subDirPath, 'utf-8');

      expect(contents).toContain('Global content');
      expect(contents).toContain('Project root content');
      expect(contents).toContain('Subdir content');
      expect(contents).toContain(`--- Context from: ${globalPath} ---`);
      expect(contents).toContain(`--- Context from: ${rootPath} ---`);
      expect(contents).toContain(`--- Context from: ${subDirPath} ---`);

      vi.spyOn(path, 'resolve').mockRestore();
    });

    it('should respect specified custom context file names', async () => {
      const customFileName = 'CUSTOM_CONTEXT.MD';
      const projectCustomPath = path.join(projectRoot, customFileName);

      mockFs.stat.mockImplementation(async (p: string) => ({
        isDirectory: () => p === projectRoot,
        isFile: () => p === projectCustomPath,
      }) as fs.Stats);
      mockFs.readdir.mockImplementation(async (p: string) => {
        if (p === projectRoot) return [{ name: customFileName, isDirectory: () => false, isFile: () => true }] as any;
        return [];
      });
      mockFs.readFile.mockResolvedValue('Custom context content');

      const contents = await getMemoryContents(projectRoot, [customFileName], false);
      expect(mockFs.readFile).toHaveBeenCalledWith(projectCustomPath, 'utf-8');
      expect(contents).toContain('Custom context content');
    });

    it('should correctly form paths using DOLPHIN_CLI_DIR for user and project settings with custom name', async () => {
        const customName = "MY_AGENT.MD";
        const userDolphinCliContext = path.join(MOCK_HOME_DIR, DOLPHIN_CLI_DIR, customName);
        const projectDolphinCliContext = path.join(projectRoot, DOLPHIN_CLI_DIR, customName);

        mockFs.stat.mockImplementation(async (p: string) => ({
            isDirectory: () => p === homeDolphinCliDir || p === projectDolphinCliDir || p === projectRoot,
            isFile: () => p === userDolphinCliContext || p === projectDolphinCliContext,
        }) as fs.Stats);

        mockFs.readdir.mockImplementation(async (p: string) => {
            if (p === homeDolphinCliDir) return [{ name: customName, isDirectory: () => false, isFile: () => true }] as any;
            if (p === projectDolphinCliDir) return [{ name: customName, isDirectory: () => false, isFile: () => true }] as any;
            if (p === projectRoot) return [{ name: DOLPHIN_CLI_DIR, isDirectory: () => true, isFile: () => false}] as any;
            return [];
        });
        mockFs.readFile.mockImplementation(async (p: string) => {
            if (p === userDolphinCliContext) return 'User dolphin-cli custom content';
            if (p === projectDolphinCliContext) return 'Project dolphin-cli custom content';
            return '';
        });

        const contents = await getMemoryContents(projectRoot, [customName], false);

        expect(mockFs.readFile).toHaveBeenCalledWith(userDolphinCliContext, 'utf-8');
        expect(mockFs.readFile).toHaveBeenCalledWith(projectDolphinCliContext, 'utf-8');
        expect(contents).toContain('User dolphin-cli custom content');
        expect(contents).toContain('Project dolphin-cli custom content');
    });

  });
});

afterAll(() => {
  vi.restoreAllMocks();
});
