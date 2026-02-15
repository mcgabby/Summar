# Summar Plugin Tips & Features Guide

This document provides a comprehensive guide to all the features and user actions available in the Summar plugin.

## 1. SummarSettingTab Features

The Summar plugin settings are organized into multiple tabs, each offering specific configuration options:

### Common Tab
- **API Configuration**: Set up OpenAI API Key, OpenAI API Endpoint URL, and Gemini API Key
- **Confluence Integration**: Configure Confluence API Token, Domain, and Parent Page settings
  - Toggle Confluence API usage on/off
  - Enter Confluence Parent Page URL to automatically extract Space Key and Page ID
  - Use the "✓" button to validate and auto-populate Confluence settings
  - Automatic domain extraction from Parent Page URL
  - Enhanced XHTML compatibility for content upload
- **Slack API Integration** *(macOS/Desktop only)*: Complete Slack workspace integration for note sharing
  - **Master Toggle**: "Use Slack API" checkbox enables/disables all Slack features
  - **Bot Token**: Enter your Slack Bot Token (xoxb-...) for API authentication
    - Supports empty token mode for limited functionality
    - Dynamic validation and connection testing
  - **Target Configuration**: 
    - Channel/User targeting with #channel or @username format
    - Automatic channel type detection (public, private, DM)
    - Dynamic tooltips showing channel information
  - **Workspace Settings**:
    - Workspace domain (without https://, auto-added)
    - Custom API domain for enterprise Slack installations
  - **Dual Upload Modes**:
    - **Canvas Mode**: Creates collaborative Slack Canvas documents
    - **Message Mode**: Sends formatted messages to channels/DMs
  - **Smart UI Controls**: All Slack settings automatically enable/disable based on master toggle
  - **Advanced Markdown Processing**: Converts Obsidian markdown to Slack-compatible formats
- **Version Management**: View current plugin version and check for updates
  - Force update button becomes available when new versions are detected
  - Automatic Obsidian restart after plugin updates
  - Enhanced update mechanism with progress indicators

### Webpage Tab
- **Model Selection**: Choose AI model for web page summarization (gpt-4o, gpt-4.1, gpt-4.1-mini, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5.1, gpt-5.2, gpt-5.2-chat-latest, o1-mini, o3-mini, gemini-2.0-flash, gemini-2.5-flash, gemini-3-pro-preview, gemini-3-flash-preview)
- **Prompt Management**: 
  - Edit custom prompts for web page summarization
  - "Set default prompt" button to restore original settings
  - "Revert" button to undo changes since tab activation
- **Real-time Validation**: Buttons enable/disable based on content changes

### PDF Tab (macOS/Desktop only)
- **Model Selection**: Choose AI model for PDF to Markdown conversion
- **Prompt Management**: Same functionality as Webpage tab
  - Custom prompts for PDF processing
  - Set default and revert buttons with smart state management

### Recording Tab
- **Audio Device Selection**: Choose recording device from available audio inputs
- **Storage Configuration**: Set temporary folder for audio files and transcriptions
- **Language Settings**: Select transcription language (Auto Detect, Korean, Japanese, English, Chinese, Thai, Vietnamese)
- **Model Configuration**: 
  - STT (Speech-to-Text) model selection
  - Transcript summary model selection
  - Custom prompts for STT and summarization with set default/revert functionality
- **Custom Vocabulary Management**:
  - Enable the "Custom Vocabulary" option to provide comma-separated domain terms
  - Shared with live transcription prompts and file-based STT requests
  - Ensures consistent spelling in transcripts across Whisper, Gemini, and Google models
- **Recording Settings**:
  - Recording unit (1-20 seconds)
  - Toggle for saving transcripts to new notes
  - Daily Notes integration toggle (when Daily Notes plugin is enabled)
  - **Organize by Date**: Option to organize recordings into date hierarchy folders (YYYY/YYYY-MM/YYYY-MM-DD (Day))
  - **Folder Autocomplete**: Recording folder path input with autocomplete suggestions from existing vault folders
- **Summary Refinement**: 
  - Toggle summary refinement feature
  - Custom prompts for refining summaries
  - Set default/revert functionality for refinement prompts

### Custom Command Tab
- **Command Management**: Create up to 10 custom commands
- **Command Configuration**:
  - Menu name for context menu display
  - AI model selection (gpt-4o, gpt-4.1, gpt-4.1-mini, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5.1, gpt-5.2, gpt-5.2-chat-latest, o1-mini, o3-mini, gemini-2.0-flash, gemini-2.5-flash, gemini-3-pro-preview, gemini-3-flash-preview)
  - Custom prompt for selected text processing
  - Hotkey assignment (supports Ctrl/Cmd + Shift + Alt combinations)
  - Result handling options:
    - "Append Results to Note" - adds results to current note
    - "Copy Results to Clipboard" - copies results to clipboard
- **Command Actions**:
  - "Add Command" button to create new commands
  - "Remove Command" (trash icon) to delete existing commands

### Schedule Tab (macOS/Desktop only)
- **Calendar Integration**: Add up to 5 macOS calendars for event detection
- **Auto-Launch Settings**:
  - Toggle automatic Zoom meeting launch
  - Option to launch only accepted meetings
- **Calendar Management**:
  - "Add Calendar" button to add calendar sources
  - Individual calendar selection dropdowns
  - Remove calendar functionality

### Stats Tab
- **API Usage Statistics**: Visual dashboard showing:
  - Total API calls, tokens used, and costs
  - Success rates and average latency
  - Feature-wise breakdown with interactive charts
  - Model usage statistics with cost tracking
- **Conversation Retention**:
  - Configure automatic cleanup window (in minutes) for stored conversations
  - Controls how long conversation history and intermediate drafts remain available for reloading

## 2. SummarView Features

The SummarView provides a dedicated interface for interacting with Summar features:

### Input Controls
- **URL Input Field**: Enter web page URLs for summarization
- **GO Button**: Fetch and summarize web pages
- **PDF Button**: Convert PDF files to Markdown (macOS/Desktop only)
- **Record Button**: Start/stop audio recording with "[●] record" label

### Action Buttons
- **Upload to Confluence Button** (file-up icon): 
  - Upload current note content to Confluence wiki
  - Automatically detects note type and formats accordingly
  - Shows success/failure notifications with links to created pages
  - Enhanced domain extraction and XHTML compatibility
- **Upload to Slack Button** *(macOS/Desktop only)*: 
  - Share current note content to Slack workspace
  - **Dual Mode Operation**:
    - **Canvas Mode**: Creates collaborative Slack Canvas documents
    - **Message Mode**: Sends formatted messages to configured channel/DM
  - **Smart Content Processing**:
    - Converts Obsidian markdown to Slack-compatible formats
    - Preserves formatting (bold, italic, lists, code blocks)
    - Removes Obsidian-specific elements (frontmatter, comments, block references)
  - **Dynamic State Management**: 
    - Auto-enables/disables based on Slack API toggle in settings
    - Shows appropriate success messages with direct Slack links
  - **Enhanced Tooltips**: 
    - Displays channel type information (#channel vs @DM)
    - Shows real-time channel status and type detection
- **New Note Button** (file-output icon):
  - Create new notes from summarization results
  - Auto-generates timestamped filenames
  - Opens created notes automatically

### Result Display
- **Result Container**: Large text area displaying:
  - Summarization progress and status
  - Final results and error messages
  - Real-time updates during processing
- **Chat Interface**:
  - Inline composer embeds allow follow-up prompts via the **Reply** button
  - Recent assistant/author messages appear as collapsible conversation items beneath each result
  - Supports IME-aware input handling for precise Enter/Shift+Enter behavior
- **Sticky Output Headers**:
  - SummarHeader keeps key actions (Copy, Reply, New Note, Upload buttons) responsive as you scroll
  - Buttons automatically collapse/expand based on viewport width and configured integrations

### Status Integration
- **Dynamic Button States**: Buttons enable/disable based on:
  - Available content for processing
  - API key configuration
  - Platform compatibility (PDF/Calendar features)
  - Service integration toggles (Confluence/Slack API status)
- **Smart UI Controls**: 
  - Settings automatically enable/disable related controls
  - Real-time state synchronization between settings and UI
  - Visual feedback for configuration status
- **Enhanced Tooltips**: 
  - Context-sensitive help and status information
  - Dynamic content based on current configuration
  - Interactive channel/service information display
- **Conversation Management**:
  - Load recent conversations from the `conversations/` directory via the header menu
  - Original import filenames are preserved to make reloading historical sessions effortless
  - Fold/unfold actions keep transcript, conversation, and note-sync items synchronized
  - **Delete Conversations**: Remove individual conversation entries from the list via context menu
  - **Context Menu Copy Options**: Right-click on conversation items for copy options:
    - **Copy as Markdown**: Copy raw markdown content to clipboard
    - **Copy as Formatted**: Copy rendered/formatted content to clipboard

## 3. Conversation Workflows

Summar now treats every transcript or summarization run as part of a persistent conversation.

- **Automatic Saving**: Chats and summaries persist to the `conversations/` folder with timestamped filenames.
- **Manual Reload**: Use the header menu → **Load conversations** to restore prior sessions, including note context and assistant outputs.
- **Cleanup Policy**: The retention slider in settings purges aged conversations while keeping recent history accessible.
- **Note Synchronization**: When a conversation writes back to a note, the header highlights the linked note and surfaces `context: [[Note Title]]` chips for quick navigation.
- **Reply Workflow**: Hitting **Reply** re-opens the composer with the recent context and adheres to the active conversation model selection.

## 4. Command Palette Integrations

Access Summar features through Obsidian's Command Palette (Ctrl/Cmd+P):

### Built-in Commands
- **"Summarize web page"**: Opens URL input dialog for web page summarization
- **"Convert PDF to Markdown"**: Opens file dialog for PDF processing
- **"Start/Stop recording"**: Toggle audio recording (default hotkey: Ctrl/Cmd+R)
- **"Summarize meeting from audio file"**: Select single audio file for transcription
- **"Summarize meeting from multiple audio files"**: Select multiple audio files or folders
- **"Show Summar stats"**: Open API usage statistics dashboard

### Custom Commands
- **User-defined Commands**: Each custom command appears in the palette with:
  - User-specified command name
  - Assigned hotkey (if configured)
  - Text selection requirement for execution

### Command Behavior
- **Text Selection**: Commands automatically select current line if no text is selected
- **Result Handling**: Based on command configuration (append to note/copy to clipboard)
- **Error Handling**: Commands show appropriate error messages for missing API keys or configuration

## 5. File Explorer Integrations

Right-click context menus in Obsidian's file explorer provide direct access to Summar features:

### Audio File Context Menu
For audio files (.mp3, .wav, .webm, .ogg, .m4a):
- **"Summarize meeting from audio file"**: Direct transcription and summarization
- Automatically activates SummarView and processes the file
- Supports meeting information extraction from calendar events

### PDF File Context Menu (macOS/Desktop only)
For PDF files:
- **"Convert PDF to Markdown"**: Direct PDF to Markdown conversion
- Processes file and displays results in SummarView

### Transcript File Context Menu
For files containing " transcript.md" in the name:
- **"Summarize meeting from transcript file"**: Generate summary from existing transcript
- Reads transcript content and creates summary

### Folder Context Menu
For folders containing audio or webm files:
- **"Summarize meeting from multiple audio files"**: Process all audio files in folder
- Automatically filters and processes relevant audio files
- Combines multiple files for comprehensive meeting transcription

## 6. Text Selection Context Menu

Right-click on selected text in notes to access custom commands:

### Dynamic Menu Items
- **Custom Command Names**: User-defined menu items appear based on configured custom commands
- **Text Processing**: Selected text is sent to AI models with custom prompts
- **Automatic Selection**: If no text is selected, automatically selects current line

### Execution Behavior
- **Immediate Processing**: Commands execute immediately upon selection
- **Progress Indication**: SummarView shows processing status
- **Result Integration**: Results can be appended to note or copied to clipboard based on command settings

### Error Handling
- **API Key Validation**: Commands check for required API keys before execution
- **Model Availability**: Validates selected AI model availability
- **Graceful Failure**: Shows descriptive error messages for common issues

## 7. Link Context Menu Integration

Right-click on links in notes to access web page summarization:

### URL Processing
- **"Summary web page using Summar"**: Direct web page summarization from links
- **Automatic Activation**: Opens SummarView and begins processing
- **Link Validation**: Handles various URL formats and protocols

### Integration Features
- **Context Preservation**: Maintains note context while processing external content
- **Result Display**: Shows summarization progress and results in SummarView
- **Error Handling**: Graceful handling of invalid URLs or network issues

## 8. Testing & Development

### Automated Testing Setup

The Summar plugin includes a comprehensive testing framework to ensure reliability and ease development:

#### Test Types
- **Unit Tests**: Test individual components and functions in isolation
- **Integration Tests**: Test workflows and component interactions
- **E2E Tests**: Test the plugin in a real Obsidian environment

#### Available Test Commands
```bash
# Run all unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests (requires local Obsidian setup)
npm run test:e2e

# Run all tests with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# Complete build and test pipeline
npm run build:test
```

#### Development Workflow
```bash
# Quick development cycle
npm run dev:test

# Manual workflow
npm run build
npm run deploy:local
npm run obsidian:reload
```

#### VSCode Integration
Use the built-in tasks (Ctrl/Cmd+Shift+P → "Tasks: Run Task"):
- **Build Plugin**: Standard build process
- **Build and Test**: Complete testing pipeline
- **Dev Mode**: Build, deploy, and reload Obsidian
- **Deploy to Obsidian**: Deploy to local Obsidian vault

#### Setting Up Test Environment
1. **Create Test Vault**: Set up an Obsidian vault for testing
2. **Configure Paths**: Update `scripts/deploy-local.sh` with your vault path
3. **Install Dependencies**: Run `npm install` to get test dependencies
4. **Run Tests**: Use any of the test commands above

#### Continuous Integration
The project includes GitHub Actions for automated testing on:
- Multiple Node.js versions (18.x, 20.x)
- Unit and integration tests
- Build verification
- Automated installer creation (macOS)

## Additional Tips

### Keyboard Shortcuts
- **Ctrl/Cmd+R**: Start/stop recording (default hotkey)
- **Custom Hotkeys**: User-defined hotkeys for custom commands
- **Escape**: Cancel operations in modal dialogs

### Status Bar Integration
- **Recording Status**: Visual indicator when recording is active
- **Calendar Status**: Shows calendar integration status (red when active, muted when inactive)
  - **Interactive Calendar Icon**: Click the calendar icon to open plugin settings with Schedule tab pre-selected

### File Naming Conventions
- **Auto-generated Names**: Timestamped files with format YYMMDD-HHMM
- **Smart Extensions**: Automatic .md extension for note files
- **Conflict Resolution**: Handles duplicate filenames gracefully

### Platform-Specific Features
- **macOS Exclusive**: PDF processing, Calendar integration, Schedule management
- **Cross-Platform**: Web summarization, Custom commands, Basic recording features

### Configuration Best Practices
- **API Key Security**: Store API keys securely in plugin settings
- **Model Selection**: Choose appropriate models based on task complexity and cost
- **Prompt Optimization**: Customize prompts for specific use cases and languages
- **Resource Management**: Monitor API usage through Stats dashboard
