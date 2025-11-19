// ============================================
// MetaMask Connection
// ============================================
let provider = null;
let signer = null;
let userAddress = null;

// Check and connect wallet on page load
async function initWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert('Please install MetaMask to use this application!');
        return;
    }

    try {
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        userAddress = accounts[0];
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();

        updateWalletUI();
    } catch (error) {
        console.error('Error connecting wallet:', error);
    }
}

function updateWalletUI() {
    const walletAddress = document.getElementById('walletAddress');
    if (walletAddress && userAddress) {
        const shortAddress = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
        walletAddress.textContent = shortAddress;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initWallet);

// Global error handler to suppress Solana extension errors
window.addEventListener('error', function(event) {
    // Ignore errors from Solana extensions
    if (event.filename && event.filename.includes('solana')) {
        event.preventDefault();
        console.warn('Solana extension error suppressed:', event.message);
        return false;
    }
}, true);

// Suppress unhandled promise rejections from extensions
window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && (
        event.reason.message?.includes('solana') || 
        event.reason.stack?.includes('solana') ||
        event.reason.toString().includes('solana')
    )) {
        event.preventDefault();
        console.warn('Solana extension promise rejection suppressed:', event.reason);
        return false;
    }
});

// ============================================
// API Configuration
// ============================================
const API_BASE_URL = window.API_BASE_URL || 'https://builderhubonbase-production.up.railway.app/api';

// ============================================
// Contract Verification
// ============================================
async function verifyContractOwnership(contractAddress) {
    if (!contractAddress || !contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        showContractStatus('mainContractStatus', 'Please enter a valid contract address', 'error');
        return false;
    }

    // Show loading state
    showContractStatus('mainContractStatus', 'Verifying contract...', 'pending');

    try {
        // Check if contract deployer matches connected wallet
        const response = await fetch(`${API_BASE_URL}/verify-contract-owner`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contractAddress: contractAddress,
                walletAddress: userAddress
            })
        }).catch(fetchError => {
            // Handle network errors
            console.error('Network error:', fetchError);
            throw new Error('Network error. Please check your connection and try again.');
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (parseError) {
                errorData = { message: `Server error (${response.status}). Please try again.` };
            }
            console.error('API Error:', errorData);
            showContractStatus('mainContractStatus', errorData.message || 'Error verifying contract. Please try again.', 'error');
            return false;
        }

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            showContractStatus('mainContractStatus', 'Invalid response from server. Please try again.', 'error');
            return false;
        }

        // Check if verification was successful
        if (data.success && data.deployerMatches) {
            showContractStatus('mainContractStatus', '✓ Contract ownership verified', 'success');
            return true;
        } else if (data.success && data.requiresManualReview) {
            // Deployer not found - allow for manual review
            showContractStatus('mainContractStatus', '⚠️ Deployer not found automatically. Submission will be reviewed manually by admin.', 'pending');
            return true; // Allow submission for manual review
        } else {
            // Verification failed - show error
            const deployerAddress = data.deployerAddress || 'the deployer wallet';
            const errorMessage = data.message || `❌ Wallet mismatch. Please use the wallet that deployed this contract (${deployerAddress.slice(0, 6)}...${deployerAddress.slice(-4)}).`;
            showContractStatus('mainContractStatus', errorMessage, 'error');
            return false;
        }
    } catch (error) {
        // Ignore Solana extension errors (they're not related to our code)
        if (error.message && error.message.includes('solana')) {
            console.warn('Solana extension error (ignored):', error.message);
            // Continue with verification
            return false;
        }
        
        console.error('Error verifying contract:', error);
        const errorMessage = error.message || 'Error verifying contract. Please try again.';
        showContractStatus('mainContractStatus', errorMessage, 'error');
        return false;
    }
}


function showContractStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = `contract-status ${type}`;
    }
}

// ============================================
// Form Submission
// ============================================

document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!userAddress) {
        alert('Please connect your wallet first');
        return;
    }

    // Get submit button reference early
    const submitBtn = document.getElementById('submitProfileBtn');
    if (!submitBtn) {
        console.error('Submit button not found');
        return;
    }

    // Get form data
    const projectDescriptionEl = document.getElementById('projectDescription');
    const formData = {
        walletAddress: userAddress,
        xUsername: document.getElementById('xUsername').value.trim(),
        projectX: document.getElementById('projectX').value.trim() || null,
        githubLink: document.getElementById('githubLink').value.trim() || null,
        mainContract: document.getElementById('mainContract').value.trim().toLowerCase(),
        optionalContract1: document.getElementById('optionalContract1').value.trim().toLowerCase() || null,
        optionalContract2: document.getElementById('optionalContract2').value.trim().toLowerCase() || null,
        projectDescription: projectDescriptionEl ? projectDescriptionEl.value.trim() : ''
    };

    console.log('📝 Form data prepared:', {
        walletAddress: formData.walletAddress,
        xUsername: formData.xUsername,
        mainContract: formData.mainContract,
        hasDescription: !!formData.projectDescription,
        descriptionLength: formData.projectDescription ? formData.projectDescription.length : 0
    });

    // Validate required fields
    if (!formData.xUsername || !formData.mainContract || !formData.projectDescription) {
        alert('Please fill in all required fields (X Username, Main Contract Address, and Project Description)');
        return;
    }

    // Validate project description length
    if (formData.projectDescription.length < 50) {
        alert('Project description must be at least 50 characters long. Please provide more details about your project.');
        return;
    }

    // Validate contract address format
    if (!formData.mainContract.match(/^0x[a-fA-F0-9]{40}$/)) {
        alert('Please enter a valid contract address');
        return;
    }

    // Contract verification removed - all submissions go to manual review
    console.log('📝 Proceeding with submission - will be reviewed manually by admin');

    // Validate X username format
    if (!formData.xUsername.startsWith('@')) {
        formData.xUsername = '@' + formData.xUsername;
    }

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        // Log form data before sending
        console.log('📤 Sending form data to server:', {
            walletAddress: formData.walletAddress,
            xUsername: formData.xUsername,
            mainContract: formData.mainContract,
            projectDescription: formData.projectDescription ? `${formData.projectDescription.substring(0, 50)}...` : 'MISSING',
            descriptionLength: formData.projectDescription ? formData.projectDescription.length : 0
        });

        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            console.error('API Error:', errorData);
            alert(errorData.message || 'Failed to submit profile. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Profile';
            return;
        }

        const data = await response.json();
        console.log('Registration response:', data);

        if (data.success) {
            const message = data.isResubmission 
                ? 'Profile resubmitted successfully! Please wait for admin approval.'
                : 'Profile submitted successfully! Please wait for admin approval.';
            alert(message);
            window.location.href = 'index.html';
        } else {
            alert(data.message || 'Failed to submit profile. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Profile';
        }
    } catch (error) {
        console.error('Error submitting profile:', error);
        alert('Error submitting profile: ' + error.message);
        document.getElementById('submitProfileBtn').disabled = false;
        document.getElementById('submitProfileBtn').textContent = 'Submit Profile';
    }
});

// Auto-verification removed - all submissions go to manual review
// Contract verification is now handled manually by admin during review

