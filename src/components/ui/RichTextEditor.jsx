// src/components/ui/RichTextEditor.jsx
// Shared Quill 2.x rich-text editor for Governance pages (and anywhere else).
// Uses vanilla Quill + useRef so React never owns the DOM node.
// Props:
//   value       — HTML string (controlled)
//   onChange    — (htmlString) => void
//   placeholder — string
//   minHeight   — px number (default 220)
//   readOnly    — boolean
//   toolbar     — 'full' | 'minimal' | false  (default 'full')

import { useEffect, useRef } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'

// ── Quill toolbar configs ────────────────────────────────────────
const TOOLBARS = {
  full: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
    ['blockquote', 'code-block'],
    ['link'],
    ['clean'],
  ],
  minimal: [
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['clean'],
  ],
}

// Quill-override CSS injected once per page
let styleInjected = false
function injectQuillThemeOverride() {
  if (styleInjected || typeof document === 'undefined') return
  styleInjected = true
  const s = document.createElement('style')
  s.id = 'quill-bravura-override'
  s.textContent = `
    /* ── Quill toolbar ─────────────────────────────────────────── */
    .ql-toolbar.ql-snow {
      background: var(--surface2) !important;
      border-color: var(--border) !important;
      border-radius: 8px 8px 0 0 !important;
      padding: 6px 10px !important;
      flex-wrap: wrap !important;
    }
    .ql-toolbar.ql-snow .ql-formats { margin-right: 8px !important; }
    .ql-toolbar.ql-snow button,
    .ql-toolbar.ql-snow .ql-picker-label {
      color: var(--text-mid) !important;
    }
    .ql-toolbar.ql-snow button:hover,
    .ql-toolbar.ql-snow .ql-picker-label:hover,
    .ql-toolbar.ql-snow button.ql-active,
    .ql-toolbar.ql-snow .ql-picker-label.ql-active {
      color: var(--gold) !important;
    }
    .ql-toolbar.ql-snow button svg,
    .ql-toolbar.ql-snow .ql-picker-label svg { stroke: currentColor !important; }
    .ql-toolbar.ql-snow .ql-fill { fill: currentColor !important; stroke: none !important; }
    .ql-toolbar.ql-snow .ql-stroke { stroke: currentColor !important; fill: none !important; }
    .ql-toolbar.ql-snow .ql-picker-options {
      background: var(--surface) !important;
      border-color: var(--border) !important;
      box-shadow: 0 4px 16px rgba(0,0,0,.4) !important;
    }
    .ql-toolbar.ql-snow .ql-picker-item { color: var(--text-mid) !important; }
    .ql-toolbar.ql-snow .ql-picker-item:hover { color: var(--text) !important; background: var(--surface2) !important; }

    /* ── Quill editor container ─────────────────────────────────── */
    .ql-container.ql-snow {
      background: var(--surface) !important;
      border-color: var(--border) !important;
      border-radius: 0 0 8px 8px !important;
      font-family: inherit !important;
      font-size: 13px !important;
    }
    .ql-editor {
      color: var(--text) !important;
      line-height: 1.8 !important;
      caret-color: var(--gold) !important;
    }
    .ql-editor.ql-blank::before {
      color: var(--text-dim) !important;
      font-style: italic !important;
    }
    .ql-editor h1 { font-size: 20px !important; font-weight: 800 !important; color: var(--text) !important; }
    .ql-editor h2 { font-size: 16px !important; font-weight: 700 !important; color: var(--text) !important; }
    .ql-editor h3 { font-size: 14px !important; font-weight: 700 !important; color: var(--text) !important; }
    .ql-editor blockquote {
      border-left: 3px solid var(--gold) !important;
      color: var(--text-mid) !important;
      background: rgba(184,163,100,.07) !important;
      padding: 8px 14px !important;
      border-radius: 0 6px 6px 0 !important;
      margin: 8px 0 !important;
    }
    .ql-editor code, .ql-editor pre {
      background: var(--surface2) !important;
      color: var(--teal) !important;
      border-radius: 4px !important;
    }
    .ql-editor a { color: var(--blue) !important; }
    .ql-editor ul li, .ql-editor ol li { color: var(--text) !important; }
    .ql-editor ul li::before { color: var(--gold) !important; }

    /* tooltip */
    .ql-tooltip {
      background: var(--surface) !important;
      border-color: var(--border) !important;
      color: var(--text) !important;
      box-shadow: 0 4px 16px rgba(0,0,0,.4) !important;
      border-radius: 8px !important;
    }
    .ql-tooltip input[type=text] {
      background: var(--surface2) !important;
      border-color: var(--border) !important;
      color: var(--text) !important;
      border-radius: 6px !important;
    }
    .ql-tooltip a.ql-action,
    .ql-tooltip a.ql-remove { color: var(--gold) !important; }
  `
  document.head.appendChild(s)
}

export default function RichTextEditor({
  value        = '',
  onChange,
  placeholder  = 'Write here…',
  minHeight    = 220,
  readOnly     = false,
  toolbar      = 'full',
}) {
  const containerRef = useRef(null) // outer wrapper div
  const quillRef     = useRef(null) // Quill instance
  const valueRef     = useRef(value) // track last value we set

  // Init once
  useEffect(() => {
    injectQuillThemeOverride()
    if (quillRef.current || !containerRef.current) return

    const editorEl = containerRef.current.querySelector('.ql-target')

    const q = new Quill(editorEl, {
      theme:  'snow',
      readOnly,
      placeholder,
      modules: {
        toolbar: toolbar === false ? false : (TOOLBARS[toolbar] || TOOLBARS.full),
      },
    })

    // Set initial content
    if (value) {
      q.root.innerHTML = value
      valueRef.current = value
    }

    // Emit changes
    q.on('text-change', () => {
      const html = q.root.innerHTML === '<p><br></p>' ? '' : q.root.innerHTML
      valueRef.current = html
      onChange?.(html)
    })

    quillRef.current = q

    // readOnly styling
    if (readOnly) {
      if (containerRef.current) {
        const toolbar = containerRef.current.querySelector('.ql-toolbar')
        if (toolbar) toolbar.style.display = 'none'
      }
    }

    return () => {
      // Quill 2.x doesn't have a destroy() — just null the ref
      quillRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes (e.g. when parent resets the form)
  useEffect(() => {
    const q = quillRef.current
    if (!q) return
    if (value !== valueRef.current) {
      q.root.innerHTML = value || ''
      valueRef.current = value
    }
  }, [value])

  return (
    <div ref={containerRef} className="rte-wrapper" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="ql-target" style={{ minHeight }} />
    </div>
  )
}

// ── Static helper — strip HTML tags for preview text ────────────
export function stripHtml(html = '') {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── Detect if stored content is HTML ────────────────────────────
export function isHtmlContent(str = '') {
  return typeof str === 'string' && str.trimStart().startsWith('<')
}
