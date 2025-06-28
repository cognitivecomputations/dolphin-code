# dolphin-cli Execution and Deployment

This document describes how to run dolphin-cli and explains the deployment architecture that dolphin-cli uses.

## Running dolphin-cli

There are several ways to run dolphin-cli. The option you choose depends on how you intend to use dolphin-cli.

---

### 1. Standard installation (Recommended for typical users)

This is the recommended way for end-users to install dolphin-cli. It involves downloading the dolphin-cli package from the NPM registry.

- **Global install:**

  ```bash
  # Install the CLI globally
  npm install -g @google/dolphin-cli

  # Now you can run the CLI from anywhere
  dolphin-cli
  ```

- **NPX execution:**
  ```bash
  # Execute the latest version from NPM without a global install
  npx @google/dolphin-cli
  ```

---

### 2. Running in a sandbox (Docker/Podman)

For security and isolation, dolphin-cli can be run inside a container. This is the default way that the CLI executes tools that might have side effects.

- **Directly from the Registry:**
  You can run the published sandbox image directly. This is useful for environments where you only have Docker and want to run the CLI.
  ```bash
  # Run the published sandbox image (ensure image name is updated if it changes)
  docker run --rm -it us-docker.pkg.dev/gemini-code-dev/dolphin-cli/sandbox:latest
  ```
- **Using the `--sandbox` flag:**
  If you have dolphin-cli installed locally (using the standard installation described above), you can instruct it to run inside the sandbox container.
  ```bash
  dolphin-cli --sandbox "your prompt here"
  ```

---

### 3. Running from source (Recommended for dolphin-cli contributors)

Contributors to the project will want to run the CLI directly from the source code.

- **Development Mode:**
  This method provides hot-reloading and is useful for active development.
  ```bash
  # From the root of the repository
  npm run start
  ```
- **Production-like mode (Linked package):**
  This method simulates a global installation by linking your local package. It's useful for testing a local build in a production workflow.

  ```bash
  # Link the local cli package to your global node_modules
  npm link packages/cli

  # Now you can run your local version using the `dolphin-cli` command
  dolphin-cli
  ```

---

### 4. Running the latest dolphin-cli commit from GitHub

You can run the most recently committed version of dolphin-cli directly from the GitHub repository. This is useful for testing features still in development.

```bash
# Execute the CLI directly from the main branch on GitHub
npx https://github.com/google/dolphin-cli
```
(Note: The GitHub URL will need to be updated once the repository is renamed.)

## Deployment architecture

The execution methods described above are made possible by the following architectural components and processes:

**NPM packages**

dolphin-cli project is a monorepo that publishes two core packages to the NPM registry:

- `@google/dolphin-cli-core`: The backend, handling logic and tool execution.
- `@google/dolphin-cli`: The user-facing frontend.

These packages are used when performing the standard installation and when running dolphin-cli from the source.

**Build and packaging processes**

There are two distinct build processes used, depending on the distribution channel:

- **NPM publication:** For publishing to the NPM registry, the TypeScript source code in `@google/dolphin-cli-core` and `@google/dolphin-cli` is transpiled into standard JavaScript using the TypeScript Compiler (`tsc`). The resulting `dist/` directory is what gets published in the NPM package. This is a standard approach for TypeScript libraries.

- **GitHub `npx` execution:** When running the latest version of dolphin-cli directly from GitHub, a different process is triggered by the `prepare` script in `package.json`. This script uses `esbuild` to bundle the entire application and its dependencies into a single, self-contained JavaScript file. This bundle is created on-the-fly on the user's machine and is not checked into the repository.

**Docker sandbox image**

The Docker-based execution method is supported by the `dolphin-cli-sandbox` container image. This image is published to a container registry and contains a pre-installed, global version of dolphin-cli. The `scripts/prepare-cli-packagejson.js` script dynamically injects the URI of this image into the CLI's `package.json` before publishing, so the CLI knows which image to pull when the `--sandbox` flag is used. (The image name in `packages/cli/package.json` under `config.sandboxImageUri` and in `.gcp/release.yaml` should also be updated to `dolphin-cli-sandbox` or similar).

## Release process

A unified script, `npm run publish:release`, orchestrates the release process. The script performs the following actions:

1.  Build the NPM packages using `tsc`.
2.  Update the CLI's `package.json` with the Docker image URI.
3.  Build and tag the `dolphin-cli-sandbox` Docker image.
4.  Push the Docker image to the container registry.
5.  Publish the NPM packages to the artifact registry.
