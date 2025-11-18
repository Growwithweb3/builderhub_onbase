// ============================================
// MetaMask Connection
// ============================================
let provider = null;
let signer = null;
let userAddress = null;

// Initialize wallet on page load
async function initWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert('Please install MetaMask to use this application!');
        window.location.href = 'index.html';
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
        await loadProfileData();
    } catch (error) {
        console.error('Error connecting wallet:', error);
        window.location.href = 'index.html';
    }
}

function updateWalletUI() {
    const walletAddress = document.getElementById('walletAddress');
    if (walletAddress && userAddress) {
        const shortAddress = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
        walletAddress.textContent = shortAddress;
    }
}

// Handle account changes
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            window.location.href = 'index.html';
        } else {
            userAddress = accounts[0];
            updateWalletUI();
            loadProfileData();
        }
    });
}

// Disconnect wallet
document.getElementById('disconnectWalletBtn')?.addEventListener('click', () => {
    window.location.href = 'index.html';
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', initWallet);

// ============================================
// API Configuration
// ============================================
const API_BASE_URL = window.API_BASE_URL || 'https://builderhubonbase-production.up.railway.app/api';

// ============================================
// Load Profile Data
// ============================================
async function loadProfileData() {
    if (!userAddress) return;

    try {
        // Check if user is approved
        const statusResponse = await fetch(`${API_BASE_URL}/check-status/${userAddress}`);
        const statusData = await statusResponse.status === 200 ? await statusResponse.json() : null;

        if (!statusData || !statusData.approved) {
            alert('Your profile is not approved yet. Please wait for admin review.');
            window.location.href = 'index.html';
            return;
        }

        // Load profile data
        const profileResponse = await fetch(`${API_BASE_URL}/profile/${userAddress}`);
        const profileData = await profileResponse.json();

        if (profileData.success) {
            displayProfileInfo(profileData.profile);
        }

        // Load stats
        await loadStats();
    } catch (error) {
        console.error('Error loading profile:', error);
        alert('Error loading profile data. Please try again.');
    }
}

function displayProfileInfo(profile) {
    // Display developer name (X username)
    const developerName = document.getElementById('developerName');
    if (developerName) {
        developerName.textContent = profile.xUsername || 'Developer';
    }

    // Display social links
    const xLink = document.getElementById('xLink');
    if (xLink && profile.xUsername) {
        const xUsername = profile.xUsername.startsWith('@') ? profile.xUsername.slice(1) : profile.xUsername;
        xLink.href = `https://twitter.com/${xUsername}`;
        xLink.textContent = `@${xUsername}`;
    }

    const githubLink = document.getElementById('githubLink');
    if (githubLink && profile.githubLink) {
        githubLink.href = profile.githubLink;
        githubLink.textContent = 'GitHub';
    } else if (githubLink) {
        githubLink.style.display = 'none';
    }

    // Display contract address
    const mainContractAddress = document.getElementById('mainContractAddress');
    if (mainContractAddress && profile.mainContract) {
        mainContractAddress.textContent = profile.mainContract;
    }

    // Display additional contracts
    if (profile.optionalContract1 || profile.optionalContract2) {
        const additionalSection = document.getElementById('additionalContractsSection');
        const contractsList = document.getElementById('additionalContractsList');
        
        if (additionalSection) additionalSection.style.display = 'block';
        if (contractsList) {
            let html = '';
            if (profile.optionalContract1) {
                html += `<div class="contract-item">${profile.optionalContract1}</div>`;
            }
            if (profile.optionalContract2) {
                html += `<div class="contract-item">${profile.optionalContract2}</div>`;
            }
            contractsList.innerHTML = html;
        }
    }
}

// ============================================
// Load Stats
// ============================================
async function loadStats() {
    if (!userAddress) return;

    try {
        const response = await fetch(`${API_BASE_URL}/stats/${userAddress}`);
        const data = await response.json();

        if (data.success) {
            displayStats(data.stats);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

function displayStats(stats) {
    // Total Transactions
    const totalTx = document.getElementById('totalTx');
    if (totalTx) totalTx.textContent = formatNumber(stats.totalTransactions || 0);

    const txLast12h = document.getElementById('txLast12h');
    if (txLast12h) txLast12h.textContent = formatNumber(stats.transactionsLast12h || 0);

    // Unique Wallets
    const uniqueWallets = document.getElementById('uniqueWallets');
    if (uniqueWallets) uniqueWallets.textContent = formatNumber(stats.uniqueWallets || 0);

    const walletsLast12h = document.getElementById('walletsLast12h');
    if (walletsLast12h) walletsLast12h.textContent = formatNumber(stats.walletsLast12h || 0);

    // Growth Rate
    const growthRate = document.getElementById('growthRate');
    if (growthRate) {
        const rate = stats.growthRate || 0;
        growthRate.textContent = `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`;
        growthRate.style.color = rate >= 0 ? '#10b981' : '#ef4444';
    }

    // Rankings
    const txRank = document.getElementById('txRank');
    if (txRank) txRank.textContent = `#${stats.rankTx || '--'}`;

    const walletRank = document.getElementById('walletRank');
    if (walletRank) walletRank.textContent = `#${stats.rankUnique || '--'}`;
}

// ============================================
// Utility Functions
// ============================================
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

