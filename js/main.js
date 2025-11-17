// ============================================
// MetaMask Connection
// ============================================
let provider = null;
let signer = null;
let userAddress = null;

// Check if MetaMask is installed
function checkMetaMask() {
    if (typeof window.ethereum !== 'undefined') {
        return true;
    } else {
        alert('Please install MetaMask to use this application!');
        return false;
    }
}

// Connect to MetaMask
async function connectWallet() {
    if (!checkMetaMask()) return;

    try {
        // Request account access
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        userAddress = accounts[0];
        
        // Initialize ethers provider
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();

        // Update UI
        updateWalletUI();
        
        // Check if user is approved and redirect
        checkUserStatus();
        
    } catch (error) {
        console.error('Error connecting wallet:', error);
        alert('Failed to connect wallet. Please try again.');
    }
}

// Disconnect wallet
function disconnectWallet() {
    userAddress = null;
    provider = null;
    signer = null;
    updateWalletUI();
    hideWalletInfo();
}

// Update wallet UI
function updateWalletUI() {
    const walletInfo = document.getElementById('walletInfo');
    const walletAddress = document.getElementById('walletAddress');
    const connectBtn = document.getElementById('connectWalletBtn');
    const connectHeroBtn = document.getElementById('connectWalletHeroBtn');
    const connectCtaBtn = document.getElementById('connectWalletCtaBtn');

    if (userAddress) {
        const shortAddress = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
        
        if (walletInfo) walletInfo.style.display = 'flex';
        if (walletAddress) walletAddress.textContent = shortAddress;
        if (connectBtn) connectBtn.style.display = 'none';
        if (connectHeroBtn) connectHeroBtn.style.display = 'none';
        if (connectCtaBtn) connectCtaBtn.style.display = 'none';
    } else {
        if (walletInfo) walletInfo.style.display = 'none';
        if (connectBtn) connectBtn.style.display = 'block';
        if (connectHeroBtn) connectHeroBtn.style.display = 'block';
        if (connectCtaBtn) connectCtaBtn.style.display = 'block';
    }
}

function hideWalletInfo() {
    const walletInfo = document.getElementById('walletInfo');
    const connectBtn = document.getElementById('connectWalletBtn');
    const connectHeroBtn = document.getElementById('connectWalletHeroBtn');
    const connectCtaBtn = document.getElementById('connectWalletCtaBtn');
    
    if (walletInfo) walletInfo.style.display = 'none';
    if (connectBtn) connectBtn.style.display = 'block';
    if (connectHeroBtn) connectHeroBtn.style.display = 'block';
    if (connectCtaBtn) connectCtaBtn.style.display = 'block';
}

// Check user status and redirect
async function checkUserStatus() {
    if (!userAddress) return;

    try {
        // Call backend API to check if user is approved
        const response = await fetch(`/api/check-status/${userAddress}`);
        const data = await response.json();

        if (data.approved) {
            // Redirect to profile page
            window.location.href = 'profile.html';
        } else if (data.exists) {
            // User exists but not approved - show waiting message
            alert('Your profile is pending approval. Please wait for admin review.');
        } else {
            // New user - redirect to create profile
            window.location.href = 'createprofile.html';
        }
    } catch (error) {
        console.error('Error checking user status:', error);
        // If API fails, redirect to create profile
        window.location.href = 'createprofile.html';
    }
}

// Handle account changes
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            disconnectWallet();
        } else {
            userAddress = accounts[0];
            updateWalletUI();
            checkUserStatus();
        }
    });
}

// ============================================
// Event Listeners
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connectWalletBtn');
    const connectHeroBtn = document.getElementById('connectWalletHeroBtn');
    const connectCtaBtn = document.getElementById('connectWalletCtaBtn');
    const disconnectBtn = document.getElementById('disconnectWalletBtn');

    if (connectBtn) {
        connectBtn.addEventListener('click', connectWallet);
    }
    if (connectHeroBtn) {
        connectHeroBtn.addEventListener('click', connectWallet);
    }
    if (connectCtaBtn) {
        connectCtaBtn.addEventListener('click', connectWallet);
    }
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', disconnectWallet);
    }

    // Load leaderboard
    loadLeaderboard('transactions');
    
    // Load stats
    loadStats();
});

// ============================================
// Leaderboard
// ============================================
async function loadLeaderboard(sortBy = 'transactions') {
    const tableBody = document.getElementById('leaderboardBody');
    
    if (!tableBody) return;

    try {
        const response = await fetch(`/api/leaderboard?sort=${sortBy}`);
        const data = await response.json();

        if (data.success && data.leaderboard) {
            displayLeaderboard(data.leaderboard);
        } else {
            tableBody.innerHTML = '<tr><td colspan="6" class="loading">No data available</td></tr>';
        }
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        tableBody.innerHTML = '<tr><td colspan="6" class="loading">Error loading leaderboard</td></tr>';
    }
}

function displayLeaderboard(data) {
    const tableBody = document.getElementById('leaderboardBody');
    
    if (!tableBody || !data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="loading">No projects found</td></tr>';
        return;
    }

    tableBody.innerHTML = data.map((project, index) => `
        <tr>
            <td class="rank">#${index + 1}</td>
            <td>${project.projectName || 'Unnamed Project'}</td>
            <td class="contract-address">${project.contractAddress}</td>
            <td>${formatNumber(project.totalTransactions || 0)}</td>
            <td>${formatNumber(project.uniqueWallets || 0)}</td>
            <td><a href="https://twitter.com/${project.xUsername}" target="_blank">@${project.xUsername}</a></td>
        </tr>
    `).join('');
}

// Tab switching
document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all tabs
            tabButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked tab
            btn.classList.add('active');
            
            // Load leaderboard with selected sort
            const sortBy = btn.dataset.tab === 'wallets' ? 'wallets' : 'transactions';
            loadLeaderboard(sortBy);
        });
    });
});

// ============================================
// Stats Loading
// ============================================
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();

        if (data.success) {
            updateStats(data.stats);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

function updateStats(stats) {
    const totalProjects = document.getElementById('totalProjects');
    const totalDevelopers = document.getElementById('totalDevelopers');
    const totalTransactions = document.getElementById('totalTransactions');

    if (totalProjects) totalProjects.textContent = formatNumber(stats.totalProjects || 0);
    if (totalDevelopers) totalDevelopers.textContent = formatNumber(stats.totalDevelopers || 0);
    if (totalTransactions) totalTransactions.textContent = formatNumber(stats.totalTransactions || 0);
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

// Smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Navbar scroll effect
window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 50) {
        navbar.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
    } else {
        navbar.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
    }
});
