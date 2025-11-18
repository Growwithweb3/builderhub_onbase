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
let pool = null;

if (DATABASE_URL) {
    try {
        pool = new Pool({
            connectionString: DATABASE_URL,
            // Railway requires SSL for all connections (internal and public)
            // Check for railway in URL or rlwy.net domain
            ssl: DATABASE_URL?.includes('railway') || DATABASE_URL?.includes('rlwy.net')
                ? { rejectUnauthorized: false } 
                : false,
            // Connection pool settings
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        });

        // Test database connection (non-blocking)
        pool.connect()
            .then((client) => {
                console.log('✅ Database connected successfully');
                client.release();
            })
            .catch(err => {
                console.error('❌ Database connection error:', err.message);
                console.log('⚠️  Server will continue without database connection');
            });
    } catch (error) {
        console.error('❌ Failed to create database pool:', error.message);
        console.log('⚠️  Server will continue without database connection');
    }
} else {
    console.warn('⚠️  DATABASE_URL not set - database features will be disabled');
}

// ============================================
// Initialize Database Tables
// ============================================
async function initializeDatabase() {
    if (!pool) {
        console.log('⚠️  Skipping database initialization - no database connection');
        return;
    }
    
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
// Helper Functions
// ============================================
function checkDatabase(req, res, next) {
    if (!pool) {
        return res.status(503).json({
            success: false,
            message: 'Database not available. Please check server configuration.'
        });
    }
    next();
}

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
        console.log(`🔍 Finding deployer for contract: ${contractAddress}`);
        const normalizedAddress = contractAddress.toLowerCase();
        
        if (!BASESCAN_API_KEY) {
            console.warn('⚠️  BASESCAN_API_KEY not configured');
        }
        
        // Method 1: Use Basescan transaction list API - MOST RELIABLE
        // Get the first transaction(s) to find the contract creation transaction
        if (BASESCAN_API_KEY) {
            try {
                console.log('🔍 Method 1: Querying Basescan transaction list API...');
                const txResponse = await axios.get('https://api.basescan.org/api', {
                    params: {
                        module: 'account',
                        action: 'txlist',
                        address: normalizedAddress,
                        startblock: 0,
                        endblock: 99999999,
                        page: 1,
                        offset: 20, // Get first 20 transactions to find creation
                        sort: 'asc',
                        apikey: BASESCAN_API_KEY
                    },
                    timeout: 15000
                });

                console.log('📡 Transaction list API response:', {
                    status: txResponse.data.status,
                    resultCount: txResponse.data.result?.length,
                    message: txResponse.data.message
                });

                if (txResponse.data.status === '1' && txResponse.data.result?.length > 0) {
                    // Look for the creation transaction
                    // Contract creation: 'to' is empty/null OR 'contractAddress' field exists
                    for (const tx of txResponse.data.result) {
                        const txTo = (tx.to || '').toLowerCase();
                        const txFrom = (tx.from || '').toLowerCase();
                        const txContractAddress = (tx.contractAddress || '').toLowerCase();
                        
                        // Check if this is a contract creation transaction
                        const isCreationTx = (!txTo || txTo === '' || txTo === '0x') || 
                                            (txContractAddress === normalizedAddress) ||
                                            (txTo === normalizedAddress && txFrom !== normalizedAddress);
                        
                        if (isCreationTx && txFrom) {
                            const deployer = txFrom.toLowerCase();
                            console.log(`✅ Contract deployer found (from transaction ${tx.hash}): ${deployer}`);
                            return deployer;
                        }
                    }
                    
                    // Fallback: Use first transaction's 'from' address
                    // This handles factory contracts where creation tx might not be obvious
                    const firstTx = txResponse.data.result[0];
                    if (firstTx.from) {
                        const deployer = firstTx.from.toLowerCase();
                        console.log(`✅ Contract deployer (from first transaction fallback): ${deployer}`);
                        return deployer;
                    }
                } else if (txResponse.data.message) {
                    console.log('⚠️  API message:', txResponse.data.message);
                }
            } catch (txApiError) {
                console.log('⚠️  Transaction list API failed:', txApiError.message);
                if (txApiError.response) {
                    console.log('Response:', JSON.stringify(txApiError.response.data, null, 2));
                }
            }
        }

        // Method 2: Try Basescan getcontractcreation API
        if (BASESCAN_API_KEY) {
            try {
                console.log('🔍 Method 2: Trying getcontractcreation API...');
                const response = await axios.get('https://api.basescan.org/api', {
                    params: {
                        module: 'contract',
                        action: 'getcontractcreation',
                        contractaddresses: normalizedAddress,
                        apikey: BASESCAN_API_KEY
                    },
                    timeout: 10000
                });

                console.log('📡 getcontractcreation API response:', {
                    status: response.data.status,
                    result: response.data.result,
                    message: response.data.message
                });

                if (response.data.status === '1' && response.data.result?.length > 0) {
                    const result = Array.isArray(response.data.result) ? response.data.result[0] : response.data.result;
                    const deployer = (result.contractCreator || result.creator || result.from)?.toLowerCase();
                    if (deployer) {
                        console.log(`✅ Contract deployer (getcontractcreation API): ${deployer}`);
                        return deployer;
                    }
                }
            } catch (apiError) {
                console.log('⚠️  getcontractcreation API failed:', apiError.message);
                if (apiError.response) {
                    console.log('Response:', JSON.stringify(apiError.response.data, null, 2));
                }
            }
        }

        // Method 3: Verify contract exists on blockchain
        console.log('🔍 Method 3: Verifying contract exists...');
        const provider = new ethers.providers.JsonRpcProvider(BASE_RPC_URL);
        
        try {
            const code = await provider.getCode(normalizedAddress);
            if (code === '0x') {
                console.error('❌ Contract does not exist at this address');
                return null;
            }
            
            console.log('✅ Contract exists on blockchain');
            console.log('⚠️  Could not determine deployer - all API methods failed');
            console.log('💡 Please check Basescan API key and ensure it has proper permissions');
            
            return null;
            
        } catch (blockchainError) {
            console.error('❌ Blockchain query error:', blockchainError.message);
            return null;
        }
        
    } catch (error) {
        console.error('❌ Error fetching contract deployer:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
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
app.post('/api/register', checkDatabase, async (req, res) => {
    try {
        const {
            walletAddress,
            xUsername,
            projectX,
            githubLink,
            mainContract,
            optionalContract1,
            optionalContract2,
            verificationSignature
        } = req.body;

        console.log('📝 Registration request received:', {
            walletAddress,
            xUsername,
            mainContract,
            hasSignature: !!verificationSignature
        });

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

        // VERIFY CONTRACT OWNERSHIP - CRITICAL SECURITY CHECK
        const deployer = await getContractDeployer(mainContract);
        
        if (deployer) {
            // Deployer found - STRICT VERIFICATION: Only deployer wallet can submit
            const walletMatches = deployer.toLowerCase() === walletAddress.toLowerCase();
            
            if (!walletMatches) {
                // Wallet doesn't match deployer - REJECT immediately
                // User must use the wallet that deployed the contract
                return res.status(403).json({
                    success: false,
                    message: `Contract ownership verification failed. Please use the wallet that deployed this contract (${deployer.slice(0, 6)}...${deployer.slice(-4)}). Signatures from other wallets are not accepted.`
                });
            } else {
                console.log('✅ Wallet matches contract deployer - no signature needed');
            }
        } else {
            // Deployer not found - This is a security risk, reject the submission
            // We cannot verify ownership without knowing the deployer
            console.log('⚠️  Contract deployer not found - rejecting for security');
            return res.status(403).json({
                success: false,
                message: 'Unable to verify contract ownership. The contract deployer could not be found. Please ensure the contract exists on Base network.'
            });
        }

        // Check if wallet already exists
        const existing = await pool.query(
            'SELECT * FROM developers WHERE wallet_address = $1',
            [walletAddress.toLowerCase()]
        );

        // Format X username
        const formattedXUsername = xUsername.startsWith('@') ? xUsername : `@${xUsername}`;

        // Clean empty strings to null
        const cleanProjectX = projectX && projectX.trim() ? projectX.trim() : null;
        const cleanGithubLink = githubLink && githubLink.trim() ? githubLink.trim() : null;
        const cleanOptional1 = optionalContract1 && optionalContract1.trim() ? optionalContract1.trim().toLowerCase() : null;
        const cleanOptional2 = optionalContract2 && optionalContract2.trim() ? optionalContract2.trim().toLowerCase() : null;

        let result;
        let isResubmission = false;

        if (existing.rows.length > 0) {
            const existingRecord = existing.rows[0];
            
            // If already approved, don't allow resubmission
            if (existingRecord.is_approved) {
                return res.status(400).json({
                    success: false,
                    message: 'Your profile is already approved. No need to resubmit.'
                });
            }
            
            // If pending (not rejected), don't allow resubmission
            if (!existingRecord.is_rejected) {
                return res.status(400).json({
                    success: false,
                    message: 'Your profile is already pending review. Please wait for admin approval.'
                });
            }
            
            // If rejected, allow resubmission - UPDATE the existing record
            isResubmission = true;
            console.log('🔄 Resubmitting rejected profile. Updating existing record ID:', existingRecord.id);
            
            result = await pool.query(
                `UPDATE developers SET
                    x_username = $1,
                    project_x = $2,
                    github_link = $3,
                    main_contract = $4,
                    optional_contract_1 = $5,
                    optional_contract_2 = $6,
                    verification_signature = $7,
                    is_approved = FALSE,
                    is_rejected = FALSE,
                    rejection_reason = NULL,
                    date_submitted = CURRENT_TIMESTAMP,
                    last_updated = CURRENT_TIMESTAMP
                WHERE wallet_address = $8
                RETURNING *`,
                [
                    formattedXUsername,
                    cleanProjectX,
                    cleanGithubLink,
                    mainContract.toLowerCase(),
                    cleanOptional1,
                    cleanOptional2,
                    verificationSignature || null,
                    walletAddress.toLowerCase()
                ]
            );
            
            console.log('✅ Rejected profile resubmitted successfully. ID:', result.rows[0].id);
        } else {
            // New registration - INSERT new record
            console.log('💾 Storing new developer data:', {
                walletAddress: walletAddress.toLowerCase(),
                xUsername: formattedXUsername,
                mainContract: mainContract.toLowerCase(),
                projectX: cleanProjectX,
                githubLink: cleanGithubLink,
                hasSignature: !!verificationSignature
            });

            result = await pool.query(
                `INSERT INTO developers (
                    wallet_address, x_username, project_x, github_link,
                    main_contract, optional_contract_1, optional_contract_2,
                    verification_signature, is_approved, is_rejected
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *`,
                [
                    walletAddress.toLowerCase(),
                    formattedXUsername,
                    cleanProjectX,
                    cleanGithubLink,
                    mainContract.toLowerCase(),
                    cleanOptional1,
                    cleanOptional2,
                    verificationSignature || null,
                    false,
                    false
                ]
            );

            console.log('✅ Developer registered successfully. ID:', result.rows[0].id);
        }
        
        res.json({
            success: true,
            message: isResubmission 
                ? 'Profile resubmitted successfully. Waiting for admin approval.'
                : 'Profile submitted successfully. Waiting for admin approval.',
            profileId: result.rows[0].id,
            isResubmission: isResubmission
        });
    } catch (error) {
        console.error('❌ Register error:', error);
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

        console.log('Verify contract owner request:', { contractAddress, walletAddress });

        if (!contractAddress || !walletAddress) {
            return res.status(400).json({
                success: false,
                message: 'Missing contractAddress or walletAddress'
            });
        }

        // Validate contract address format
        if (!contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid contract address format'
            });
        }

        // Validate wallet address format
        if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid wallet address format'
            });
        }

        // Get contract deployer
        const deployer = await getContractDeployer(contractAddress);

        // If deployer can't be found, allow signature verification instead
        if (!deployer) {
            console.log('⚠️  Deployer not found, allowing signature-based verification');
            return res.json({
                success: true,
                deployerMatches: false,
                deployerAddress: null,
                requiresSignature: true,
                message: 'Could not automatically verify deployer. Please sign a message to prove ownership.'
            });
        }

        const deployerMatches = deployer === walletAddress.toLowerCase();
        const requiresSignature = !deployerMatches;

        console.log('Deployer check:', { deployer, walletAddress: walletAddress.toLowerCase(), deployerMatches });

        res.json({
            success: true,
            deployerMatches,
            deployerAddress: deployer,
            requiresSignature: false // No longer accepting signatures from other wallets
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

        console.log('Verify signature request:', { contractAddress, walletAddress, hasMessage: !!message, hasSignature: !!signature });

        if (!contractAddress || !walletAddress || !message || !signature) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Validate addresses
        if (!contractAddress.match(/^0x[a-fA-F0-9]{40}$/) || !walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address format'
            });
        }

        // Recover address from signature
        let recoveredAddress;
        try {
            recoveredAddress = ethers.utils.verifyMessage(message, signature);
            console.log('Recovered address from signature:', recoveredAddress);
        } catch (sigError) {
            console.error('Error recovering address from signature:', sigError);
            return res.status(400).json({
                success: false,
                message: 'Invalid signature format'
            });
        }

        // Get contract deployer (optional - if not found, verify signature matches connected wallet)
        const deployer = await getContractDeployer(contractAddress);

        let verified = false;
        
        if (deployer) {
            // If deployer found: verify signature matches deployer
            verified = recoveredAddress.toLowerCase() === deployer.toLowerCase();
            console.log('Signature verification (with deployer):', {
                recoveredAddress: recoveredAddress.toLowerCase(),
                deployer: deployer.toLowerCase(),
                verified
            });
        } else {
            // If deployer not found: verify signature matches connected wallet
            // This allows users to prove ownership via signature even if API fails
            verified = recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
            console.log('⚠️  Deployer not found, verifying signature matches connected wallet:', {
                recoveredAddress: recoveredAddress.toLowerCase(),
                walletAddress: walletAddress.toLowerCase(),
                verified
            });
        }

        if (verified && pool) {
            try {
                // Update developer record with signature
                await pool.query(
                    'UPDATE developers SET verification_signature = $1 WHERE wallet_address = $2',
                    [signature, walletAddress.toLowerCase()]
                );
                console.log('Signature saved to database');
            } catch (dbError) {
                console.error('Database update error:', dbError);
                // Continue even if DB update fails
            }
        }

        res.json({
            success: true,
            verified,
            message: verified 
                ? 'Signature verified successfully' 
                : (deployer 
                    ? 'Signature verification failed: The signer address does not match the contract deployer'
                    : 'Signature verification failed: The signer address does not match your connected wallet')
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
app.get('/api/check-status/:walletAddress', checkDatabase, async (req, res) => {
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
app.get('/api/profile/:walletAddress', checkDatabase, async (req, res) => {
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
app.get('/api/stats/:walletAddress', checkDatabase, async (req, res) => {
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
app.get('/api/leaderboard', checkDatabase, async (req, res) => {
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
app.get('/api/pending-submissions', checkDatabase, async (req, res) => {
    try {
        // Check admin wallet (in production, verify from request headers/auth)
        const adminWallet = req.headers['x-admin-wallet']?.toLowerCase();
        
        console.log('🔐 Admin check:', {
            received: adminWallet,
            expected: ADMIN_WALLET,
            match: adminWallet === ADMIN_WALLET,
            receivedType: typeof adminWallet,
            expectedType: typeof ADMIN_WALLET
        });
        
        if (!adminWallet || adminWallet !== ADMIN_WALLET) {
            console.log('❌ Admin access denied - wallet mismatch');
            return res.status(403).json({
                success: false,
                message: 'Admin access required. Please connect the admin wallet.'
            });
        }

        const status = req.query.status || 'pending';
        console.log('📋 Fetching submissions with status:', status);
        
        let query;

        if (status === 'approved') {
            query = 'SELECT * FROM developers WHERE is_approved = TRUE ORDER BY date_submitted DESC';
        } else if (status === 'rejected') {
            query = 'SELECT * FROM developers WHERE is_rejected = TRUE ORDER BY date_submitted DESC';
        } else {
            query = 'SELECT * FROM developers WHERE is_approved = FALSE AND is_rejected = FALSE ORDER BY date_submitted DESC';
        }

        console.log('🔍 Executing query:', query);
        const result = await pool.query(query);
        console.log('📊 Database returned', result.rows.length, 'rows');

        // Map database columns to frontend expected format
        const submissions = result.rows.map(row => {
            const submission = {
                id: row.id,
                walletAddress: row.wallet_address,
                xUsername: row.x_username,
                projectX: row.project_x,
                githubLink: row.github_link,
                mainContract: row.main_contract,
                optionalContract1: row.optional_contract_1,
                optionalContract2: row.optional_contract_2,
                isApproved: row.is_approved,
                isRejected: row.is_rejected,
                dateSubmitted: row.date_submitted
            };
            console.log('📝 Mapped submission:', submission.id, submission.walletAddress);
            return submission;
        });

        console.log(`✅ Returning ${submissions.length} submissions for status: ${status}`);

        res.json({
            success: true,
            submissions: submissions
        });
    } catch (error) {
        console.error('❌ Get pending submissions error:', error);
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
app.get('/api/submission/:id', checkDatabase, async (req, res) => {
    try {
        const adminWallet = req.headers['x-admin-wallet']?.toLowerCase();
        
        if (adminWallet !== ADMIN_WALLET) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const submissionId = parseInt(req.params.id);
        console.log('🔍 Fetching submission ID:', submissionId);

        const result = await pool.query(
            'SELECT * FROM developers WHERE id = $1',
            [submissionId]
        );

        if (result.rows.length === 0) {
            console.log('❌ Submission not found for ID:', submissionId);
            return res.status(404).json({
                success: false,
                message: 'Submission not found'
            });
        }

        const submission = result.rows[0];
        console.log('✅ Submission found:', {
            id: submission.id,
            wallet: submission.wallet_address,
            xUsername: submission.x_username
        });

        // Map database columns to frontend expected format
        res.json({
            success: true,
            submission: {
                id: submission.id,
                walletAddress: submission.wallet_address,
                xUsername: submission.x_username,
                projectX: submission.project_x,
                githubLink: submission.github_link,
                mainContract: submission.main_contract,
                optionalContract1: submission.optional_contract_1,
                optionalContract2: submission.optional_contract_2,
                isApproved: submission.is_approved,
                isRejected: submission.is_rejected,
                dateSubmitted: submission.date_submitted
            }
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
app.get('/api/stats', checkDatabase, async (req, res) => {
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

