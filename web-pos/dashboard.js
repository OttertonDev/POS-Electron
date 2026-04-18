// Initialize Lucide Icons
lucide.createIcons();

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
document.getElementById('posLink').addEventListener('click', () => {
    // Navigate to the POS page
    window.location.href = 'pos.html';
});

document.getElementById('receiptEditorLink').addEventListener('click', () => {
    // Navigate to the Receipt Editor page
    window.location.href = 'receipt-editor.html';
});

// Logout Mock (For demo)
document.querySelector('.logout-btn').addEventListener('click', () => {
    alert('Logging out...');
});
