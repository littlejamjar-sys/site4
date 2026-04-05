/**
 * File upload enhancements — preview and validation.
 */
(function() {
    'use strict';

    // Enhance file inputs with preview
    document.querySelectorAll('input[type="file"][accept*="image"]').forEach(input => {
        input.addEventListener('change', function() {
            // Remove existing previews
            const existingPreview = this.parentElement.querySelector('.upload-preview');
            if (existingPreview) existingPreview.remove();

            if (this.files && this.files.length > 0) {
                // Remove any previous error messages
                this.parentElement.querySelectorAll('.upload-error').forEach(el => el.remove());

                const preview = document.createElement('div');
                preview.className = 'upload-preview flex flex-wrap gap-2 mt-2';

                const maxPreview = Math.min(this.files.length, 5);
                for (let i = 0; i < maxPreview; i++) {
                    const file = this.files[i];

                    // Validate size (5MB)
                    if (file.size > 5 * 1024 * 1024) {
                        const error = document.createElement('p');
                        error.className = 'text-sm text-red-400 mt-1 upload-error';
                        error.textContent = `${file.name} is too large (max 5MB)`;
                        this.parentElement.appendChild(error);
                        continue;
                    }

                    // Validate type
                    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/)) {
                        continue;
                    }

                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const img = document.createElement('img');
                        img.src = e.target.result;
                        img.className = 'h-20 w-auto rounded-lg object-cover border border-slate-700';
                        img.alt = file.name;
                        preview.appendChild(img);
                    };
                    reader.readAsDataURL(file);
                }

                this.parentElement.appendChild(preview);
            }
        });
    });

    // Auto-resize textareas
    document.querySelectorAll('textarea').forEach(textarea => {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 600) + 'px';
        });
    });

})();
