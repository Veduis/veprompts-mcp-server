# VePrompts MCP Server

[![npm version](https://img.shields.io/npm/v/veprompts-mcp-server.svg)](https://www.npmjs.com/package/veprompts-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23840519.svg)](https://doi.org/10.5281/zenodo.23840519)
[![PyPI](https://img.shields.io/pypi/v/veprompts-mcp.svg)](https://pypi.org/project/veprompts-mcp/)

Official Model Context Protocol (MCP) server that exposes the [VePrompts](https://veprompts.com/) library to AI clients such as Claude Desktop, Cursor, VS Code, and Cline. It provides eight tools and three read-only resources:

### Tools

- `veprompts_search` - Fuzzy search across the VePrompts library (prompts, guides, tools, MCP servers) using titles, descriptions, and tags.
- `veprompts_pricing_lookup` - Query real-time API pricing (input/output per 1M tokens) for 400+ AI models tracked by VePrompts.
- `veprompts_get_prompt` - Fetch a prompt by slug, returning its full frontmatter metadata and raw prompt template.
- `veprompts_get_mcp_server` - Fetch an MCP server directory entry by slug: description, install command, exposed tools, and client compatibility.
- `veprompts_get_skill` - Fetch an agent skill by slug: instructions plus bundled resource files.
- `veprompts_compare` - Fetch a curated X-vs-Y comparison by slug or entity name: verdict, when to pick each option, and FAQs.
- `veprompts_get_framework` - Fetch an agent framework profile by slug or name.
- `veprompts_get_glossary` - Fetch a glossary term definition by slug or term.

### Resources

- `veprompts://llms-full` - The full machine-readable site index from https://veprompts.com/llms-full.txt.
- `veprompts://pricing` - The full LLM pricing dataset from https://veprompts.com/api/v1/pricing/.
- `veprompts://mcp-servers` - The full MCP server directory from https://veprompts.com/api/v1/mcp-servers/.

---

## Quickstart (npx)

Run directly without cloning:

```bash
npx -y veprompts-mcp-server
```

---

## Client Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "veprompts": {
      "command": "npx",
      "args": ["-y", "veprompts-mcp-server"]
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json` (or via Settings > Features > MCP):

```json
{
  "mcpServers": {
    "veprompts": {
      "command": "npx",
      "args": ["-y", "veprompts-mcp-server"]
    }
  }
}
```

### VS Code

Add to your MCP settings:

```json
{
  "servers": {
    "veprompts": {
      "command": "npx",
      "args": ["-y", "veprompts-mcp-server"]
    }
  }
}
```

No API keys or environment variables are required.

---

## Local Development & Build

```bash
git clone https://github.com/Veduis/veprompts-mcp-server.git
cd veprompts-mcp-server
npm install
npm run build
node dist/index.js
```

---

## Data Provenance & Ecosystem

- **VePrompts Directory:** [https://veprompts.com/mcp-servers/](https://veprompts.com/mcp-servers/)
- **VePrompts Platform:** [https://veprompts.com/](https://veprompts.com/)
- **Veduis Core:** [https://veduis.com/](https://veduis.com/)
- **vComplianceScanner Source Auditing:** [https://veduis.com/products/vcompliance-scanner/](https://veduis.com/products/vcompliance-scanner/)
- **Zenodo CERN DOI:** [10.5281/zenodo.23840519](https://doi.org/10.5281/zenodo.23840519)
- **PyPI Package:** [https://pypi.org/project/veprompts-mcp/](https://pypi.org/project/veprompts-mcp/)

---

## License

MIT License. Copyright (c) 2026 Veduis LLC and VePrompts.
