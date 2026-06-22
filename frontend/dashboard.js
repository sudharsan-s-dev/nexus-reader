
document.addEventListener('DOMContentLoaded', async () => {
    // Backend API URL helper
    const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:5000');

    // Theme Toggling Logic
    const themeBtns = document.querySelectorAll('.theme-btn');
    const body = document.body;

    // Load saved theme or default to dark
    const savedTheme = localStorage.getItem('nexus_theme') || 'dark';
    applyTheme(savedTheme);

    themeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const theme = btn.dataset.theme;
            applyTheme(theme);
        });
    });

    function applyTheme(theme) {
        themeBtns.forEach(b => b.classList.remove('active'));
        
        let targetBtn;
        if (theme === 'light') {
            body.classList.remove('dark-theme');
            localStorage.setItem('nexus_theme', 'light');
            targetBtn = document.querySelector('.theme-btn[data-theme="light"]');
        } else if (theme === 'dark') {
            body.classList.add('dark-theme');
            localStorage.setItem('nexus_theme', 'dark');
            targetBtn = document.querySelector('.theme-btn[data-theme="dark"]');
        } else {
            // System
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
                body.classList.add('dark-theme');
            } else {
                body.classList.remove('dark-theme');
            }
            localStorage.setItem('nexus_theme', 'system');
            targetBtn = document.querySelector('.theme-btn[data-theme="system"]');
        }

        if (targetBtn) targetBtn.classList.add('active');
    }

    // === Authentication Logic ===
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const emailStep = document.getElementById('auth-email-step');
    const otpStep = document.getElementById('auth-otp-step');
    const emailInput = document.getElementById('auth-email');
    const otpInput = document.getElementById('auth-otp');
    const authSubtitle = document.getElementById('auth-subtitle');
    const sendOtpBtn = document.getElementById('auth-send-otp-btn');
    const verifyBtn = document.getElementById('auth-verify-btn');
    const backBtn = document.getElementById('auth-back-btn');

    const userProfileSection = document.getElementById('user-profile-section');
    const userDisplayEmail = document.getElementById('user-display-email');
    const logoutBtn = document.getElementById('logout-btn');

    let currentEmail = '';
    let currentUser = null;

    // Check session on load
    async function checkSession() {
        try {
            const res = await fetch(`${apiBase}/api/auth/session`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (data.authenticated) {
                    currentUser = data.user;
                    onAuthenticated(data.user);
                    return true;
                }
            }
        } catch (e) {
            console.error("Session check failed", e);
        }
        showLoginModal();
        return false;
    }

    function showLoginModal() {
        if (authModal) {
            authModal.classList.remove('hidden');
            // Reset modal steps
            emailStep.style.display = 'flex';
            otpStep.style.display = 'none';
            authSubtitle.textContent = 'Enter your email to receive a secure login OTP.';
            if (emailInput) {
                emailInput.value = '';
                emailInput.disabled = false;
            }
            if (otpInput) {
                otpInput.value = '';
                otpInput.disabled = false;
            }
            if (sendOtpBtn) sendOtpBtn.disabled = false;
            if (verifyBtn) verifyBtn.disabled = false;
        }
    }

    function onAuthenticated(user) {
        if (authModal) authModal.classList.add('hidden');
        if (userProfileSection) userProfileSection.style.display = 'flex';
        if (userDisplayEmail) {
            let namePart = user.email.split('@')[0];
            // Replace dots and underscores with spaces, remove numbers
            let cleanName = namePart.replace(/[._]/g, ' ').replace(/[0-9]/g, '').trim();
            // Capitalize each word
            let formattedName = cleanName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
            userDisplayEmail.textContent = formattedName || 'User';
        }
        loadRecentNotes();
    }

    // OTP Request Flow
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Step 1: Send OTP
            if (emailStep.style.display !== 'none') {
                const email = emailInput.value.trim();
                if (!email) return;

                currentEmail = email;
                sendOtpBtn.disabled = true;
                sendOtpBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Sending...';

                try {
                    const res = await fetch(`${apiBase}/api/auth/request-otp`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        // Success - show step 2
                        emailStep.style.display = 'none';
                        otpStep.style.display = 'flex';
                        authSubtitle.innerHTML = `A verification code was sent to ${email}.<br><span style="margin-top: 8px; display: inline-block; font-size: 13px; font-weight: 600; padding: 6px 12px; border-radius: 8px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); color: var(--accent-primary);">Simulation OTP: ${data.simulation_otp}</span>`;
                        if (otpInput) {
                            otpInput.value = '';
                            otpInput.focus();
                        }
                    } else {
                        alert(data.error || 'Failed to send OTP. Please try again.');
                    }
                } catch (err) {
                    console.error("Error requesting OTP", err);
                    alert("Network error. Could not connect to authentication server.");
                } finally {
                    sendOtpBtn.disabled = false;
                    sendOtpBtn.textContent = 'Get Verification Code';
                }
            }
            // Step 2: Verify OTP
            else {
                const otp = otpInput.value.trim();
                if (!otp || otp.length !== 6) {
                    alert("Please enter a valid 6-digit OTP code.");
                    return;
                }

                verifyBtn.disabled = true;
                verifyBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying...';

                try {
                    const res = await fetch(`${apiBase}/api/auth/verify-otp`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: currentEmail, otp }),
                        credentials: 'include'
                    });
                    const data = await res.json();
                    if (res.ok) {
                        currentUser = data.user;
                        onAuthenticated(data.user);
                    } else {
                        alert(data.error || 'Invalid or expired OTP code.');
                    }
                } catch (err) {
                    console.error("Error verifying OTP", err);
                    alert("Network error. Could not connect to verification server.");
                } finally {
                    verifyBtn.disabled = false;
                    verifyBtn.textContent = 'Verify & Login';
                }
            }
        });
    }

    // Back Button in Auth modal
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            otpStep.style.display = 'none';
            emailStep.style.display = 'flex';
            authSubtitle.textContent = 'Enter your email to receive a secure login OTP.';
        });
    }

    // Logout Click Handler
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (await NexusUI.confirm("Are you sure you want to log out?")) {
                try {
                    await fetch(`${apiBase}/api/auth/logout`, { method: 'POST', credentials: 'include' });
                } catch (e) {
                    console.error("Logout request failed", e);
                }
                currentUser = null;
                if (userProfileSection) userProfileSection.style.display = 'none';
                showLoginModal();
                if (notesList) {
                    notesList.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                            <i class="fa-solid fa-lock" style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;"></i>
                            <p>Please log in to view workspace files.</p>
                        </div>
                    `;
                }
            }
        });
    }

    // === File Upload and Workspace Listing ===
    const notesList = document.getElementById('recent-notes-list');
    const uploadBtn = document.getElementById('dash-upload-btn');
    const fileInput = document.getElementById('dash-file-input');
    let allNotes = [];

    // Format helper functions
    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            // Replace space with T and append Z to parse as UTC
            const d = new Date(dateStr.replace(' ', 'T') + 'Z');
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString(undefined, { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric',
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } catch (e) {
            return dateStr;
        }
    }

    async function loadRecentNotes() {
        if (!notesList) return;
        notesList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 32px; margin-bottom: 12px; color: var(--accent-primary);"></i>
                <p>Loading your secure documents...</p>
            </div>
        `;

        try {
            const res = await fetch(`${apiBase}/api/files/list`, { credentials: 'include' });
            if (res.status === 401) {
                showLoginModal();
                return;
            }
            if (!res.ok) {
                throw new Error("Failed to fetch list");
            }
            const data = await res.json();
            allNotes = data.files || [];
            renderNotes(allNotes);
        } catch (err) {
            console.error("Failed to load secure notes from server:", err);
            renderErrorState();
        }
    }

    function renderErrorState() {
        if (!notesList) return;
        notesList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; margin-bottom: 12px; color: #ef4444;"></i>
                <p>Failed to load files from server. Click below to retry.</p>
                <button class="glass-btn" id="retry-files-btn" style="margin-top: 12px;">Retry</button>
            </div>
        `;
        const retryBtn = document.getElementById('retry-files-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', loadRecentNotes);
        }
    }

    function renderNotes(notes) {
        if (!notesList) return;
        notesList.innerHTML = '';
        
        if (!notes || notes.length === 0) {
            notesList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fa-regular fa-folder-open" style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p>Your workspace is empty.</p>
                    <p style="font-size: 12px; margin-top: 4px;">Upload a PDF, DOCX, or Image file to get started.</p>
                </div>
            `;
            return;
        }

        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-list-item';
            
            const timeStr = formatDate(note.uploaded_at) || 'Just now';
            const sizeStr = formatBytes(note.file_size);

            let iconClass = 'fa-regular fa-file-lines';
            let iconBg = 'rgba(99, 102, 241, 0.1)';
            let iconColor = 'var(--accent-primary)';

            const ext = note.file_name.split('.').pop().toLowerCase();
            if (ext === 'pdf') {
                iconClass = 'fa-regular fa-file-pdf';
                iconBg = 'rgba(239, 68, 68, 0.1)';
                iconColor = '#ef4444';
            } else if (ext === 'docx') {
                iconClass = 'fa-regular fa-file-word';
                iconBg = 'rgba(59, 130, 246, 0.1)';
                iconColor = '#3b82f6';
            } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
                iconClass = 'fa-regular fa-file-image';
                iconBg = 'rgba(16, 185, 129, 0.1)';
                iconColor = '#10b981';
            }

            item.innerHTML = `
                <div class="note-clickable-area" style="display: flex; align-items: center; flex: 1; cursor: pointer;">
                    <div class="note-icon" style="background: ${iconBg}; color: ${iconColor};">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="note-details">
                        <h4 style="color: var(--text-primary);">${note.file_name || 'Untitled Document'}</h4>
                        <p>${timeStr} · ${sizeStr}</p>
                    </div>
                </div>
                <div class="note-actions" style="display: flex; align-items: center; gap: 8px;">
                    <button class="note-more-btn open-btn" aria-label="Open document"><i class="fa-solid fa-chevron-right"></i></button>
                    <button class="note-more-btn delete-doc-btn" aria-label="Delete document" style="color: #ef4444;"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            
            const clickableArea = item.querySelector('.note-clickable-area');
            const openBtn = item.querySelector('.open-btn');
            const deleteBtn = item.querySelector('.delete-doc-btn');
            
            const openDoc = () => {
                window.location.href = `reader.html?url=${encodeURIComponent(note.file_path_or_url)}&name=${encodeURIComponent(note.file_name)}`;
            };
            
            clickableArea.addEventListener('click', openDoc);
            openBtn.addEventListener('click', openDoc);
            
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                if (await NexusUI.confirm(`Are you sure you want to delete '${note.file_name}'?`)) {
                    try {
                        const res = await fetch(`${apiBase}/api/files/delete/${note.file_id}`, {
                            method: 'DELETE',
                            credentials: 'include'
                        });
                        
                        if (res.ok) {
                            await loadRecentNotes();
                        } else {
                            const data = await res.json();
                            NexusUI.alert(data.error || 'Failed to delete file.');
                        }
                    } catch (err) {
                        console.error('Failed to delete', err);
                        NexusUI.alert('Network error while deleting file.');
                    }
                }
            });
            
            notesList.appendChild(item);
        });
    }

    // Trigger File Input Click
    let autoOpenReader = false;
    const mainReaderUploadCard = document.getElementById('main-reader-upload-card');

    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => {
            autoOpenReader = false;
            fileInput.click();
        });
    }

    if (mainReaderUploadCard && fileInput) {
        mainReaderUploadCard.addEventListener('click', (e) => {
            e.preventDefault();
            autoOpenReader = true;
            fileInput.click();
        });
    }

    // Handle File Input Change (Upload)
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);

            uploadBtn.disabled = true;
            uploadBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Uploading...';

            async function attemptUpload(formDataToUpload) {
                try {
                    const res = await fetch(`${apiBase}/api/files/upload`, {
                        method: 'POST',
                        body: formDataToUpload,
                        credentials: 'include'
                    });
                    const data = await res.json();
                    
                    if (res.status === 409 && data.status === 'warning') {
                        // Prompt user
                        if (await NexusUI.confirm(data.message)) {
                            formDataToUpload.append('force_eviction', 'true');
                            return attemptUpload(formDataToUpload);
                        } else {
                            return null; // User cancelled
                        }
                    } else if (res.ok) {
                        return data;
                    } else {
                        alert(data.error || 'Failed to upload document.');
                        return null;
                    }
                } catch (err) {
                    console.error("Upload error", err);
                    alert("Network error. Could not upload file.");
                    return false;
                }
            }

            const successData = await attemptUpload(formData);
            
            if (successData) {
                if (autoOpenReader && successData.file) {
                    window.location.href = `reader.html?url=${encodeURIComponent(successData.file.file_path_or_url)}&name=${encodeURIComponent(successData.file.file_name)}`;
                } else {
                    await loadRecentNotes();
                }
            }
            
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '<i class="fa-solid fa-file-arrow-up"></i> Upload File';
            fileInput.value = ''; // Reset
        });
    }

    // Search Functionality
    const searchInput = document.querySelector('.hero-search input') || document.querySelector('.dash-search input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = allNotes.filter(n => (n.file_name || '').toLowerCase().includes(query));
            renderNotes(filtered);
        });

        // Keyboard shortcut cmd/ctrl+K to focus search
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInput.focus();
            }
        });
    }

    // Sidebar & Mobile Navigation Logic
    const sidebarLinks = document.querySelectorAll('.sidebar-link[data-view], .mobile-nav-item[data-view]');
    const dashViews = document.querySelectorAll('.dash-view');

    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            const targetViewId = link.getAttribute('data-view');
            
            // Remove active from all links
            sidebarLinks.forEach(l => l.classList.remove('active'));
            
            // Add active to all links (both desktop and mobile) pointing to this view
            document.querySelectorAll(`.sidebar-link[data-view="${targetViewId}"], .mobile-nav-item[data-view="${targetViewId}"]`).forEach(l => l.classList.add('active'));

            // Hide all views
            dashViews.forEach(v => v.classList.add('hidden'));
            
            // Show target view
            const targetView = document.getElementById(targetViewId);
            if (targetView) {
                targetView.classList.remove('hidden');
            }
        });
    });

    // Star Rating Logic
    const starBtns = document.querySelectorAll('.star-rating button');
    starBtns.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            // Fill stars up to clicked one
            starBtns.forEach((b, i) => {
                const icon = b.querySelector('i');
                if (icon) {
                    if (i <= index) {
                        icon.className = 'fa-solid fa-star';
                        b.classList.add('active');
                    } else {
                        icon.className = 'fa-regular fa-star';
                        b.classList.remove('active');
                    }
                }
            });
        });
    });

    // Feedback Form Submission
    const submitBtn = document.querySelector('.feedback-form .primary-btn');
    const feedbackTextarea = document.querySelector('.feedback-form textarea') || document.querySelector('.glass-textarea');
    const cancelBtn = document.querySelector('.feedback-form .feedback-actions button:not(.primary-btn)');

    if (submitBtn && feedbackTextarea) {
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (feedbackTextarea.value.trim() === '') {
                alert("Please share your feedback before submitting.");
                return;
            }
            alert("Thank you for your feedback! We will use it to make Snaplearn better.");
            feedbackTextarea.value = '';
            
            // Trigger input event to reset character counter
            feedbackTextarea.dispatchEvent(new Event('input'));
            
            // Reset stars
            starBtns.forEach((b) => {
                const icon = b.querySelector('i');
                if (icon) {
                    icon.className = 'fa-regular fa-star';
                }
                b.classList.remove('active');
            });
        });
    }

    if (cancelBtn && feedbackTextarea) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            feedbackTextarea.value = '';
            feedbackTextarea.dispatchEvent(new Event('input'));
            // Reset stars
            starBtns.forEach((b) => {
                const icon = b.querySelector('i');
                if (icon) {
                    icon.className = 'fa-regular fa-star';
                }
                b.classList.remove('active');
            });
            // Navigate back to dashboard view
            const dashLink = document.querySelector('.sidebar-link[data-view="view-dashboard"]');
            if (dashLink) {
                dashLink.click();
            }
        });
    }

    // Feedback Character count
    const charCount = document.querySelector('.char-count');
    if (feedbackTextarea && charCount) {
        feedbackTextarea.addEventListener('input', () => {
            const count = feedbackTextarea.value.length;
            charCount.textContent = `${count}/2000 characters`;
        });
    }

    // Run session check on load
    await checkSession();
});
