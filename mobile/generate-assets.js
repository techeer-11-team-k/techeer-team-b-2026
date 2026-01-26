const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Create assets directory if it doesn't exist
const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Function to create a placeholder PNG image using sharp
async function createPlaceholderPNG(filename, width, height, backgroundColor = '#ffffff', text = '') {
  const filepath = path.join(assetsDir, filename);
  
  try {
    // Create a simple colored image
    const image = sharp({
      create: {
        width: width,
        height: height,
        channels: 4,
        background: backgroundColor
      }
    });
    
    await image.png().toFile(filepath);
    console.log(`✅ Created: ${filename} (${width}x${height})`);
  } catch (error) {
    console.error(`❌ Error creating ${filename}:`, error.message);
    throw error;
  }
}

async function generateAssets() {
  console.log('Generating placeholder assets...');
  console.log('');
  
  try {
    // Create required assets
    await createPlaceholderPNG('icon.png', 1024, 1024, '#0ea5e9');
    await createPlaceholderPNG('adaptive-icon.png', 1024, 1024, '#0ea5e9');
    await createPlaceholderPNG('splash.png', 1242, 2436, '#ffffff');
    await createPlaceholderPNG('favicon.png', 48, 48, '#0ea5e9');
    
    console.log('');
    console.log('✅ All placeholder assets created successfully!');
    console.log('');
    console.log('⚠️  IMPORTANT: Replace these placeholder images with actual design assets:');
    console.log('   - icon.png: 1024x1024px app icon');
    console.log('   - adaptive-icon.png: 1024x1024px Android adaptive icon foreground');
    console.log('   - splash.png: 1242x2436px splash screen');
    console.log('   - favicon.png: 48x48px web favicon');
  } catch (error) {
    console.error('❌ Failed to generate assets:', error);
    process.exit(1);
  }
}

// Run the script
generateAssets();
