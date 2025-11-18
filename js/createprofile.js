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
            // Hide signature section if it was shown
            const signatureSection = document.getElementById('signatureSection');
            if (signatureSection) signatureSection.style.display = 'none';
            return true;
        } else {
            // Verification failed - show error
            const deployerAddress = data.deployerAddress || 'the deployer wallet';
            const errorMessage = data.message || `❌ Wallet mismatch. Please use the wallet that deployed this contract (${deployerAddress.slice(0, 6)}...${deployerAddress.slice(-4)}).`;
            showContractStatus('mainContractStatus', errorMessage, 'error');
            const signatureSection = document.getElementById('signatureSection');
            if (signatureSection) signatureSection.style.display = 'none';
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

// Sign verification message
async function signVerificationMessage(contractAddress) {
    if (!userAddress || !signer) {
        alert('Please connect your wallet first');
        return false;
    }

    try {
        const message = `I am the owner of contract ${contractAddress}. Signing to verify ownership for BuilderHub.`;
        
        // Sign message
        const signature = await signer.signMessage(message);

        // Verify signature with backend
        const response = await fetch(`${API_BASE_URL}/verify-signature`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contractAddress: contractAddress,
                walletAddress: userAddress,
                message: message,
                signature: signature
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            console.error('API Error:', errorData);
            showContractStatus('signatureStatus', errorData.message || 'Signature verification failed', 'error');
            return false;
        }

        const data = await response.json();

        if (data.success && data.verified) {
            showContractStatus('signatureStatus', '✓ Signature verified successfully', 'success');
            // Store signature for form submission
            window.lastVerifiedSignature = signature;
            const submitBtn = document.getElementById('submitProfileBtn');
            if (submitBtn) submitBtn.disabled = false;
            return true;
        } else {
            showContractStatus('signatureStatus', data.message || 'Signature verification failed', 'error');
            window.lastVerifiedSignature = null;
            return false;
        }
    } catch (error) {
        console.error('Error signing message:', error);
        showContractStatus('signatureStatus', 'Error signing message. Please try again.', 'error');
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
document.getElementById('signMessageBtn')?.addEventListener('click', async () => {
    const contractAddress = document.getElementById('mainContract').value;
    if (contractAddress) {
        await signVerificationMessage(contractAddress);
    }
});

document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!userAddress) {
        alert('Please connect your wallet first');
        return;
    }

    // No signature needed - only deployer wallet can submit
    const formData = {
        walletAddress: userAddress,
        xUsername: document.getElementById('xUsername').value.trim(),
        projectX: document.getElementById('projectX').value.trim() || null,
        githubLink: document.getElementById('githubLink').value.trim() || null,
        mainContract: document.getElementById('mainContract').value.trim().toLowerCase(),
        optionalContract1: document.getElementById('optionalContract1').value.trim().toLowerCase() || null,
        optionalContract2: document.getElementById('optionalContract2').value.trim().toLowerCase() || null
    };

    // Validate required fields
    if (!formData.xUsername || !formData.mainContract) {
        alert('Please fill in all required fields');
        return;
    }

    // Validate contract address format
    if (!formData.mainContract.match(/^0x[a-fA-F0-9]{40}$/)) {
        alert('Please enter a valid contract address');
        return;
    }

    // Verify contract ownership before submission
    const contractAddress = formData.mainContract;
    
    try {
        const verifyResponse = await fetch(`${API_BASE_URL}/verify-contract-owner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contractAddress: contractAddress,
                walletAddress: userAddress
            })
        });

        if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            
            // STRICT CHECK: Only allow if success is true AND deployerMatches is true
            if (!verifyData.success || !verifyData.deployerMatches) {
                // Verification failed - reject submission
                const deployerAddress = verifyData.deployerAddress || 'the deployer wallet';
                const errorMsg = verifyData.message || `Contract ownership verification failed. Please use the wallet that deployed this contract (${deployerAddress.slice(0, 6)}...${deployerAddress.slice(-4)}).`;
                alert(errorMsg);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Profile';
                return;
            }
            
            // Deployer matches - proceed with submission
            console.log('✅ Wallet matches deployer, proceeding with submission');
        } else {
            const errorData = await verifyResponse.json().catch(() => ({ message: 'Unknown error' }));
            alert(errorData.message || 'Error verifying contract ownership. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Profile';
            return;
        }
    } catch (verifyError) {
        console.error('Verification check error:', verifyError);
        alert('Error verifying contract ownership. Please try again.');
        return;
    }

    // Validate X username format
    if (!formData.xUsername.startsWith('@')) {
        formData.xUsername = '@' + formData.xUsername;
    }

    try {
        const submitBtn = document.getElementById('submitProfileBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

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

// Auto-check contract ownership when contract address is entered
document.getElementById('mainContract')?.addEventListener('blur', async function() {
    const contractAddress = this.value.trim();
    if (!contractAddress || !contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        return;
    }

    if (!userAddress) {
        return;
    }

    try {
        // Use the verifyContractOwnership function which has better error handling
        await verifyContractOwnership(contractAddress);
    } catch (error) {
        // Ignore Solana extension errors
        if (error.message && !error.message.includes('solana')) {
            console.error('Contract verification error:', error);
        }
    }
});

