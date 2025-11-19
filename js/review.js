// ============================================
// Admin Wallet Check
// ============================================
// Version: 2.1 - Fixed redeclaration and wallet connection
// Prevent redeclaration error - use window property instead of const
if (typeof window.ADMIN_WALLET_ADDRESS === 'undefined') {
    window.ADMIN_WALLET_ADDRESS = '0xb0dfc6ca6aafd3b0719949aa029d30d79fed30a4';
}
let userAddress = null;
let currentFilter = 'pending';

// Initialize wallet connection
async function connectAdminWallet() {
    console.log('🔌 Connect wallet button clicked');
    
    if (typeof window.ethereum === 'undefined') {
        alert('Please install MetaMask to use this application!');
        return;
    }

    const connectBtn = document.getElementById('connectWalletBtn');
    if (connectBtn) {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';
    }

    try {
        console.log('📡 Requesting accounts from MetaMask...');
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        if (!accounts || accounts.length === 0) {
            alert('No accounts found. Please unlock MetaMask.');
            if (connectBtn) {
                connectBtn.disabled = false;
                connectBtn.textContent = 'Connect Admin Wallet';
            }
            return;
        }

        userAddress = accounts[0].toLowerCase();
        const adminWalletLower = (window.ADMIN_WALLET_ADDRESS || '').toLowerCase();
        
        console.log('✅ Connected wallet:', userAddress);
        console.log('🔑 Admin wallet:', adminWalletLower);
        console.log('🔍 Wallet match:', userAddress === adminWalletLower);

        if (userAddress === adminWalletLower) {
            console.log('✅ Admin wallet confirmed - showing panel');
            showAdminPanel();
        } else {
            console.log('❌ Non-admin wallet - showing access denied');
            showAccessDenied();
            if (connectBtn) {
                connectBtn.disabled = false;
                connectBtn.textContent = 'Connect Admin Wallet';
            }
        }
    } catch (error) {
        console.error('❌ Error connecting wallet:', error);
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect Admin Wallet';
        }
        if (error.code === 4001) {
            alert('Please approve the connection request in MetaMask');
        } else {
            alert('Failed to connect wallet: ' + error.message);
        }
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
            if (userAddress === window.ADMIN_WALLET_ADDRESS.toLowerCase()) {
                showAdminPanel();
            } else {
                showAccessDenied();
            }
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Review page loaded, initializing...');
    
    const connectBtn = document.getElementById('connectWalletBtn');
    if (connectBtn) {
        console.log('Connect button found, adding event listener');
        connectBtn.addEventListener('click', connectAdminWallet);
    } else {
        console.error('Connect button not found!');
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

// ============================================
// Load Submissions
// ============================================
async function loadSubmissions() {
    const submissionsList = document.getElementById('submissionsList');
    
    if (!submissionsList) return;

    try {
        console.log('🔍 Loading submissions with filter:', currentFilter);
        console.log('🔑 Admin wallet:', window.ADMIN_WALLET_ADDRESS);
        console.log('🔑 Admin wallet (lowercase):', (window.ADMIN_WALLET_ADDRESS || '').toLowerCase());
        
        // Ensure admin wallet is lowercase for backend comparison
        const adminWallet = (window.ADMIN_WALLET_ADDRESS || '').toLowerCase();
        
        const response = await fetch(`${API_BASE_URL}/pending-submissions?status=${currentFilter}`, {
            headers: {
                'x-admin-wallet': adminWallet
            }
        });

        console.log('📡 Response status:', response.status, response.statusText);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            console.error('❌ API Error:', errorData);
            submissionsList.innerHTML = `<div class="loading">Error: ${errorData.message || 'Failed to load submissions'}</div>`;
            return;
        }

        const data = await response.json();
        console.log('📦 Response data:', data);
        console.log('📊 Submissions count:', data.submissions?.length || 0);

        if (data.success && data.submissions) {
            if (data.submissions.length === 0) {
                submissionsList.innerHTML = '<div class="loading">No submissions found</div>';
            } else {
                displaySubmissions(data.submissions);
            }
        } else {
            console.warn('⚠️ Unexpected response format:', data);
            submissionsList.innerHTML = '<div class="loading">No submissions found</div>';
        }
    } catch (error) {
        console.error('❌ Error loading submissions:', error);
        submissionsList.innerHTML = `<div class="loading">Error loading submissions: ${error.message}</div>`;
    }
}

function displaySubmissions(submissions) {
    const submissionsList = document.getElementById('submissionsList');
    
    if (!submissions || submissions.length === 0) {
        submissionsList.innerHTML = '<div class="loading">No submissions found</div>';
        return;
    }

    console.log('🎨 Displaying', submissions.length, 'submissions');

    submissionsList.innerHTML = submissions.map(submission => {
        // Format date safely
        let dateStr = 'N/A';
        try {
            if (submission.dateSubmitted) {
                const date = new Date(submission.dateSubmitted);
                if (!isNaN(date.getTime())) {
                    dateStr = date.toLocaleDateString();
                }
            }
        } catch (e) {
            console.error('Date formatting error:', e);
        }

        return `
        <div class="submission-card" onclick="showSubmissionDetails('${submission.id}')">
            <div class="submission-header">
                <div class="submission-wallet">${submission.walletAddress || 'N/A'}</div>
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
                    ${dateStr}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// ============================================
// Show Submission Details
// ============================================
async function showSubmissionDetails(submissionId) {
    const modal = document.getElementById('submissionModal');
    const detailsDiv = document.getElementById('submissionDetails');

    try {
        // Ensure admin wallet is lowercase for backend comparison
        const adminWallet = (window.ADMIN_WALLET_ADDRESS || '').toLowerCase();
        
        const response = await fetch(`${API_BASE_URL}/submission/${submissionId}`, {
            headers: {
                'x-admin-wallet': adminWallet
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
                        <strong>Project Description:</strong>
                        <div style="margin-top: 0.5rem; padding: 1rem; background: #f5f5f5; border-radius: 8px; white-space: pre-wrap; max-height: 300px; overflow-y: auto;">
                            ${sub.projectDescription || 'N/A'}
                        </div>
                    </div>
                    <div class="detail-row">
                        <strong>Status:</strong>
                        <span class="submission-status ${sub.isApproved ? 'approved' : sub.isRejected ? 'rejected' : 'pending'}">
                            ${sub.isApproved ? 'Approved' : sub.isRejected ? 'Rejected' : 'Pending'}
                        </span>
                    </div>
                    <div class="detail-row">
                        <strong>Submitted:</strong>
                        ${sub.dateSubmitted ? (() => {
                            try {
                                const date = new Date(sub.dateSubmitted);
                                return isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
                            } catch (e) {
                                return 'N/A';
                            }
                        })() : 'N/A'}
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
    const approveBtn = document.getElementById('approveBtn');

    if (!submissionId) return;

    // Disable button and show loading state immediately
    if (approveBtn) {
        approveBtn.disabled = true;
        approveBtn.textContent = 'Approving...';
    }

    try {
        // Ensure admin wallet is lowercase for backend comparison
        const adminWallet = (window.ADMIN_WALLET_ADDRESS || '').toLowerCase();
        
        const response = await fetch(`${API_BASE_URL}/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-wallet': adminWallet
            },
            body: JSON.stringify({
                submissionId: submissionId
            })
        });

        const data = await response.json();

        if (data.success) {
            // Close modal first for immediate feedback
            modal.style.display = 'none';
            
            // Use setTimeout to allow UI update before reloading
            setTimeout(() => {
                loadSubmissions();
            }, 0);
        } else {
            alert(data.message || 'Failed to approve submission');
            if (approveBtn) {
                approveBtn.disabled = false;
                approveBtn.textContent = 'Approve';
            }
        }
    } catch (error) {
        console.error('Error approving submission:', error);
        alert('Error approving submission');
        if (approveBtn) {
            approveBtn.disabled = false;
            approveBtn.textContent = 'Approve';
        }
    }
});

document.getElementById('rejectBtn')?.addEventListener('click', async () => {
    const modal = document.getElementById('submissionModal');
    const submissionId = modal.dataset.submissionId;
    const rejectBtn = document.getElementById('rejectBtn');

    if (!submissionId) return;

    // Use setTimeout to allow UI to update before blocking prompt
    setTimeout(async () => {
        const reason = prompt('Please provide a reason for rejection (optional):');
        
        if (reason === null) return; // User cancelled

        // Disable button and show loading state
        if (rejectBtn) {
            rejectBtn.disabled = true;
            rejectBtn.textContent = 'Rejecting...';
        }

        try {
            // Ensure admin wallet is lowercase for backend comparison
            const adminWallet = (window.ADMIN_WALLET_ADDRESS || '').toLowerCase();
            
            const response = await fetch(`${API_BASE_URL}/reject`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-wallet': adminWallet
                },
                body: JSON.stringify({
                    submissionId: submissionId,
                    reason: reason || ''
                })
            });

            const data = await response.json();

            if (data.success) {
                // Close modal first for immediate feedback
                modal.style.display = 'none';
                
                // Use setTimeout to allow UI update before reloading
                setTimeout(() => {
                    loadSubmissions();
                }, 0);
            } else {
                alert(data.message || 'Failed to reject submission');
                if (rejectBtn) {
                    rejectBtn.disabled = false;
                    rejectBtn.textContent = 'Reject';
                }
            }
        } catch (error) {
            console.error('Error rejecting submission:', error);
            alert('Error rejecting submission');
            if (rejectBtn) {
                rejectBtn.disabled = false;
                rejectBtn.textContent = 'Reject';
            }
        }
    }, 0);
});
