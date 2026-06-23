/**
 * Configuration file for Nexus Reader Frontend
 * Manages environment-specific variables like the Backend API URL.
 */
// Dynamically determine the backend URL based on where the frontend is hosted.
// If running locally, point to the local Flask server on port 5000.
// If deployed to the internet, point to your production backend URL.
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : window.location.origin;

