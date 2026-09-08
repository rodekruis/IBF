# VS Code settings

## Azure DevOps MCP server

[`.vscode/mcp.json`](./.vscode/mcp.json) links this repo to the NLRC MCP server so Copilot can access Azure Board tasks directly. How to use:

1. Login with `az login` in the terminal
2. Go to the [`.vscode/mcp.json`](./.vscode/mcp.json) file in VS Code, and click the small `Start` text just above the `ado` object.
3. The `Start` text should now be replaced with `Running` and with other commands such as `Stop`. You can now prompt the LLM to handle AB items with prompts like 'Do task 44300'.
