/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SandboxConfig, DOLPHIN_CLI_DIR } from '@google/dolphin-cli-core'; // Corrected import

async function findProjectRoot(startPath: string): Promise<string> {
  let currentPath = path.resolve(startPath);
  while (currentPath !== path.parse(currentPath).root) {
    if (
      await fs.stat(path.join(currentPath, '.git')).then(() => true).catch(() => false) ||
      await fs.stat(path.join(currentPath, 'package.json')).then(() => true).catch(() => false)
    ) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }
  return startPath;
}


export async function start_sandbox(
  sandboxConfig: SandboxConfig,
  additionalNodeArgs: string[] = [],
): Promise<ChildProcess> {
  const projectRoot = await findProjectRoot(process.cwd());
  // Assuming the entry point for the bundled CLI will be named dolphin-cli.js
  const cliEntry = path.resolve(projectRoot, 'packages/cli/dist/index.js');

  const args = [...additionalNodeArgs, cliEntry, ...process.argv.slice(2)];
  const env = { ...process.env, SANDBOX: sandboxConfig.command };

  let cmd = process.execPath; // node
  let finalArgs = args;

  if (sandboxConfig.command === 'sandbox-exec' && process.platform === 'darwin') {
    cmd = '/usr/bin/sandbox-exec';
    const profileName = sandboxConfig.profile || 'permissive-open';

    let profilePath = path.join(projectRoot, DOLPHIN_CLI_DIR, `sandbox-macos-${profileName}.sb`);
    try {
        await fs.access(profilePath);
    } catch {
        profilePath = path.join(os.homedir(), DOLPHIN_CLI_DIR, `sandbox-macos-${profileName}.sb`);
        try {
            await fs.access(profilePath);
        } catch {
            // This path needs to be relative to the compiled output of this sandbox.ts file
            // or an absolute path if the profiles are guaranteed to be elsewhere.
            // For now, using a path relative to where this script *might* be located after compilation.
            // This might need adjustment based on actual build output structure.
            profilePath = path.resolve(__dirname, `sandbox-macos-${profileName}.sb`);
        }
    }
    finalArgs = ['-f', profilePath, process.execPath, ...args];
  } else if (sandboxConfig.command === 'docker' || sandboxConfig.command === 'podman') {
    cmd = sandboxConfig.command;
    const mounts = [
      `-v`, `${projectRoot}:${projectRoot}`,
      `-v`, `${os.tmpdir()}:${os.tmpdir()}`,
      ...(sandboxConfig.mounts?.flatMap(m => ['-v', m]) || [])
    ];
    const ports = sandboxConfig.ports?.flatMap(p => ['-p', p]) || [];
    const envVars = Object.entries(sandboxConfig.env || {}).flatMap(([k,v]) => ['-e', `${k}=${v}`]);

    // The image name should reflect the new branding
    const imageName = sandboxConfig.imageUri || 'us-docker.pkg.dev/gemini-code-dev/dolphin-cli/sandbox:latest'; // Updated placeholder

    finalArgs = [
      'run', '--rm', '-i',
      ...mounts,
      ...ports,
      ...envVars,
      '-w', projectRoot,
      imageName,
      'node',
      ...args,
    ];
  } else if (sandboxConfig.command) {
    cmd = sandboxConfig.command.split(' ')[0];
    finalArgs = [...sandboxConfig.command.split(' ').slice(1), process.execPath, ...args];
  }

  const child = spawn(cmd, finalArgs, {
    stdio: 'inherit',
    env,
  });

  child.on('error', (err) => {
    console.error(`Failed to start sandbox process (${cmd}):`, err);
  });

  return child;
}
