// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
console.clear(); // Clear previous logs
console.log("Plugin started");

// Types
type PluginError = {
  code: 'SELECTION_ERROR' | 'NODE_NOT_FOUND' | 'ZOOM_ERROR' | 'PLUGIN_ERROR' | 'AI_ERROR';
  message: string;
};

type AiReductionRequest = {
  type: 'reduce-text';
  nodeId: string;
  mode: 'shorter' | 'longer';
  length: 'very' | 'moderate' | 'slightly' | 'elaborate';
  context?: string;
};

// Constants
const TEXT_PREVIEW_LENGTH = 50;
import { OPENAI_API_KEY } from './src/keys';

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequests: 3,
  windowMs: 60000, // 1 minute
  requests: [] as number[]
};

// Utility functions
function truncateText(text: string): string {
  try {
    const truncated = text.replace(/\n/g, ' ').trim();
    return truncated.length > TEXT_PREVIEW_LENGTH 
      ? truncated.slice(0, TEXT_PREVIEW_LENGTH) + '...'
      : truncated;
  } catch (error) {
    console.error('Error truncating text:', error);
    return text;
  }
}

async function checkRateLimit(): Promise<boolean> {
  const now = Date.now();
  RATE_LIMIT.requests = RATE_LIMIT.requests.filter(time => now - time < RATE_LIMIT.windowMs);
  if (RATE_LIMIT.requests.length < RATE_LIMIT.maxRequests) {
    RATE_LIMIT.requests.push(now);
    return true;
  }
  return false;
}

async function loadTextNodeFont(textNode: TextNode) {
  const fontName = textNode.fontName as FontName;
  if (fontName) {
    await figma.loadFontAsync(fontName);
  }
}

// Selection handling
function handleTextLayerSelection() {
  try {
    const selectedLayers = figma.currentPage.selection
      .filter(node => node.type === "TEXT");

    if (selectedLayers.length === 0) {
      return figma.ui.postMessage({ type: 'no-text-selected' });
    }

    const layersInfo = selectedLayers.map(node => {
      try {
        const textNode = node as TextNode;
        return {
          id: node.id,
          name: node.name,
          characters: textNode.characters,
          truncatedText: truncateText(textNode.characters),
          showName: node.name !== textNode.characters,
          isExpandable: textNode.characters.length > TEXT_PREVIEW_LENGTH
        };
      } catch {
        return {
          id: node.id,
          name: node.name,
          characters: 'Error loading text content',
          truncatedText: 'Error loading text content',
          showName: true,
          isExpandable: false
        };
      }
    });
    
    figma.ui.postMessage({
      type: 'update-selection',
      layers: layersInfo
    });
  } catch {
    figma.ui.postMessage({
      type: 'error',
      error: {
        code: 'SELECTION_ERROR',
        message: 'Error processing selection'
      } as PluginError
    });
  }
}

// AI text processing
async function reduceTextWithAI(text: string, mode: 'shorter' | 'longer', length: string, context?: string): Promise<string> {
  const getLengthTarget = () => {
    switch (length) {
      case 'very': return '25%';
      case 'moderate': return mode === 'shorter' ? '50%' : '150%';
      case 'slightly': return mode === 'shorter' ? '75%' : '120%';
      case 'elaborate': return '200%';
      default: return '50%';
    }
  };

  const targetPercentage = parseInt(getLengthTarget());
  const targetLength = Math.floor(text.length * (targetPercentage / 100));
  const contextPrompt = context ? `\nAdditional context/instructions: ${context}` : '';
  
  const prompt = mode === 'shorter' 
    ? `You are a text optimization expert. Your task is to rewrite and shorten the following text:

       STRICT LENGTH REQUIREMENTS:
       - Current length: ${text.length} characters
       - Target length: ${targetLength} characters (${getLengthTarget()} of original)
       - Output MUST be shorter than the input text
       - Stay as close to target length as possible

       CONTENT GUIDELINES:
       1. Preserve the core message and key information
       2. Maintain the same tone and professionalism
       3. Focus on removing:
          - Redundant phrases
          - Unnecessary adjectives
          - Filler words
          - Verbose expressions
       4. Use:
          - Shorter synonyms
          - Simpler sentence structures
          - Concise phrasing
       
       ${contextPrompt}

       Original text for reference:
       "${text}"

       Rewrite the above text to be more concise while keeping its essential meaning.`
    : `You are a text enhancement expert. Your task is to expand the text to approximately ${getLengthTarget()} of its original length:
       
       Rules:
       1. Maintain the original tone and style
       2. Add relevant supporting details
       3. Enhance clarity and context
       4. Keep additions natural and meaningful
       5. Avoid unnecessary repetition
       ${contextPrompt}`;

  try {
    if (!await checkRateLimit()) {
      throw new Error('Rate limit exceeded. Please wait a minute before trying again.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "system",
          content: prompt
        }, {
          role: "user",
          content: text
        }],
        temperature: 0.2,  // Reduced for more consistent results
        presence_penalty: 0.0,  // Reset to default
        frequency_penalty: 0.0,  // Reset to default
        max_tokens: mode === 'shorter' ? Math.ceil(text.length / 2) : Math.ceil(text.length * 2)  // Add token limit
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'API request failed');
    }

    const data = await response.json();
    const result = data.choices[0].message.content;

    // For shorter mode, verify the length requirement
    if (mode === 'shorter') {
      if (result.length >= text.length) {
        throw new Error('AI failed to reduce text length. Please try again or choose a different reduction level.');
      }
      
      // Check if result is significantly longer than target
      if (result.length > targetLength * 1.2) {
        console.warn('AI output is longer than target length', {
          target: targetLength,
          actual: result.length
        });
      }
    }

    return result;
  } catch (error) {
    console.error('AI reduction error:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to reduce text with AI');
  }
}

// Message handling
figma.ui.onmessage = async (msg) => {
  try {
    switch (msg.type) {
      case 'focus-node':
        const node = await figma.getNodeByIdAsync(msg.nodeId);
        if (!node || !('type' in node)) {
          throw new Error('Invalid node');
        }

        const sceneNode = node as SceneNode;
        if (!figma.currentPage.selection.some(selected => selected.id === sceneNode.id)) {
          figma.currentPage.selection = [...figma.currentPage.selection, sceneNode];
        }

        figma.viewport.scrollAndZoomIntoView([sceneNode]);
        figma.viewport.zoom = figma.viewport.zoom * 1.5;
        handleTextLayerSelection();
        break;

      case 'reduce-text':
        const textNode = await figma.getNodeByIdAsync(msg.nodeId) as TextNode;
        if (!textNode || textNode.type !== 'TEXT') {
          throw new Error('Invalid text node');
        }

        await loadTextNodeFont(textNode);
        const reducedText = await reduceTextWithAI(
          textNode.characters,
          msg.mode,
          msg.length,
          msg.context
        );
        
        textNode.characters = reducedText;
        handleTextLayerSelection();
        break;

      default:
        console.warn('Unknown message type:', msg.type);
    }
  } catch (error) {
    console.error('Operation error:', error);
    figma.ui.postMessage({
      type: 'error',
      error: {
        code: 'AI_ERROR',
        message: error instanceof Error ? error.message : 'Operation failed'
      } as PluginError
    });
  }
};

// Initialize plugin
console.clear();
console.log("Plugin started");

figma.showUI(__html__, { 
  width: 320,
  height: 640
});

handleTextLayerSelection();
figma.on('selectionchange', handleTextLayerSelection);
