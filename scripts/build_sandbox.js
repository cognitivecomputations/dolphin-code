/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(process.cwd());
const SANDBOX_DIR = path.join(ROOT_DIR, 'packages', 'sandbox');
const CORE_DIST_DIR = path.join(ROOT_DIR, 'packages', 'core', 'dist');
const CLI_DIST_DIR = path.join(ROOT_DIR, 'packages', 'cli', 'dist');

// Function to get image tag, supporting --skip-npm-install-build for faster local builds
function getImageTag() {
    const cliPackageJsonPath = path.join(ROOT_DIR, 'packages', 'cli', 'package.json');
    const cliPackageJson = JSON.parse(readFileSync(cliPackageJsonPath, 'utf8'));
    // Use the new package name for the image URI if it's part of the branding
    const sandboxImageUri = cliPackageJson.config?.sandboxImageUri || `us-docker.pkg.dev/gemini-code-dev/dolphin-cli/sandbox:latest`; // Updated default

    if (process.env.SANDBOX_IMAGE_TAG) {
        const [baseUri] = sandboxImageUri.split(':');
        return `${baseUri}:${process.env.SANDBOX_IMAGE_TAG}`;
    }

    if (process.argv.includes('--skip-npm-install-build')) {
        return sandboxImageUri.includes(':') ? sandboxImageUri : `${sandboxImageUri}-localdev`;
    }
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, -4);
    const baseUriForTimestamp = sandboxImageUri.substring(0, sandboxImageUri.lastIndexOf('/sandbox:') + '/sandbox'.length); // get base up to .../sandbox
    return `${baseUriForTimestamp}:local-${timestamp}`;
}

const IMAGE_TAG = getImageTag();

console.log(`Building sandbox with image tag: ${IMAGE_TAG}`);

console.log('Cleaning up old sandbox artifacts...');
if (existsSync(SANDBOX_DIR)) {
  rmSync(SANDBOX_DIR, { recursive: true, force: true });
}
mkdirSync(SANDBOX_DIR, { recursive: true });
mkdirSync(path.join(SANDBOX_DIR, 'dist'), { recursive: true });

const skipNpmInstallBuild = process.argv.includes('--skip-npm-install-build');

if (!skipNpmInstallBuild) {
  console.log('Running npm install and build for packages...');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: ROOT_DIR });
    execSync('npm run build:packages', { stdio: 'inherit', cwd: ROOT_DIR });
  } catch (error) {
    console.error('Failed during npm install or build:packages. Aborting sandbox build.', error);
    process.exit(1);
  }
} else {
  console.log('Skipping npm install and package builds as per --skip-npm-install-build flag.');
  if (!existsSync(CORE_DIST_DIR)) {
    console.warn(`Warning: ${CORE_DIST_DIR} does not exist. If core was not built, packing might fail.`);
  }
   if (!existsSync(CLI_DIST_DIR)) {
    console.warn(`Warning: ${CLI_DIST_DIR} does not exist. If cli was not built, packing might fail.`);
  }
}

console.log('Packing @google/dolphin-cli-core ...'); // Updated package name
try {
  execSync(
    `npm pack -w @google/dolphin-cli-core --pack-destination ${path.join(SANDBOX_DIR, 'dist')}`, // Updated package name
    { stdio: 'inherit', cwd: ROOT_DIR }
  );
} catch (error) {
    console.error('Failed to pack @google/dolphin-cli-core. Ensure it has been built (npm run build:core).', error);
    process.exit(1);
}

console.log('Packing @google/dolphin-cli ...'); // Updated package name
try {
 execSync(
    `npm pack -w @google/dolphin-cli --pack-destination ${path.join(SANDBOX_DIR, 'dist')}`, // Updated package name
    { stdio: 'inherit', cwd: ROOT_DIR }
  );
} catch (error) {
    console.error('Failed to pack @google/dolphin-cli. Ensure it has been built (npm run build:cli).', error);
    process.exit(1);
}

const dockerfilePath = path.join(ROOT_DIR, 'Dockerfile.sandbox');
const targetDockerfilePath = path.join(SANDBOX_DIR, 'Dockerfile');

if (!existsSync(dockerfilePath)) {
    console.error(`Error: Sandbox Dockerfile not found at ${dockerfilePath}`);
    process.exit(1);
}
cpSync(dockerfilePath, targetDockerfilePath);
console.log(`Copied ${dockerfilePath} to ${targetDockerfilePath}`);

console.log(`Building Docker image ${IMAGE_TAG}...`);
try {
  execSync(`docker build -t ${IMAGE_TAG} .`, {
    stdio: 'inherit',
    cwd: SANDBOX_DIR,
  });
  console.log(`Successfully built ${IMAGE_TAG}`);
} catch (error) {
  console.error(`Failed to build Docker image ${IMAGE_TAG}.`, error);
  process.exit(1);
}

console.log('Sandbox build process complete.');
