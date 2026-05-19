// Environment-aware API configuration
const isNetlify = window.location.hostname.includes('netlify.app');

function getApiConfig() {
  if (isNetlify) {
    // Production: use a short relative API path and let Netlify proxy to backend
    return {
      API_BASE: `${window.location.origin}/api`,
      UPLOAD_BASE: `${window.location.origin}/uploads`,
      API_KEY: 'ekatalog-secure-token-123'
    };
  }

  // Development: Use local backend
  return {
    API_BASE: 'http://localhost:8000/api.php',
    UPLOAD_BASE: 'http://localhost:8000/uploads',
    API_KEY: 'ekatalog-secure-token-123'
  };
}

// Export configuration
const config = getApiConfig();
const API_BASE = config.API_BASE;
const UPLOAD_BASE = config.UPLOAD_BASE;
const API_KEY = config.API_KEY;

// Log configuration for debugging
console.log('API Configuration:', {
  environment: isNetlify ? 'production' : 'development',
  API_BASE,
  UPLOAD_BASE
});