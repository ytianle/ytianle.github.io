import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
});

// Important: necessary to make it visible to Material for MkDocs
window.mermaid = mermaid;
