// ============================================
// Admin Wallet Check
// ============================================
const ADMIN_WALLET = '0xb0dfc6ca6aafd3b0719949aa029d30d79fed30a4';
let userAddress = null;
let currentFilter = 'pending';

// Initialize wallet connection
async function connectAdminWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert('Please install MetaMask to use this application!');
        return;
    }

    try {
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        userAddress = accounts[0].toLowerCase();

        if (userAddress === ADMIN_WALLET.toLowerCase()) {
            showAdminPanel();
        } else {
            showAccessDenied();
        }
    } catch (error) {
        console.error('Error connecting wallet:', error);
        alert('Failed to connect wallet');
    }
}

function showAdminPanel() {
    document.getElementById('accessDenied').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    
    const walletInfo = document.getElementById('walletInfo');
    const walletAddress = document.getElementById('walletAddress');
    const connectBtn = document.getElementById('connectWalletBtn');
    
    if (walletInfo) walletInfo.style.display = 'flex';
    if (walletAddress) {
        const shortAddress = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
        walletAddress.textContent = shortAddress;
    }
    if (connectBtn) connectBtn.style.display = 'none';
    
    loadSubmissions();
}

function showAccessDenied() {
    document.getElementById('accessDenied').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
}

// Handle account changes
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            showAccessDenied();
        } else {
            userAddress = accounts[0].toLowerCase();
            if (userAddress === ADMIN_WALLET.toLowerCase()) {
                showAdminPanel();
            } else {
                showAccessDenied();
            }
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connectWalletBtn');
    if (connectBtn) {
        connectBtn.addEventListener('click', connectAdminWallet);
    }

    // Filter buttons
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            loadSubmissions();
        });
    });

    // Modal close
    const closeModal = document.querySelector('.close-modal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modal = document.getElementById('submissionModal');

    if (closeModal) {
        closeModal.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
});

// ============================================
// API Configuration
// ============================================
const API_BASE_URL = window.API_BASE_URL || 'https://builderhubonbase-production.up.railway.app/api';
const ADMIN_WALLET = '0xb0dfc6ca6aafd3b0719949aa029d30d79fed30a4';

// ============================================
// Load Submissions
// ============================================
async function loadSubmissions() {
    const submissionsList = document.getElementById('submissionsList');
    
    if (!submissionsList) return;

    try {
        const response = await fetch(`${API_BASE_URL}/pending-submissions?status=${currentFilter}`, {
            headers: {
                'x-admin-wallet': ADMIN_WALLET
            }
        });
        const data = await response.json();

        if (data.success && data.submissions) {
            displaySubmissions(data.submissions);
        } else {
            submissionsList.innerHTML = '<div class="loading">No submissions found</div>';
        }
    } catch (error) {
        console.error('Error loading submissions:', error);
        submissionsList.innerHTML = '<div class="loading">Error loading submissions</div>';
    }
}

function displaySubmissions(submissions) {
    const submissionsList = document.getElementById('submissionsList');
    
    if (!submissions || submissions.length === 0) {
        submissionsList.innerHTML = '<div class="loading">No submissions found</div>';
        return;
    }

    submissionsList.innerHTML = submissions.map(submission => `
        <div class="submission-card" onclick="showSubmissionDetails('${submission._id || submission.id}')">
            <div class="submission-header">
                <div class="submission-wallet">${submission.walletAddress}</div>
                <div class="submission-status ${submission.isApproved ? 'approved' : submission.isRejected ? 'rejected' : 'pending'}">
                    ${submission.isApproved ? 'Approved' : submission.isRejected ? 'Rejected' : 'Pending'}
                </div>
            </div>
            <div class="submission-details">
                <div class="submission-detail-item">
                    <strong>X Username:</strong>
                    ${submission.xUsername || 'N/A'}
                </div>
                <div class="submission-detail-item">
                    <strong>Main Contract:</strong>
                    <span style="font-family: monospace; font-size: 0.85rem;">${submission.mainContract || 'N/A'}</span>
                </div>
                <div class="submission-detail-item">
                    <strong>Submitted:</strong>
                    ${new Date(submission.dateSubmitted).toLocaleDateString()}
                </div>
            </div>
        </div>
    `).join('');
}

// ============================================
// Show Submission Details
// ============================================
async function showSubmissionDetails(submissionId) {
    const modal = document.getElementById('submissionModal');
    const detailsDiv = document.getElementById('submissionDetails');

    try {
        const response = await fetch(`${API_BASE_URL}/submission/${submissionId}`, {
            headers: {
                'x-admin-wallet': ADMIN_WALLET
            }
        });
        const data = await response.json();

        if (data.success && data.submission) {
            const sub = data.submission;
            
            detailsDiv.innerHTML = `
                <div class="submission-details-full">
                    <div class="detail-row">
                        <strong>Wallet Address:</strong>
                        <span style="font-family: monospace;">${sub.walletAddress}</span>
                    </div>
                    <div class="detail-row">
                        <strong>X Username:</strong>
                        ${sub.xUsername || 'N/A'}
                    </div>
                    <div class="detail-row">
                        <strong>Project X:</strong>
                        ${sub.projectX || 'N/A'}
                    </div>
                    <div class="detail-row">
                        <strong>GitHub:</strong>
                        ${sub.githubLink ? `<a href="${sub.githubLink}" target="_blank">${sub.githubLink}</a>` : 'N/A'}
                    </div>
                    <div class="detail-row">
                        <strong>Main Contract:</strong>
                        <span style="font-family: monospace;">${sub.mainContract}</span>
                    </div>
                    ${sub.optionalContract1 ? `
                    <div class="detail-row">
                        <strong>Optional Contract 1:</strong>
                        <span style="font-family: monospace;">${sub.optionalContract1}</span>
                    </div>
                    ` : ''}
                    ${sub.optionalContract2 ? `
                    <div class="detail-row">
                        <strong>Optional Contract 2:</strong>
                        <span style="font-family: monospace;">${sub.optionalContract2}</span>
                    </div>
                    ` : ''}
                    <div class="detail-row">
                        <strong>Status:</strong>
                        <span class="submission-status ${sub.isApproved ? 'approved' : sub.isRejected ? 'rejected' : 'pending'}">
                            ${sub.isApproved ? 'Approved' : sub.isRejected ? 'Rejected' : 'Pending'}
                        </span>
                    </div>
                    <div class="detail-row">
                        <strong>Submitted:</strong>
                        ${new Date(sub.dateSubmitted).toLocaleString()}
                    </div>
                </div>
            `;

            // Store current submission ID for approve/reject
            modal.dataset.submissionId = submissionId;
            modal.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading submission details:', error);
        alert('Error loading submission details');
    }
}

// ============================================
// Approve/Reject Actions
// ============================================
document.getElementById('approveBtn')?.addEventListener('click', async () => {
    const modal = document.getElementById('submissionModal');
    const submissionId = modal.dataset.submissionId;

    if (!submissionId) return;

    try {
        const response = await fetch(`${API_BASE_URL}/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-wallet': ADMIN_WALLET
            },
            body: JSON.stringify({
                submissionId: submissionId
            })
        });

        const data = await response.json();

        if (data.success) {
            alert('Submission approved successfully!');
            modal.style.display = 'none';
            loadSubmissions();
        } else {
            alert(data.message || 'Failed to approve submission');
        }
    } catch (error) {
        console.error('Error approving submission:', error);
        alert('Error approving submission');
    }
});

document.getElementById('rejectBtn')?.addEventListener('click', async () => {
    const modal = document.getElementById('submissionModal');
    const submissionId = modal.dataset.submissionId;

    if (!submissionId) return;

    const reason = prompt('Please provide a reason for rejection (optional):');
    
    if (reason === null) return; // User cancelled

    try {
        const response = await fetch(`${API_BASE_URL}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-wallet': ADMIN_WALLET
            },
            body: JSON.stringify({
                submissionId: submissionId,
                reason: reason || ''
            })
        });

        const data = await response.json();

        if (data.success) {
            alert('Submission rejected');
            modal.style.display = 'none';
            loadSubmissions();
        } else {
            alert(data.message || 'Failed to reject submission');
        }
    } catch (error) {
        console.error('Error rejecting submission:', error);
        alert('Error rejecting submission');
    }
});

