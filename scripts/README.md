# MockServer Scripts

## generate-init.js

This script updates the `init.json` file for MockServer by replacing the menu response with the actual menu data from `menu-items.json`.

### Usage

```bash
# Update init.json with menu-items.json data
make generate-init

# Or run directly
node scripts/generate-init.js
```

### How it works

1. Reads `data/menu-items.json` - the source menu data
2. Reads `mocks/simphony/init.json` - the existing configuration
3. Replaces the body in the `/api/v2/menus/.*` endpoint with the actual menu data
4. Writes the updated configuration back to `mocks/simphony/init.json`

### Benefits

- **No data duplication**: Menu data is maintained in a single source file
- **Easy updates**: Change `menu-items.json` and regenerate
- **Preserves existing config**: All other endpoints remain unchanged
- **Automated**: Can be integrated into build processes

### Files

- `scripts/generate-init.js` - The update script
- `data/menu-items.json` - Source menu data
- `mocks/simphony/init.json` - Updated file (menu response will be overwritten)

### Integration

The script is integrated into the Makefile with the `generate-init` target, making it easy to update the configuration whenever menu data changes.
