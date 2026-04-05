/**
 * Vote handling — AJAX voting for forum posts and replies.
 */
(function() {
    'use strict';

    window.vote = async function(targetType, targetId, value) {
        try {
            const res = await fetch('/api/votes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_type: targetType, target_id: targetId, value }),
            });

            if (res.status === 401) {
                window.location.href = '/auth/login';
                return;
            }

            const data = await res.json();
            if (data.error) {
                console.error('Vote error:', data.error);
                return;
            }

            // Update score display
            const container = document.getElementById(`vote-${targetType}-${targetId}`);
            if (container) {
                const scoreEl = container.querySelector('.vote-score');
                if (scoreEl) {
                    scoreEl.textContent = data.score;
                    scoreEl.className = 'text-sm font-semibold vote-score ' +
                        (data.score > 0 ? 'text-forest-400' : data.score < 0 ? 'text-red-400' : 'text-slate-400');
                }

                // Update button styles
                const buttons = container.querySelectorAll('button');
                if (buttons.length >= 2) {
                    // Upvote button
                    buttons[0].className = 'p-1 rounded hover:bg-slate-700 transition-colors ' +
                        (data.userVote === 1 ? 'text-amber-400' : 'text-slate-500 hover:text-white');
                    // Downvote button
                    buttons[1].className = 'p-1 rounded hover:bg-slate-700 transition-colors ' +
                        (data.userVote === -1 ? 'text-red-400' : 'text-slate-500 hover:text-white');
                }
            }
        } catch (err) {
            console.error('Vote failed:', err);
        }
    };

    // ── Notifications ──────────────────────────────────────────────────────────
    window.markAllRead = async function() {
        try {
            await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            const badge = document.getElementById('notification-count');
            if (badge) badge.classList.add('hidden');
            loadNotifications();
        } catch (err) {
            console.error('Failed to mark notifications as read:', err);
        }
    };

    async function loadNotifications() {
        const list = document.getElementById('notifications-list');
        if (!list) return;

        try {
            const res = await fetch('/api/notifications');
            const data = await res.json();

            if (!data.notifications || data.notifications.length === 0) {
                list.innerHTML = '<p class="p-4 text-sm text-slate-400 text-center">No notifications</p>';
                return;
            }

            list.innerHTML = data.notifications.map(n => {
                const safeLink = n.link ? escapeHtml(n.link) : '#';
                return `
                <a href="${safeLink}" class="block px-4 py-3 hover:bg-slate-700/50 transition-colors ${n.read ? '' : 'bg-slate-700/20'}"
                   onclick="markNotificationRead(${n.id})">
                    <p class="text-sm ${n.read ? 'text-slate-400' : 'text-slate-200'}">${escapeHtml(n.message)}</p>
                    <p class="text-xs text-slate-500 mt-1">${timeAgo(n.created_at)}</p>
                </a>`;
            }).join('');
        } catch (err) {
            list.innerHTML = '<p class="p-4 text-sm text-red-400 text-center">Failed to load</p>';
        }
    }

    window.markNotificationRead = async function(id) {
        try {
            await fetch(`/api/notifications/${id}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    };

    // Load notifications when dropdown is opened
    const notifLink = document.getElementById('notifications-link');
    if (notifLink) {
        notifLink.addEventListener('click', function() {
            loadNotifications();
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function timeAgo(dateStr) {
        const now = new Date();
        const date = new Date(dateStr);
        const seconds = Math.floor((now - date) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + 'm ago';
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'h ago';
        const days = Math.floor(hours / 24);
        if (days < 7) return days + 'd ago';
        return date.toLocaleDateString();
    }

    // ── Close dropdowns on outside click ───────────────────────────────────────
    document.addEventListener('click', function(e) {
        // Close user menu
        const userMenu = document.getElementById('user-menu');
        if (userMenu && !userMenu.parentElement.contains(e.target)) {
            userMenu.classList.add('hidden');
        }

        // Close notifications
        const notifDropdown = document.getElementById('notifications-dropdown');
        const notifBtn = document.getElementById('notifications-link');
        if (notifDropdown && notifBtn && !notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
            notifDropdown.classList.add('hidden');
        }
    });

})();
