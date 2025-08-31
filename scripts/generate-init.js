#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the menu items data
const menuItemsPath = path.join(__dirname, '../data/menu-items.json');
const initPath = path.join(__dirname, '../mocks/simphony/init.json');

try {
  // Read the menu items
  const menuItems = JSON.parse(fs.readFileSync(menuItemsPath, 'utf8'));

  // Read the existing init.json
  const initConfig = JSON.parse(fs.readFileSync(initPath, 'utf8'));

  // Find the menu response and replace it with the actual menu items
  const menuResponse = initConfig.find(
    (item) => item.httpRequest?.path === '/api/v2/menus/.*'
  );

  if (menuResponse) {
    menuResponse.httpResponse.body = menuItems;
  }

  // Write the updated init.json
  fs.writeFileSync(initPath, JSON.stringify(initConfig, null, 2));

  console.log('✅ Successfully updated init.json with menu-items.json data');
} catch (error) {
  console.error('❌ Error updating init.json:', error.message);
  process.exit(1);
}
