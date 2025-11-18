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
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            console.error('API Error:', errorData);
            showContractStatus('mainContractStatus', errorData.message || 'Error verifying contract. Please try again.', 'error');
            return false;
        }

        const data = await response.json();

        if (data.success && data.deployerMatches) {
            showContractStatus('mainContractStatus', '✓ Contract ownership verified', 'success');
            return true;
        } else if (data.success && !data.deployerMatches) {
            // Deployer doesn't match - require signature
            showContractStatus('mainContractStatus', 'Contract deployer does not match. Signature required.', 'pending');
            const signatureSection = document.getElementById('signatureSection');
            if (signatureSection) signatureSection.style.display = 'block';
            return false;
        } else {
            showContractStatus('mainContractStatus', data.message || 'Error verifying contract. Please try again.', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error verifying contract:', error);
        showContractStatus('mainContractStatus', 'Error verifying contract. Please try again.', 'error');
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

    // Get signature if it was verified
    let storedSignature = null;
    const signatureStatus = document.getElementById('signatureStatus');
    if (signatureStatus && signatureStatus.textContent.includes('verified successfully')) {
        // Signature was verified, we need to get it from the verification
        // For now, we'll require signature verification before submission
        const contractAddress = document.getElementById('mainContract').value;
        if (contractAddress) {
            // Check if signature was stored (we'll need to store it when verified)
            storedSignature = window.lastVerifiedSignature || null;
        }
    }

    const formData = {
        walletAddress: userAddress,
        xUsername: document.getElementById('xUsername').value.trim(),
        projectX: document.getElementById('projectX').value.trim() || null,
        githubLink: document.getElementById('githubLink').value.trim() || null,
        mainContract: document.getElementById('mainContract').value.trim(),
        optionalContract1: document.getElementById('optionalContract1').value.trim() || null,
        optionalContract2: document.getElementById('optionalContract2').value.trim() || null,
        verificationSignature: storedSignature
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

    // Check if signature verification is needed
    const contractAddress = formData.mainContract;
    const needsVerification = !window.lastVerifiedSignature;
    
    if (needsVerification) {
        // Try to verify ownership first
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
                
                if (verifyData.success && !verifyData.deployerMatches) {
                    // Deployer doesn't match - require signature
                    alert('Contract ownership verification required. Please sign the verification message first.');
                    document.getElementById('signatureSection').style.display = 'block';
                    return;
                } else if (verifyData.success && verifyData.deployerMatches) {
                    // Deployer matches - no signature needed
                    console.log('✅ Wallet matches deployer, no signature needed');
                    window.lastVerifiedSignature = null; // Clear any old signature
                } else {
                    // Deployer not found - require signature
                    alert('Contract ownership verification required. Please sign the verification message first.');
                    document.getElementById('signatureSection').style.display = 'block';
                    return;
                }
            }
        } catch (verifyError) {
            console.error('Verification check error:', verifyError);
            // If verification check fails, require signature as safety measure
            alert('Contract ownership verification required. Please sign the verification message first.');
            document.getElementById('signatureSection').style.display = 'block';
            return;
        }
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
        const response = await fetch(`${API_BASE_URL}/verify-contract-owner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contractAddress: contractAddress,
                walletAddress: userAddress
            })
        });

        if (response.ok) {
            const data = await response.json();
            const signatureSection = document.getElementById('signatureSection');
            
            if (data.success && !data.deployerMatches) {
                // Deployer doesn't match - show signature section
                if (signatureSection) signatureSection.style.display = 'block';
                window.lastVerifiedSignature = null; // Clear old signature
            } else if (data.success && data.deployerMatches) {
                // Deployer matches - hide signature section
                if (signatureSection) signatureSection.style.display = 'none';
                window.lastVerifiedSignature = null; // No signature needed
            } else {
                // Deployer not found - show signature section
                if (signatureSection) signatureSection.style.display = 'block';
                window.lastVerifiedSignature = null; // Clear old signature
            }
        }
    } catch (error) {
        console.error('Auto-verification error:', error);
        // Show signature section as safety measure
        const signatureSection = document.getElementById('signatureSection');
        if (signatureSection) signatureSection.style.display = 'block';
    }
});

