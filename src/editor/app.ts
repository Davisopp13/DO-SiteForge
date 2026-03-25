// SiteForge Editor — Main Application Entry

function init() {
  const toolbar = document.getElementById('sf-toolbar');
  const canvas = document.getElementById('sf-canvas');
  const properties = document.getElementById('sf-properties');

  if (!toolbar || !canvas || !properties) {
    console.error('SiteForge: Missing required DOM elements');
    return;
  }

  // Properties panel placeholder
  properties.innerHTML = `
    <div class="sf-properties-placeholder">
      Select an element to see its properties
    </div>
  `;

  console.log('SiteForge editor initialized');
}

document.addEventListener('DOMContentLoaded', init);
