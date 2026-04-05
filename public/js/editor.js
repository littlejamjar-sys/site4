/**
 * Editor enhancements — Markdown preview and toolbar.
 */
(function() {
    'use strict';

    // Find content textarea (articles, forum posts, build entries)
    const editors = document.querySelectorAll('textarea[name="content"], textarea[name="description"]');

    editors.forEach(textarea => {
        // Only enhance larger textareas (not reply boxes)
        if (textarea.rows < 5) return;

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'flex items-center gap-1 mb-2 p-2 bg-slate-800/50 rounded-lg border border-slate-700';
        toolbar.innerHTML = `
            <button type="button" data-action="bold" class="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Bold">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z"></path><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"></path></svg>
            </button>
            <button type="button" data-action="italic" class="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Italic">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>
            </button>
            <button type="button" data-action="heading" class="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Heading">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 12h12M6 4v16M18 4v16"></path></svg>
            </button>
            <span class="w-px h-5 bg-slate-700 mx-1"></span>
            <button type="button" data-action="link" class="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"></path></svg>
            </button>
            <button type="button" data-action="list" class="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="List">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            </button>
            <button type="button" data-action="quote" class="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Quote">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"></path></svg>
            </button>
            <span class="flex-1"></span>
            <span class="text-xs text-slate-600">Markdown supported</span>
        `;

        textarea.parentNode.insertBefore(toolbar, textarea);

        // Handle toolbar actions
        toolbar.addEventListener('click', function(e) {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selected = textarea.value.substring(start, end);

            let insertion = '';
            let cursorOffset = 0;

            switch (action) {
                case 'bold':
                    insertion = `**${selected || 'bold text'}**`;
                    cursorOffset = selected ? insertion.length : 2;
                    break;
                case 'italic':
                    insertion = `*${selected || 'italic text'}*`;
                    cursorOffset = selected ? insertion.length : 1;
                    break;
                case 'heading':
                    insertion = `## ${selected || 'Heading'}`;
                    cursorOffset = insertion.length;
                    break;
                case 'link':
                    insertion = `[${selected || 'link text'}](url)`;
                    cursorOffset = selected ? insertion.length - 1 : 1;
                    break;
                case 'list':
                    insertion = selected ? selected.split('\n').map(l => `- ${l}`).join('\n') : '- Item 1\n- Item 2\n- Item 3';
                    cursorOffset = insertion.length;
                    break;
                case 'quote':
                    insertion = selected ? selected.split('\n').map(l => `> ${l}`).join('\n') : '> Quote';
                    cursorOffset = insertion.length;
                    break;
            }

            textarea.value = textarea.value.substring(0, start) + insertion + textarea.value.substring(end);
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + cursorOffset;
        });

        // Tab key support (insert spaces instead of changing focus)
        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.selectionStart;
                this.value = this.value.substring(0, start) + '    ' + this.value.substring(this.selectionEnd);
                this.selectionStart = this.selectionEnd = start + 4;
            }
        });
    });

})();
