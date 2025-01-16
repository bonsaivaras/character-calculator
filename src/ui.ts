let isProcessing = false;

// Types
interface Layer {
  id: string;
  name: string;
  characters: string;
  truncatedText: string;
  showName: boolean;
  isExpandable: boolean;
}

// Utility functions
function setLoadingState(loading: boolean) {
  isProcessing = loading;
  const container = document.getElementById('layers-container');
  if (container) {
    container.classList.toggle('loading', loading);
  }
}

function createExpandButton() {
  const button = document.createElement('button');
  button.className = 'expand-button';
  button.innerHTML = `
    <svg class="chevron" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Show more
  `;
  return button;
}

// Error handling
function showError(error: { message: string }) {
  console.log('Error details:', error);
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.innerHTML = `
    <svg class="error-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div class="error-content">${error.message}</div>
    <button onclick="this.parentElement.remove()" aria-label="Dismiss">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;
  document.body.insertBefore(errorDiv, document.body.firstChild);
  
  setTimeout(() => {
    errorDiv.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => errorDiv.remove(), 300);
  }, 5000);
}

// Modal handling
function showTextModificationModal(layer: Layer, mode: 'shorter' | 'longer', button: HTMLButtonElement) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <h3 class="modal-title">${mode === 'shorter' ? 'Make Text Shorter' : 'Make Text Longer'}</h3>
      <form class="modal-form" id="modificationForm">
        <div class="form-group">
          <label class="form-label">Target Length</label>
          <select class="form-select" name="length" required>
            ${mode === 'shorter' ? `
              <option value="very">Very short (25% of original)</option>
              <option value="moderate" selected>Moderately short (50% of original)</option>
              <option value="slightly">Slightly shorter (75% of original)</option>
            ` : `
              <option value="slightly" selected>Slightly longer (add few words)</option>
              <option value="moderate">Moderately longer (add 1-2 sentences)</option>
              <option value="elaborate">Elaborate (add supporting details)</option>
            `}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Context/Instructions (optional)</label>
          <textarea class="form-input" name="context" placeholder="Add any specific context or instructions for the AI..."></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="modal-button secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button type="submit" class="modal-button primary">Apply</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  const form = modal.querySelector('#modificationForm');
  form?.addEventListener('submit', (e) => handleModalSubmit(e, layer.id, mode, form as HTMLFormElement));
}

function handleModalSubmit(event: Event, layerId: string, mode: 'shorter' | 'longer', form: HTMLFormElement) {
  event.preventDefault();
  const formData = new FormData(form);
  const length = formData.get('length') as string;
  const context = formData.get('context') as string;
  
  parent.postMessage({ 
    pluginMessage: { 
      type: 'reduce-text',
      nodeId: layerId,
      mode,
      length,
      context
    }
  }, '*');
  
  form.closest('.modal-overlay')?.remove();
}

function handleAiReduce(layer: Layer, mode: 'shorter' | 'longer', button: HTMLButtonElement) {
  if (isProcessing) return;
  showTextModificationModal(layer, mode, button);
}

// Keyboard navigation
function handleKeyboardNavigation(e: KeyboardEvent, card: HTMLElement, layer: Layer, expandButton?: HTMLButtonElement) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (expandButton && document.activeElement === expandButton) {
      expandButton.click();
    } else {
      card.click();
    }
  }
}

// Debouncing utility
function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeout: number;
  return function(this: any, ...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  } as T;
}

// Message handling
window.onmessage = (event) => {
  const message = event.data.pluginMessage;
  
  if (message.type === 'error') {
    console.log('Received error:', message.error);
    document.querySelectorAll('.ai-button').forEach(button => {
      button.classList.remove('loading');
    });
    showError(message.error);
    setLoadingState(false);
    return;
  }
  
  const container = document.getElementById('layers-container');
  const totalCount = document.getElementById('total-count');
  const warning = document.getElementById('warning');
  
  setLoadingState(true);
  
  if (message.type === 'no-text-selected') {
    container!.innerHTML = `
      <div class="no-selection">
        <div class="splash-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 9h6M9 13h6M9 17h6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h2 class="splash-title">Text Optimizer</h2>
        <p class="splash-description">Quickly modify your text content using AI assistance</p>
        <ul class="splash-steps">
          <li class="splash-step">
            <span class="step-number">1</span>
            <span>Select one or more text layers in your design</span>
          </li>
          <li class="splash-step">
            <span class="step-number">2</span>
            <span>Use "Make shorter" to reduce text length while keeping key information</span>
          </li>
          <li class="splash-step">
            <span class="step-number">3</span>
            <span>Use "Make longer" to slightly expand the text with relevant details</span>
          </li>
        </ul>
      </div>
    `;
    totalCount!.textContent = 'Selected layers: 0';
    warning!.style.display = 'none';
    setLoadingState(false);
    return;
  }
  
  if (message.type === 'update-selection') {
    const selectedLayers = message.layers || [];
    totalCount!.textContent = `Selected layers: ${selectedLayers.length}`;
    warning!.style.display = selectedLayers.length > 20 ? 'block' : 'none';
    
    container!.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    selectedLayers.forEach((layer: Layer) => {
      const layerCard = document.createElement('div');
      layerCard.className = 'layer-card';
      layerCard.setAttribute('data-layer-id', layer.id);
      layerCard.tabIndex = 0;
      
      const handleClick = debounce((e: Event) => {
        const target = e.target as HTMLElement;
        if (!target?.closest('.expand-button') && !isProcessing) {
          setLoadingState(true);
          parent.postMessage({ 
            pluginMessage: { 
              type: 'focus-node',
              nodeId: layer.id 
            }
          }, '*');
        }
      }, 200);
      
      layerCard.onclick = handleClick;
      
      const layerContent = document.createElement('div');
      layerContent.className = 'layer-content';
      
      const layerText = document.createElement('div');
      layerText.className = 'layer-text collapsed';
      layerText.textContent = layer.truncatedText;
      layerContent.appendChild(layerText);
      
      const layerCount = document.createElement('div');
      layerCount.className = 'layer-count';
      layerCount.textContent = `${layer.characters.length} characters`;

      let expandButton: HTMLButtonElement | undefined;
      if (layer.isExpandable) {
        expandButton = createExpandButton();
        layerCount.appendChild(expandButton);
        
        expandButton.onclick = (e) => {
          if (isProcessing) return;
          
          const isExpanded = layerText.classList.contains('expanded');
          const scrollPos = container!.scrollTop;
          
          requestAnimationFrame(() => {
            if (isExpanded) {
              layerText.classList.remove('expanded');
              layerText.classList.add('collapsed');
              layerText.textContent = layer.truncatedText;
              expandButton!.innerHTML = `${expandButton!.querySelector('svg')?.outerHTML}Show more`;
              expandButton!.querySelector('.chevron')?.classList.remove('expanded');
            } else {
              layerText.classList.remove('collapsed');
              layerText.classList.add('expanded');
              layerText.textContent = layer.characters;
              expandButton!.innerHTML = `${expandButton!.querySelector('svg')?.outerHTML}Show less`;
              expandButton!.querySelector('.chevron')?.classList.add('expanded');
            }
            
            container!.scrollTop = scrollPos;
          });
        };
      }
      
      layerCard.onkeydown = (e) => handleKeyboardNavigation(e, layerCard, layer, expandButton);
      
      layerContent.appendChild(layerCount);
      layerCard.appendChild(layerContent);
      fragment.appendChild(layerCard);

      const aiActions = document.createElement('div');
      aiActions.className = 'ai-actions';
      
      const shorterButton = document.createElement('button');
      shorterButton.className = 'ai-button';
      shorterButton.textContent = 'Make shorter';
      shorterButton.onclick = (e) => {
        e.stopPropagation();
        handleAiReduce(layer, 'shorter', shorterButton);
      };
      
      const longerButton = document.createElement('button');
      longerButton.className = 'ai-button';
      longerButton.textContent = 'Make longer';
      longerButton.onclick = (e) => {
        e.stopPropagation();
        handleAiReduce(layer, 'longer', longerButton);
      };
      
      aiActions.appendChild(shorterButton);
      aiActions.appendChild(longerButton);
      layerContent.appendChild(aiActions);
    });
    
    container!.appendChild(fragment);
    setLoadingState(false);
  }
};

// Global error handling
window.onerror = function(msg, url, lineNo, columnNo, error) {
  showError({
    message: 'An unexpected error occurred'
  });
  return false;
};

// Add passive event listeners
function addPassiveEventListener(element: Element, eventName: string, handler: EventListener) {
  element.addEventListener(eventName, handler, { passive: true });
}

// Add passive scroll listener
const container = document.getElementById('layers-container');
if (container) {
  addPassiveEventListener(container, 'touchstart', () => {});
  addPassiveEventListener(container, 'scroll', () => {});
} 