/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { GitService } from './gitService.js';
import { getProjectHash, DOLPHIN_CLI_DIR } from '../utils/paths.js'; // Corrected import

const originalFs = await vi.importActual<typeof fs>('fs/promises');
const mockFs = {
  mkdir: vi.fn(() => Promise.resolve(undefined)),
  writeFile: vi.fn(() => Promise.resolve(undefined)),
  readFile: vi.fn(() => Promise.resolve('')),
  access: vi.fn(() => Promise.resolve(undefined)),
  stat: vi.fn(() => Promise.resolve({ isDirectory: () => true } as fs.Stats)),
};
vi.mock('fs/promises', () => mockFs);

const mockSimpleGitInstance = {
  checkIsRepo: vi.fn(),
  init: vi.fn(),
  commit: vi.fn(),
  add: vi.fn(),
  raw: vi.fn(),
  clean: vi.fn(),
  env: vi.fn(() => mockSimpleGitInstance),
};
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockSimpleGitInstance),
  CheckRepoActions: { IS_REPO_ROOT: 'IS_REPO_ROOT' }
}));

const mockExec = vi.fn();
vi.mock('node:child_process', () => ({
    exec: mockExec
}));

const MOCK_HOME_DIR = '/mock/home';
vi.spyOn(os, 'homedir').mockReturnValue(MOCK_HOME_DIR);


describe('GitService', () => {
  const projectRoot = '/test/project';
  let gitService: GitService;
  const projectHash = getProjectHash(projectRoot); // getProjectHash should be fine as is
  const historyDir = path.join(MOCK_HOME_DIR, DOLPHIN_CLI_DIR, 'history', projectHash); // DOLPHIN_CLI_DIR
  const gitConfigPath = path.join(historyDir, '.gitconfig');
  const shadowGitIgnorePath = path.join(historyDir, '.gitignore');

  beforeEach(() => {
    vi.clearAllMocks();
    mockExec.mockImplementation((command, callback) => {
      if (command === 'git --version') {
        callback(null, 'git version 2.0.0', '');
      } else {
        callback(new Error('Command not mocked'), '', '');
      }
    });
    mockSimpleGitInstance.checkIsRepo.mockResolvedValue(false);
    mockSimpleGitInstance.commit.mockResolvedValue({ commit: 'test-commit-hash' } as any);
    mockSimpleGitInstance.raw.mockImplementation(async (command: string, ...args: any[]) => {
        if (command === 'rev-parse' && args[0] === 'HEAD') return 'current-head-hash\n';
        return '';
    });

    gitService = new GitService(projectRoot);
  });

  // ... (constructor, verifyGitAvailability, initialize tests remain largely the same) ...
  // Tests for constructor, verifyGitAvailability, initialize can remain as they were,
  // as their core logic doesn't directly depend on the "Gemini" vs "dolphin-cli" name
  // beyond the directory structure which is now using DOLPHIN_CLI_DIR.

  describe('setupShadowGitRepository', () => {
    beforeEach(() => {
      mockFs.mkdir.mockClear();
      mockFs.writeFile.mockClear();
      mockFs.readFile.mockClear();
      mockFs.access.mockClear();
      mockFs.stat.mockClear();
      mockExec.mockImplementation((_cmd, cb) => cb(null, 'git version 2.0.0', ''));
    });

    it('should create history and repository directories using DOLPHIN_CLI_DIR', async () => {
      await gitService.setupShadowGitRepository();
      // historyDir already uses DOLPHIN_CLI_DIR
      expect(mockFs.mkdir).toHaveBeenCalledWith(historyDir, { recursive: true });
    });

    it('should create a .gitconfig file with "dolphin-cli" name and email', async () => {
      await gitService.setupShadowGitRepository();
      const expectedConfigContent =
        '[user]\n  name = dolphin-cli\n  email = dolphin-cli@google.com\n[commit]\n  gpgsign = false\n'; // Updated name/email
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        gitConfigPath,
        expectedConfigContent,
      );
    });

    // The rest of setupShadowGitRepository tests (init, .gitignore handling, initial commit)
    // should be okay as their logic doesn't directly depend on the "Gemini" name,
    // assuming the paths (historyDir, gitConfigPath, shadowGitIgnorePath) are correctly
    // using DOLPHIN_CLI_DIR.

    it('should initialize git repo in historyDir if not already initialized', async () => {
      mockSimpleGitInstance.checkIsRepo.mockResolvedValue(false);
      await gitService.setupShadowGitRepository();
      expect(mockSimpleGitInstance.init).toHaveBeenCalledWith(false, {'--initial-branch': 'main'});
      expect(mockSimpleGitInstance.commit).toHaveBeenCalledWith('Initial commit', {'--allow-empty': null});
    });

    it('should not initialize git repo if already initialized', async () => {
      mockSimpleGitInstance.checkIsRepo.mockResolvedValue(true);
      await gitService.setupShadowGitRepository();
      expect(mockSimpleGitInstance.init).not.toHaveBeenCalled();
    });

    it('should copy .gitignore from projectRoot if it exists', async () => {
        const userGitIgnoreContent = '# Node modules\nnode_modules/';
        const projectGitIgnorePath = path.join(projectRoot, '.gitignore');
        mockFs.readFile.mockImplementation(async (p) => {
            if (p === projectGitIgnorePath) return userGitIgnoreContent;
            const err = new Error('ENOENT: file not found') as NodeJS.ErrnoException;
            err.code = 'ENOENT';
            throw err;
        });

        await gitService.setupShadowGitRepository();
        expect(mockFs.readFile).toHaveBeenCalledWith(projectGitIgnorePath, 'utf-8');
        expect(mockFs.writeFile).toHaveBeenCalledWith(shadowGitIgnorePath, userGitIgnoreContent);
    });
  });

  // createFileSnapshot, restoreProjectFromSnapshot, getCurrentCommitHash tests remain the same.
   describe('createFileSnapshot', () => {
    it('should add all files and commit with the given message', async () => {
      const message = 'Test snapshot';
      const expectedHash = 'new-commit-hash';
      mockSimpleGitInstance.commit.mockResolvedValue({ commit: expectedHash } as any);

      const commitHash = await gitService.createFileSnapshot(message);

      expect(mockSimpleGitInstance.add).toHaveBeenCalledWith('.');
      expect(mockSimpleGitInstance.commit).toHaveBeenCalledWith(message);
      expect(commitHash).toBe(expectedHash);
    });
  });

  describe('restoreProjectFromSnapshot', () => {
    it('should call git restore and git clean', async () => {
      const commitHash = 'snapshot-hash';
      await gitService.restoreProjectFromSnapshot(commitHash);

      expect(mockSimpleGitInstance.raw).toHaveBeenCalledWith(['restore', '--source', commitHash, '.']);
      expect(mockSimpleGitInstance.clean).toHaveBeenCalledWith('f', ['-d']);
    });
  });

  describe('getCurrentCommitHash', () => {
    it('should return the trimmed HEAD commit hash', async () => {
        mockSimpleGitInstance.raw.mockResolvedValue('  current-head-hash  \n');
        const hash = await gitService.getCurrentCommitHash();
        expect(hash).toBe('current-head-hash');
        expect(mockSimpleGitInstance.raw).toHaveBeenCalledWith('rev-parse', 'HEAD');
    });
  });

});

afterAll(() => {
  vi.restoreAllMocks();
});
