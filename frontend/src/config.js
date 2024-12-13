const config = {
    // Base URL for the backend API. Should match the backend's URL and port.
    API_BASE_URL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8888',
  
    // Frontend URL for redirecting after authentication. Should match the redirect URI.
    FRONTEND_URL: process.env.REACT_APP_FRONTEND_URL || 'http://localhost:5173',
};
  
export default config;  