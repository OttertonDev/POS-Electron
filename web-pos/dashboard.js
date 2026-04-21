// Initialize Lucide Icons
lucide.createIcons();

const dashboardState = {
    role: window.webPosAuthState?.role || null,
    isAdmin: Boolean(window.webPosAuthState?.isAdmin),
    isStaff: Boolean(window.webPosAuthState?.isStaff)
};

const stockCard = document.getElementById('stockLink');
const permissionModalOverlay = document.getElementById('permissionModalOverlay');
const permissionModalCloseBtn = document.getElementById('permissionModalCloseBtn');

function showPermissionModal() {
    if (!permissionModalOverlay) {
        return;
    }

    permissionModalOverlay.classList.remove('is-closing');
    permissionModalOverlay.hidden = false;
}

function hidePermissionModal() {
    if (!permissionModalOverlay) {
        return;
    }

    permissionModalOverlay.classList.add('is-closing');
}

function syncDashboardAccess() {
    const isStaff = dashboardState.role === 'staff';
    const isAdmin = dashboardState.role === 'administrator';
    const restricted = isStaff || (!isAdmin && !dashboardState.role);

    [stockCard].forEach((card) => {
        if (!card) {
            return;
        }

        card.classList.toggle('is-disabled', restricted);
        card.setAttribute('aria-disabled', restricted ? 'true' : 'false');
    });
}

function handleCardNavigation(card, targetUrl, restricted = false) {
    if (!card) {
        return;
    }

    card.addEventListener('click', () => {
        const shouldBlock = restricted && dashboardState.role !== 'administrator';

        if (shouldBlock) {
            showPermissionModal();
            return;
        }

        window.location.href = targetUrl;
    });
}

function applyAuthState(state) {
    dashboardState.role = state?.role || null;
    dashboardState.isAdmin = Boolean(state?.isAdmin);
    dashboardState.isStaff = Boolean(state?.isStaff);
    syncDashboardAccess();
}

window.addEventListener('webpos-auth-state', (event) => {
    applyAuthState(event.detail);
});

if (window.webPosAuthState?.ready) {
    applyAuthState(window.webPosAuthState);
}

permissionModalCloseBtn?.addEventListener('click', hidePermissionModal);
permissionModalOverlay?.addEventListener('click', (event) => {
    if (event.target === permissionModalOverlay) {
        hidePermissionModal();
    }
});

permissionModalOverlay?.addEventListener('animationend', (event) => {
    if (
        event.animationName === 'modal-overlay-out' &&
        permissionModalOverlay.classList.contains('is-closing')
    ) {
        permissionModalOverlay.hidden = true;
        permissionModalOverlay.classList.remove('is-closing');
    }
});

// Chart.js Configuration
const ctx = document.getElementById('revenueChart').getContext('2d');
const revenueChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['Apr 12', 'Apr 13', 'Apr 14', 'Apr 15', 'Apr 16', 'Apr 17', 'Apr 18'],
        datasets: [{
            label: 'Sales Revenue',
            data: [0, 0, 0, 0, 0, 0, 0], // Placeholder data
            borderColor: '#8b5cf6', // Purple color from the image
            backgroundColor: 'rgba(139, 92, 246, 0.05)',
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#8b5cf6',
            pointBorderColor: 'white',
            pointBorderWidth: 2,
            pointRadius: 4
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    color: '#f0f0f0'
                },
                ticks: {
                    color: '#64748b',
                    font: {
                        family: 'Inter'
                    }
                }
            },
            x: {
                grid: {
                    display: false
                },
                ticks: {
                    color: '#64748b',
                    font: {
                        family: 'Inter'
                    }
                }
            }
        }
    }
});

// Navigation Logic
handleCardNavigation(document.getElementById('posLink'), 'pos.html', false);
handleCardNavigation(stockCard, 'stock.html', true);

syncDashboardAccess();
