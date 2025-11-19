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

// Contract verification removed - all submissions go to manual review
// Users now confirm ownership via button click

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

    // Check if contract ownership is confirmed
    const contractConfirmed = document.getElementById('contractConfirmed');
    if (!contractConfirmed || contractConfirmed.value !== 'true') {
        alert('Please confirm that this is your contract address by clicking the confirmation button.');
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

// Contract ownership confirmation button
document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('confirmContractBtn');
    const contractInput = document.getElementById('mainContract');
    const confirmationStatus = document.getElementById('confirmationStatus');
    const contractConfirmed = document.getElementById('contractConfirmed');

    if (confirmBtn && contractInput && contractConfirmed) {
        confirmBtn.addEventListener('click', () => {
            const contractAddress = contractInput.value.trim();
            
            if (!contractAddress || !contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
                alert('Please enter a valid contract address first');
                return;
            }

            // Confirm ownership
            contractConfirmed.value = 'true';
            confirmBtn.textContent = '✓ Confirmed - This Is My Contract';
            confirmBtn.classList.remove('btn-secondary');
            confirmBtn.classList.add('btn-primary');
            confirmBtn.disabled = true;
            
            if (confirmationStatus) {
                confirmationStatus.textContent = 'Contract ownership confirmed. You can now submit the form.';
                confirmationStatus.style.color = '#10b981';
            }
        });

        // Reset confirmation when contract address changes
        contractInput.addEventListener('input', () => {
            contractConfirmed.value = 'false';
            confirmBtn.textContent = '✓ I Confirm This Is My Contract Address';
            confirmBtn.classList.remove('btn-primary');
            confirmBtn.classList.add('btn-secondary');
            confirmBtn.disabled = false;
            
            if (confirmationStatus) {
                confirmationStatus.textContent = '';
            }
        });
    }
});

