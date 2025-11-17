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
// Contract Verification
// ============================================
async function verifyContractOwnership(contractAddress) {
    if (!contractAddress || !contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        showContractStatus('mainContractStatus', 'Please enter a valid contract address', 'error');
        return false;
    }

    try {
        // Check if contract deployer matches connected wallet
        const response = await fetch(`/api/verify-contract-owner`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contractAddress: contractAddress,
                walletAddress: userAddress
            })
        });

        const data = await response.json();

        if (data.deployerMatches) {
            showContractStatus('mainContractStatus', '✓ Contract ownership verified', 'success');
            return true;
        } else {
            // Deployer doesn't match - require signature
            showContractStatus('mainContractStatus', 'Contract deployer does not match. Signature required.', 'pending');
            document.getElementById('signatureSection').style.display = 'block';
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
        const response = await fetch(`/api/verify-signature`, {
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

        const data = await response.json();

        if (data.verified) {
            showContractStatus('signatureStatus', '✓ Signature verified successfully', 'success');
            document.getElementById('submitProfileBtn').disabled = false;
            return true;
        } else {
            showContractStatus('signatureStatus', 'Signature verification failed', 'error');
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
document.getElementById('verifyMainContractBtn')?.addEventListener('click', async () => {
    const contractAddress = document.getElementById('mainContract').value;
    if (contractAddress) {
        await verifyContractOwnership(contractAddress);
    }
});

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

    const formData = {
        walletAddress: userAddress,
        xUsername: document.getElementById('xUsername').value,
        projectX: document.getElementById('projectX').value || null,
        githubLink: document.getElementById('githubLink').value || null,
        mainContract: document.getElementById('mainContract').value,
        optionalContract1: document.getElementById('optionalContract1').value || null,
        optionalContract2: document.getElementById('optionalContract2').value || null
    };

    // Validate required fields
    if (!formData.xUsername || !formData.mainContract) {
        alert('Please fill in all required fields');
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

        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            alert('Profile submitted successfully! Please wait for admin approval.');
            window.location.href = 'index.html';
        } else {
            alert(data.message || 'Failed to submit profile. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Profile';
        }
    } catch (error) {
        console.error('Error submitting profile:', error);
        alert('Error submitting profile. Please try again.');
        document.getElementById('submitProfileBtn').disabled = false;
        document.getElementById('submitProfileBtn').textContent = 'Submit Profile';
    }
});

// Auto-verify on contract address change
document.getElementById('mainContract')?.addEventListener('blur', async function() {
    const contractAddress = this.value;
    if (contractAddress && contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        await verifyContractOwnership(contractAddress);
    }
});

