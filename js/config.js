// ============================================
// API Configuration
// ============================================

// Backend API Base URL
const API_BASE_URL = process.env.API_URL || 'https://builderhubonbase-production.up.railway.app/api';

// For local development, use:
// const API_BASE_URL = 'http://localhost:3000/api';

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { API_BASE_URL };
}

