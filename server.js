// ============================================
// Builder Hub on Base - Backend Server
// ============================================

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const ethers = require('ethers');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Environment Variables
// ============================================
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY;
const ADMIN_WALLET = process.env.ADMIN_WALLET?.toLowerCase() || '0xb0dfc6ca6aafd3b0719949aa029d30d79fed30a4'.toLowerCase();
const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV || 'production';

// ============================================
// Database Connection
// ============================================
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set!');
    process.exit(1);
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL?.includes('railway') || DATABASE_URL?.includes('railway.internal') 
        ? { rejectUnauthorized: false } 
        : false
});

// Test database connection
pool.connect()
    .then(() => {
        console.log('✅ Database connected successfully');
    })
    .catch(err => {
        console.error('❌ Database connection error:', err.message);
        // Don't exit - let server start and retry later
    });

// ============================================
// Initialize Database Tables
// ============================================
async function initializeDatabase() {
    try {
        // Create developers table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS developers (
                id SERIAL PRIMARY KEY,
                wallet_address VARCHAR(42) UNIQUE NOT NULL,
                x_username VARCHAR(255) NOT NULL,
                project_x VARCHAR(255),
                github_link TEXT,
                main_contract VARCHAR(42) NOT NULL,
                optional_contract_1 VARCHAR(42),
                optional_contract_2 VARCHAR(42),
                verification_signature TEXT,
                is_approved BOOLEAN DEFAULT FALSE,
                is_rejected BOOLEAN DEFAULT FALSE,
                rejection_reason TEXT,
                date_submitted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create project_stats table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS project_stats (
                id SERIAL PRIMARY KEY,
                wallet_address VARCHAR(42) UNIQUE NOT NULL,
                main_contract VARCHAR(42) NOT NULL,
                total_transactions BIGINT DEFAULT 0,
                transactions_last_12h BIGINT DEFAULT 0,
                unique_wallets BIGINT DEFAULT 0,
                wallets_last_12h BIGINT DEFAULT 0,
                growth_rate DECIMAL(10, 2) DEFAULT 0,
                rank_tx INTEGER,
                rank_unique INTEGER,
                last_scanned TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for better performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_wallet_address ON developers(wallet_address);
            CREATE INDEX IF NOT EXISTS idx_main_contract ON developers(main_contract);
            CREATE INDEX IF NOT EXISTS idx_is_approved ON developers(is_approved);
            CREATE INDEX IF NOT EXISTS idx_stats_wallet ON project_stats(wallet_address);
            CREATE INDEX IF NOT EXISTS idx_stats_contract ON project_stats(main_contract);
        `);

        console.log('✅ Database tables initialized');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
}

// Initialize on startup (with error handling)
initializeDatabase().catch(err => {
    console.error('❌ Failed to initialize database:', err.message);
    // Continue anyway - tables might already exist
});

// ============================================
// Middleware
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ============================================
// Etherscan API V2 Helper Functions
// ============================================

/**
 * Get contract creation info (deployer address)
 */
async function getContractDeployer(contractAddress) {
    try {
        const response = await axios.get('https://api.basescan.org/api', {
            params: {
                module: 'contract',
                action: 'getcontractcreation',
                contractaddresses: contractAddress,
                apikey: BASESCAN_API_KEY
            }
        });

        if (response.data.status === '1' && response.data.result?.length > 0) {
            return response.data.result[0].contractCreator.toLowerCase();
        }
        return null;
    } catch (error) {
        console.error('Error fetching contract deployer:', error);
        return null;
    }
}

/**
 * Get transaction count for an address
 */
async function getTransactionCount(address) {
    try {
        const provider = new ethers.providers.JsonRpcProvider(BASE_RPC_URL);
        const count = await provider.getTransactionCount(address);
        return count;
    } catch (error) {
        console.error('Error fetching transaction count:', error);
        return 0;
    }
}

/**
 * Get contract transactions
 */
async function getContractTransactions(contractAddress, startBlock = 0, endBlock = 'latest') {
    try {
        const response = await axios.get('https://api.basescan.org/api', {
            params: {
                module: 'account',
                action: 'txlist',
                address: contractAddress,
                startblock: startBlock,
                endblock: endBlock,
                page: 1,
                offset: 10000,
                sort: 'desc',
                apikey: BASESCAN_API_KEY
            }
        });

        if (response.data.status === '1' && response.data.result) {
            return response.data.result;
        }
        return [];
    } catch (error) {
        console.error('Error fetching contract transactions:', error);
        return [];
    }
}

/**
 * Calculate unique wallets from transactions
 */
function calculateUniqueWallets(transactions) {
    const wallets = new Set();
    transactions.forEach(tx => {
        if (tx.from) wallets.add(tx.from.toLowerCase());
        if (tx.to) wallets.add(tx.to.toLowerCase());
    });
    return wallets.size;
}

// ============================================
// API Routes
// ============================================

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: NODE_ENV 
    });
});

/**
 * Register new developer
 * POST /api/register
 */
app.post('/api/register', async (req, res) => {
    try {
        const {
            walletAddress,
            xUsername,
            projectX,
            githubLink,
            mainContract,
            optionalContract1,
            optionalContract2
        } = req.body;

        // Validation
        if (!walletAddress || !xUsername || !mainContract) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: walletAddress, xUsername, mainContract'
            });
        }

        // Validate wallet address
        if (!ethers.utils.isAddress(walletAddress)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address'
            });
        }

        // Validate contract address
        if (!ethers.utils.isAddress(mainContract)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid main contract address'
            });
        }

        // Check if wallet already exists
        const existing = await pool.query(
            'SELECT * FROM developers WHERE wallet_address = $1',
            [walletAddress.toLowerCase()]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Wallet address already registered'
            });
        }

        // Format X username
        const formattedXUsername = xUsername.startsWith('@') ? xUsername : `@${xUsername}`;

        // Insert developer
        const result = await pool.query(
            `INSERT INTO developers (
                wallet_address, x_username, project_x, github_link,
                main_contract, optional_contract_1, optional_contract_2,
                is_approved, is_rejected
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id`,
            [
                walletAddress.toLowerCase(),
                formattedXUsername,
                projectX || null,
                githubLink || null,
                mainContract.toLowerCase(),
                optionalContract1?.toLowerCase() || null,
                optionalContract2?.toLowerCase() || null,
                false,
                false
            ]
        );

        res.json({
            success: true,
            message: 'Profile submitted successfully. Waiting for admin approval.',
            profileId: result.rows[0].id
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Error registering developer',
            error: error.message
        });
    }
});

/**
 * Verify contract owner
 * POST /api/verify-contract-owner
 */
app.post('/api/verify-contract-owner', async (req, res) => {
    try {
        const { contractAddress, walletAddress } = req.body;

        if (!contractAddress || !walletAddress) {
            return res.status(400).json({
                success: false,
                message: 'Missing contractAddress or walletAddress'
            });
        }

        // Get contract deployer
        const deployer = await getContractDeployer(contractAddress);

        if (!deployer) {
            return res.status(400).json({
                success: false,
                message: 'Could not find contract deployer'
            });
        }

        const deployerMatches = deployer === walletAddress.toLowerCase();
        const requiresSignature = !deployerMatches;

        res.json({
            success: true,
            deployerMatches,
            deployerAddress: deployer,
            requiresSignature
        });
    } catch (error) {
        console.error('Verify contract owner error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying contract owner',
            error: error.message
        });
    }
});

/**
 * Verify signature
 * POST /api/verify-signature
 */
app.post('/api/verify-signature', async (req, res) => {
    try {
        const { contractAddress, walletAddress, message, signature } = req.body;

        if (!contractAddress || !walletAddress || !message || !signature) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Recover address from signature
        const recoveredAddress = ethers.utils.verifyMessage(message, signature);

        // Get contract deployer
        const deployer = await getContractDeployer(contractAddress);

        if (!deployer) {
            return res.status(400).json({
                success: false,
                message: 'Could not find contract deployer'
            });
        }

        // Verify: recovered address must match deployer
        const verified = recoveredAddress.toLowerCase() === deployer.toLowerCase();

        if (verified) {
            // Update developer record with signature
            await pool.query(
                'UPDATE developers SET verification_signature = $1 WHERE wallet_address = $2',
                [signature, walletAddress.toLowerCase()]
            );
        }

        res.json({
            success: true,
            verified,
            message: verified 
                ? 'Signature verified successfully' 
                : 'Signature verification failed'
        });
    } catch (error) {
        console.error('Verify signature error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying signature',
            error: error.message
        });
    }
});

/**
 * Check user status
 * GET /api/check-status/:walletAddress
 */
app.get('/api/check-status/:walletAddress', async (req, res) => {
    try {
        const walletAddress = req.params.walletAddress.toLowerCase();

        const result = await pool.query(
            'SELECT is_approved, is_rejected FROM developers WHERE wallet_address = $1',
            [walletAddress]
        );

        if (result.rows.length === 0) {
            return res.json({
                exists: false,
                approved: false,
                rejected: false
            });
        }

        const developer = result.rows[0];

        res.json({
            exists: true,
            approved: developer.is_approved,
            rejected: developer.is_rejected
        });
    } catch (error) {
        console.error('Check status error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking status',
            error: error.message
        });
    }
});

/**
 * Get developer profile
 * GET /api/profile/:walletAddress
 */
app.get('/api/profile/:walletAddress', async (req, res) => {
    try {
        const walletAddress = req.params.walletAddress.toLowerCase();

        const result = await pool.query(
            `SELECT 
                wallet_address, x_username, project_x, github_link,
                main_contract, optional_contract_1, optional_contract_2
            FROM developers 
            WHERE wallet_address = $1 AND is_approved = TRUE`,
            [walletAddress]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Profile not found or not approved'
            });
        }

        res.json({
            success: true,
            profile: result.rows[0]
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile',
            error: error.message
        });
    }
});

/**
 * Get project statistics
 * GET /api/stats/:walletAddress
 */
app.get('/api/stats/:walletAddress', async (req, res) => {
    try {
        const walletAddress = req.params.walletAddress.toLowerCase();

        // Check if approved
        const developer = await pool.query(
            'SELECT main_contract FROM developers WHERE wallet_address = $1 AND is_approved = TRUE',
            [walletAddress]
        );

        if (developer.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Profile not found or not approved'
            });
        }

        // Get stats
        const stats = await pool.query(
            'SELECT * FROM project_stats WHERE wallet_address = $1',
            [walletAddress]
        );

        if (stats.rows.length === 0) {
            // Return default stats if not yet calculated
            return res.json({
                success: true,
                stats: {
                    totalTransactions: 0,
                    transactionsLast12h: 0,
                    uniqueWallets: 0,
                    walletsLast12h: 0,
                    growthRate: 0,
                    rankTx: null,
                    rankUnique: null
                }
            });
        }

        res.json({
            success: true,
            stats: {
                totalTransactions: parseInt(stats.rows[0].total_transactions) || 0,
                transactionsLast12h: parseInt(stats.rows[0].transactions_last_12h) || 0,
                uniqueWallets: parseInt(stats.rows[0].unique_wallets) || 0,
                walletsLast12h: parseInt(stats.rows[0].wallets_last_12h) || 0,
                growthRate: parseFloat(stats.rows[0].growth_rate) || 0,
                rankTx: stats.rows[0].rank_tx,
                rankUnique: stats.rows[0].rank_unique
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching stats',
            error: error.message
        });
    }
});

/**
 * Get leaderboard
 * GET /api/leaderboard?sort=transactions|wallets
 */
app.get('/api/leaderboard', async (req, res) => {
    try {
        const sortBy = req.query.sort || 'transactions';
        const limit = 100;

        let orderBy;
        if (sortBy === 'wallets') {
            orderBy = 'rank_unique ASC, unique_wallets DESC';
        } else {
            orderBy = 'rank_tx ASC, total_transactions DESC';
        }

        const result = await pool.query(`
            SELECT 
                d.wallet_address,
                d.x_username,
                d.main_contract as contract_address,
                COALESCE(s.total_transactions, 0) as total_transactions,
                COALESCE(s.unique_wallets, 0) as unique_wallets,
                COALESCE(s.rank_tx, 999) as rank_tx,
                COALESCE(s.rank_unique, 999) as rank_unique
            FROM developers d
            LEFT JOIN project_stats s ON d.wallet_address = s.wallet_address
            WHERE d.is_approved = TRUE
            ORDER BY ${orderBy}
            LIMIT $1
        `, [limit]);

        const leaderboard = result.rows.map((row, index) => ({
            walletAddress: row.wallet_address,
            projectName: row.x_username.replace('@', ''),
            contractAddress: row.contract_address,
            totalTransactions: parseInt(row.total_transactions) || 0,
            uniqueWallets: parseInt(row.unique_wallets) || 0,
            xUsername: row.x_username
        }));

        res.json({
            success: true,
            leaderboard
        });
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching leaderboard',
            error: error.message
        });
    }
});

/**
 * Get pending submissions (Admin only)
 * GET /api/pending-submissions?status=pending|approved|rejected
 */
app.get('/api/pending-submissions', async (req, res) => {
    try {
        // Check admin wallet (in production, verify from request headers/auth)
        const adminWallet = req.headers['x-admin-wallet']?.toLowerCase();
        
        if (adminWallet !== ADMIN_WALLET) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const status = req.query.status || 'pending';
        let query;

        if (status === 'approved') {
            query = 'SELECT * FROM developers WHERE is_approved = TRUE ORDER BY date_submitted DESC';
        } else if (status === 'rejected') {
            query = 'SELECT * FROM developers WHERE is_rejected = TRUE ORDER BY date_submitted DESC';
        } else {
            query = 'SELECT * FROM developers WHERE is_approved = FALSE AND is_rejected = FALSE ORDER BY date_submitted DESC';
        }

        const result = await pool.query(query);

        res.json({
            success: true,
            submissions: result.rows
        });
    } catch (error) {
        console.error('Get pending submissions error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching submissions',
            error: error.message
        });
    }
});

/**
 * Get single submission (Admin only)
 * GET /api/submission/:id
 */
app.get('/api/submission/:id', async (req, res) => {
    try {
        const adminWallet = req.headers['x-admin-wallet']?.toLowerCase();
        
        if (adminWallet !== ADMIN_WALLET) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const result = await pool.query(
            'SELECT * FROM developers WHERE id = $1',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Submission not found'
            });
        }

        res.json({
            success: true,
            submission: result.rows[0]
        });
    } catch (error) {
        console.error('Get submission error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching submission',
            error: error.message
        });
    }
});

/**
 * Approve submission (Admin only)
 * POST /api/approve
 */
app.post('/api/approve', async (req, res) => {
    try {
        const adminWallet = req.headers['x-admin-wallet']?.toLowerCase();
        
        if (adminWallet !== ADMIN_WALLET) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const { submissionId } = req.body;

        if (!submissionId) {
            return res.status(400).json({
                success: false,
                message: 'Missing submissionId'
            });
        }

        await pool.query(
            'UPDATE developers SET is_approved = TRUE, is_rejected = FALSE, last_updated = CURRENT_TIMESTAMP WHERE id = $1',
            [submissionId]
        );

        // Initialize stats for approved developer
        const developer = await pool.query(
            'SELECT wallet_address, main_contract FROM developers WHERE id = $1',
            [submissionId]
        );

        if (developer.rows.length > 0) {
            const { wallet_address, main_contract } = developer.rows[0];
            
            // Insert or update stats
            await pool.query(`
                INSERT INTO project_stats (wallet_address, main_contract)
                VALUES ($1, $2)
                ON CONFLICT (wallet_address) DO NOTHING
            `, [wallet_address, main_contract]);
        }

        res.json({
            success: true,
            message: 'Submission approved successfully'
        });
    } catch (error) {
        console.error('Approve submission error:', error);
        res.status(500).json({
            success: false,
            message: 'Error approving submission',
            error: error.message
        });
    }
});

/**
 * Reject submission (Admin only)
 * POST /api/reject
 */
app.post('/api/reject', async (req, res) => {
    try {
        const adminWallet = req.headers['x-admin-wallet']?.toLowerCase();
        
        if (adminWallet !== ADMIN_WALLET) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const { submissionId, reason } = req.body;

        if (!submissionId) {
            return res.status(400).json({
                success: false,
                message: 'Missing submissionId'
            });
        }

        await pool.query(
            'UPDATE developers SET is_approved = FALSE, is_rejected = TRUE, rejection_reason = $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2',
            [reason || null, submissionId]
        );

        res.json({
            success: true,
            message: 'Submission rejected'
        });
    } catch (error) {
        console.error('Reject submission error:', error);
        res.status(500).json({
            success: false,
            message: 'Error rejecting submission',
            error: error.message
        });
    }
});

/**
 * Get global stats
 * GET /api/stats
 */
app.get('/api/stats', async (req, res) => {
    try {
        const developers = await pool.query(
            'SELECT COUNT(*) as count FROM developers WHERE is_approved = TRUE'
        );

        const projects = await pool.query(
            'SELECT COUNT(DISTINCT main_contract) as count FROM developers WHERE is_approved = TRUE'
        );

        const totalTx = await pool.query(
            'SELECT SUM(total_transactions) as total FROM project_stats'
        );

        res.json({
            success: true,
            stats: {
                totalDevelopers: parseInt(developers.rows[0].count) || 0,
                totalProjects: parseInt(projects.rows[0].count) || 0,
                totalTransactions: parseInt(totalTx.rows[0].total) || 0
            }
        });
    } catch (error) {
        console.error('Get global stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching stats',
            error: error.message
        });
    }
});

// ============================================
// Stats Update Function (Cron Job)
// ============================================

async function updateAllStats() {
    console.log('🔄 Starting stats update...');
    
    try {
        // Get all approved developers
        const developers = await pool.query(
            'SELECT wallet_address, main_contract FROM developers WHERE is_approved = TRUE'
        );

        for (const dev of developers.rows) {
            try {
                const contractAddress = dev.main_contract;
                
                // Get all transactions
                const transactions = await getContractTransactions(contractAddress);
                const totalTransactions = transactions.length;
                
                // Calculate unique wallets
                const uniqueWallets = calculateUniqueWallets(transactions);
                
                // Get transactions from last 12 hours
                const twelveHoursAgo = Math.floor(Date.now() / 1000) - (12 * 60 * 60);
                const recentTransactions = transactions.filter(tx => 
                    parseInt(tx.timeStamp) >= twelveHoursAgo
                );
                const transactionsLast12h = recentTransactions.length;
                
                // Calculate unique wallets from last 12 hours
                const walletsLast12h = calculateUniqueWallets(recentTransactions);
                
                // Get previous stats for growth calculation
                const prevStats = await pool.query(
                    'SELECT total_transactions, unique_wallets FROM project_stats WHERE wallet_address = $1',
                    [dev.wallet_address]
                );
                
                let growthRate = 0;
                if (prevStats.rows.length > 0) {
                    const prevTx = parseInt(prevStats.rows[0].total_transactions) || 0;
                    if (prevTx > 0) {
                        growthRate = ((totalTransactions - prevTx) / prevTx) * 100;
                    }
                }
                
                // Update or insert stats
                await pool.query(`
                    INSERT INTO project_stats (
                        wallet_address, main_contract, total_transactions,
                        transactions_last_12h, unique_wallets, wallets_last_12h,
                        growth_rate, last_scanned
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                    ON CONFLICT (wallet_address) 
                    DO UPDATE SET
                        total_transactions = $3,
                        transactions_last_12h = $4,
                        unique_wallets = $5,
                        wallets_last_12h = $6,
                        growth_rate = $7,
                        last_scanned = CURRENT_TIMESTAMP
                `, [
                    dev.wallet_address,
                    contractAddress,
                    totalTransactions,
                    transactionsLast12h,
                    uniqueWallets,
                    walletsLast12h,
                    growthRate
                ]);
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error(`Error updating stats for ${dev.wallet_address}:`, error);
            }
        }
        
        // Recalculate rankings
        await recalculateRankings();
        
        console.log('✅ Stats update completed');
    } catch (error) {
        console.error('❌ Stats update error:', error);
    }
}

async function recalculateRankings() {
    try {
        // Rank by transactions
        await pool.query(`
            UPDATE project_stats
            SET rank_tx = sub.rank
            FROM (
                SELECT wallet_address, 
                       ROW_NUMBER() OVER (ORDER BY total_transactions DESC) as rank
                FROM project_stats
            ) sub
            WHERE project_stats.wallet_address = sub.wallet_address
        `);
        
        // Rank by unique wallets
        await pool.query(`
            UPDATE project_stats
            SET rank_unique = sub.rank
            FROM (
                SELECT wallet_address,
                       ROW_NUMBER() OVER (ORDER BY unique_wallets DESC) as rank
                FROM project_stats
            ) sub
            WHERE project_stats.wallet_address = sub.wallet_address
        `);
        
        console.log('✅ Rankings recalculated');
    } catch (error) {
        console.error('❌ Ranking calculation error:', error);
    }
}

// ============================================
// Cron Job - Run every 12 hours
// ============================================
// Schedule: Run at 00:00 and 12:00 UTC
cron.schedule('0 */12 * * *', () => {
    console.log('⏰ Cron job triggered - Updating stats...');
    updateAllStats();
});

// Run immediately on startup (for testing)
if (NODE_ENV === 'development') {
    console.log('🔧 Development mode - Running initial stats update...');
    setTimeout(() => updateAllStats(), 5000);
}

// ============================================
// Start Server
// ============================================
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${NODE_ENV}`);
    console.log(`🔑 Admin wallet: ${ADMIN_WALLET}`);
    console.log(`🌐 Base RPC: ${BASE_RPC_URL}`);
    console.log(`🗄️  Database: ${DATABASE_URL ? 'Connected' : 'Not configured'}`);
    console.log(`🔑 BaseScan API: ${BASESCAN_API_KEY ? 'Configured' : 'Not configured'}`);
});

// Handle server errors
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
    } else {
        console.error('❌ Server error:', error);
    }
    process.exit(1);
});

// Error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('HTTP server closed');
    });
    await pool.end();
    process.exit(0);
});

module.exports = app;

