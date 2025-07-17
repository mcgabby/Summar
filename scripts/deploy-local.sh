#!/bin/bash
set -e

echo "🚀 Deploying Summar plugin locally for testing..."

# Configuration - Adjust these paths to match your setup
OBSIDIAN_VAULT_PATH="$HOME/Documents/Obsidian/TestVault"
PLUGIN_DIR="$OBSIDIAN_VAULT_PATH/.obsidian/plugins/summar"
BUILD_DIR="./dist"

# Check if Obsidian vault exists
if [ ! -d "$OBSIDIAN_VAULT_PATH" ]; then
    echo "❌ Obsidian vault not found at: $OBSIDIAN_VAULT_PATH"
    echo "📝 Please update OBSIDIAN_VAULT_PATH in this script"
    echo "💡 Or create a test vault at the specified location"
    exit 1
fi

# Create plugin directory if it doesn't exist
echo "📁 Creating plugin directory..."
mkdir -p "$PLUGIN_DIR"

# Check if build exists
if [ ! -d "$BUILD_DIR" ]; then
    echo "❌ Build directory not found. Running build first..."
    npm run build
fi

# Copy plugin files
echo "📦 Copying plugin files..."
cp "$BUILD_DIR/main.js" "$PLUGIN_DIR/"
cp "$BUILD_DIR/manifest.json" "$PLUGIN_DIR/"
cp "$BUILD_DIR/styles.css" "$PLUGIN_DIR/"

# Copy additional required files
if [ -f "$BUILD_DIR/models.json" ]; then
    cp "$BUILD_DIR/models.json" "$PLUGIN_DIR/"
fi

if [ -f "$BUILD_DIR/prompts.json" ]; then
    cp "$BUILD_DIR/prompts.json" "$PLUGIN_DIR/"
fi

if [ -f "$BUILD_DIR/model-pricing.json" ]; then
    cp "$BUILD_DIR/model-pricing.json" "$PLUGIN_DIR/"
fi

if [ ! -f "$BUILD_DIR/fetch_calendar" ]; then
    echo "🛠️ fetch_calendar 바이너리가 없습니다. npm run build로 먼저 빌드하세요."
else
    cp "$BUILD_DIR/fetch_calendar" "$PLUGIN_DIR/"
fi
fi

echo "✅ Plugin deployed successfully to: $PLUGIN_DIR"
echo ""
echo "📋 Next steps:"
echo "1. Open Obsidian"
echo "2. Go to Settings > Community Plugins"
echo "3. Refresh or reload the Summar plugin"
echo "4. Run your tests"
echo ""
echo "💡 Use 'npm run obsidian:reload' to reload Obsidian automatically"
