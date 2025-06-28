# dolphin-cli CLI

Within dolphin-cli, `packages/cli` is the frontend for users to send and receive prompts with the Google Gemini AI model and its associated tools. For a general overview of dolphin-cli, see the [main documentation page](../index.md).

## Navigating this section

- **[Authentication](./authentication.md):** A guide to setting up authentication with Google's AI services.
- **[Commands](./commands.md):** A reference for dolphin-cli commands (e.g., `/help`, `/tools`, `/theme`).
- **[Configuration](./configuration.md):** A guide to tailoring dolphin-cli behavior using configuration files.
- **[Token Caching](./token-caching.md):** Optimize API costs through token caching.
- **[Themes](./themes.md)**: A guide to customizing the CLI's appearance with different themes.
- **[Tutorials](tutorials.md)**: A tutorial showing how to use dolphin-cli to automate a development task.

## Non-interactive mode

dolphin-cli can be run in a non-interactive mode, which is useful for scripting and automation. In this mode, you pipe input to the CLI, it executes the command, and then it exits.

The following example pipes a command to dolphin-cli from your terminal:

```bash
echo "What is fine tuning?" | dolphin-cli
```

dolphin-cli executes the command and prints the output to your terminal. Note that you can achieve the same behavior by using the `--prompt` or `-p` flag. For example:

```bash
dolphin-cli -p "What is fine tuning?"
```
