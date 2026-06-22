document.addEventListener('DOMContentLoaded', () => {
    // === Theme Sync Logic ===
    const body = document.body;
    const themeBtns = document.querySelectorAll('.theme-btn');
    
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

    const savedTheme = localStorage.getItem('nexus_theme') || 'dark';
    applyTheme(savedTheme);

    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            applyTheme(theme);
        });
    });

    // === Split Screen Resizer Logic ===
    const resizer = document.getElementById('resizer');
    const leftPanel = document.getElementById('doc-panel');
    const workspace = document.querySelector('.workspace');

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        // Prevent iframes/objects from interfering with mouse events
        leftPanel.style.pointerEvents = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        // Calculate new width
        const containerOffsetLeft = workspace.getBoundingClientRect().left;
        const pointerRelativeXpos = e.clientX - containerOffsetLeft;
        
        // Prevent panel from being too small
        const minWidth = 300;
        const containerWidth = workspace.clientWidth;
        const maxWidth = containerWidth - minWidth;

        const newWidth = Math.max(minWidth, Math.min(pointerRelativeXpos, maxWidth));
        
        // Convert to percentage for responsiveness
        const percentageWidth = (newWidth / containerWidth) * 100;
        leftPanel.style.width = `${percentageWidth}%`;
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = 'default';
            leftPanel.style.pointerEvents = 'auto'; // Restore pointer events
        }
    });

    // === Tabs Logic ===
    const tabBtns = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab and corresponding content
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });
});
