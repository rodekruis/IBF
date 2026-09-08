# VS Code settings

## Azure DevOps MCP server

[`.vscode/mcp.json`](./.vscode/mcp.json) links this repo to the NLRC MCP server so Copilot can access different MCP servers.

### MCP servers.

- `ado`: Azure Dev Ops (Azure Board)
- `figma`: Figma. The handover design file is linked to in `agents.md`. If you need it to look at another file, just copy-paste in the Figma page uri to the prompt so the LLM can get the file key and node id.

### How to use

1. Login with `az login` in the terminal
2. Go to the [`.vscode/mcp.json`](./.vscode/mcp.json) file in VS Code, and click the small `Start` text just above the named MCP config object (i.e. above `ado`).
3. The `Start` text should now be replaced with `Running` and with other commands such as `Stop`. You can now prompt the LLM to access resources there with prompts such as 'Do task 44300' for Azure.
