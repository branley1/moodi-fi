# Moodi-Fi 🎧

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
## Overview

Moodi-Fi is a web application that provides personalized insights into your Spotify listening habits. It leverages the Spotify Web API to fetch your top tracks and listening data, and utilizes the power of AI (via Google's Gemini models) to generate insightful summaries and even create personalized Spotify playlists based on your musical taste or user mood inputs.

**Key Features:**

*   **Spotify Authentication:** Securely log in with your Spotify account to authorize data access.
*   **Fetch Top Tracks:**  Retrieve your most listened to tracks over different time ranges (short, medium, long-term) from Spotify.
*   **AI-Powered Summary:** Generate a personalized summary of your listening data, highlighting your favorite artists, genres, and musical moods using Google's Gemini AI.
*   **Spotify Playlist Generation:** Create new Spotify playlists based on your top tracks, making it easy to enjoy your personalized music selections.
*   **(Future/Optional) Audio Summary:**  **(Currently not implemented in detail)**  Intended feature to generate an audio summary of your listening habits (using Text-to-Speech).
*   **Logout Functionality:** Securely logout and revoke Spotify access.

## Technologies Used

This project is built using a modern JavaScript stack and leverages powerful APIs:

**Frontend:**

*   **React:**  A JavaScript library for building user interfaces.
*   **React Router:** For declarative routing in the React application.
*   **Axios:**  For making HTTP requests to the backend API and Spotify Web API.
*   **Create React App (or Vite):**  *(Specify which one you used if you remember)*  For project setup and development tooling.
*   **JavaScript (ES6+):**  Modern JavaScript for frontend logic.
*   **HTML/CSS:**  Standard web technologies for structure and styling.

**Backend:**

*   **Node.js:**  JavaScript runtime environment for the server-side application.
*   **Express.js:**  Fast, unopinionated, minimalist web framework for Node.js.
*   **Passport.js:** Authentication middleware for Node.js (specifically `passport-spotify` strategy).
*   **JSON Web Tokens (JWT):** For secure user authentication and authorization.
*   **`express-csp-header`:** For setting Content Security Policy (CSP) headers for enhanced security.
*   **`cookie-parser`:** Middleware to parse cookies in requests.
*   **`cors`:** Middleware to enable Cross-Origin Resource Sharing for API access from the frontend.
*   **`dotenv`:** For loading environment variables from `.env` files.
*   **`mongoose`:**  Mongoose ODM for MongoDB object modeling and interaction.
*   **MongoDB:**  NoSQL database to store user data and summaries.
*   **Google Generative AI (Gemini Models):**  Leveraging Google's AI models for text summarization and (future) audio generation.
*   **`node-cron`:**  For scheduling cleanup tasks (e.g., expired tokens).
*   **`winston`:**  For logging server-side events and errors.

**APIs:**

*   **Spotify Web API:**  For fetching user listening data, creating playlists, and user profile information.
*   **Google Generative AI API (Gemini 2.0 Flash Exp):** For generating summaries from listening data.
*   **(Future/Optional) Text-to-Speech API (e.g., Google Cloud Text-to-Speech, OpenAI)** For audio summary generation.

## Setup Instructions (Local Development)

Follow these steps to set up Moodi-Fi on your local machine for development:

**Prerequisites:**

*   **Node.js and npm (or yarn):** Ensure you have Node.js and npm (Node Package Manager) or yarn installed on your system. You can download them from [nodejs.org](https://nodejs.org/).
*   **MongoDB:** You need a running MongoDB database instance. You can install MongoDB Community Edition locally or use a cloud-based MongoDB service like MongoDB Atlas. Ensure MongoDB is running and you have the connection URI handy.
*   **Spotify Developer Account:**
    1.  Go to [Spotify for Developers](https://developer.spotify.com/dashboard/) and log in with your Spotify account.
    2.  Create a new App.
    3.  Note down your **Client ID** and **Client Secret** from your newly created Spotify App's settings.
    4.  In your Spotify App settings, add `http://localhost:8888/api/spotify-callback` as a **Redirect URI**.  *(Important: Make sure the port `8888` matches your backend server port configuration)*
*   **Google Cloud API Key:**
    1.  Go to [Google Cloud Console](https://console.cloud.google.com/).
    2.  Create a new Google Cloud Project (if you don't have one).
    3.  Enable the **Gemini API** for your project.
    4.  Create an API key for your project and note it down.
*   **Environment Variables:** You will need to set up environment variables for both the backend and frontend.

**Backend Setup (Server - Port 8888):**

1.  **Navigate to the backend directory:**
    ```bash
    cd moodi-fi/backend
    ```
2.  **Install backend dependencies:**
    ```bash
    npm install  # or yarn install
    ```
3.  **Create a `.env` file in the `backend` directory.**
    *   Add the following environment variables to your `.env` file, replacing the placeholder values with your actual credentials and URLs:

        ```
        SPOTIFY_CLIENT_ID=YOUR_SPOTIFY_CLIENT_ID
        SPOTIFY_CLIENT_SECRET=YOUR_SPOTIFY_CLIENT_SECRET
        SPOTIFY_CALLBACK_URL=http://localhost:8888/api/spotify-callback
        GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY
        MONGODB_URI=YOUR_MONGODB_CONNECTION_URI  # e.g., mongodb://localhost:27017/moodifi
        SESSION_SECRET=YOUR_SESSION_SECRET_KEY # Generate a strong, random secret key
        JWT_SECRET=YOUR_JWT_SECRET_KEY         # Generate a strong, random JWT secret key
        NODE_ENV=development                     # Set to 'production' for production deployments
        FRONTEND_URL=http://localhost:3000      # URL where your frontend will be running in development
        API_BASE_URL=http://localhost:8888       # Base URL of your backend API
        PORT=8888                                # Port for backend server (optional, defaults to 8888 if not set)
        ```
        *   **Important:** Generate strong, random values for `SESSION_SECRET` and `JWT_SECRET`.  Do not use example secrets in production!
        *   **MONGODB_URI:**  Make sure this points to your running MongoDB instance.
        *   **FRONTEND_URL:**  Ensure this is set to `http://localhost:3000` unless your frontend development server is configured to run on a different port.
        *   **API_BASE_URL:** Should be set to `http://localhost:8888` unless you change the backend server port.
4.  **Start the backend server:**
    ```bash
    npm run dev # or npm start, or node server.js (depending on your scripts in backend/package.json)
    ```
    You should see a message in the console indicating that the backend server is running on port 8888 and connected to MongoDB.

**Frontend Setup (Client - Port 3000):**

1.  **Navigate to the frontend directory:**
    ```bash
    cd ../frontend # From the backend directory, go up one level and then into the frontend directory
    ```
2.  **Install frontend dependencies:**
    ```bash
    npm install  # or yarn install
    ```
3.  **Create a `.env.local` file in the `frontend` directory.**
    *   Add the following environment variables to your `.env.local` file:

        ```
        REACT_APP_API_BASE_URL=http://localhost:8888  # Base URL of your backend API
        REACT_APP_FRONTEND_URL=http://localhost:3000 # URL where your frontend is running (itself)
        ```
        *   **Important:** `REACT_APP_` prefix is necessary for React to recognize these environment variables.
4.  **Start the frontend development server:**
    ```bash
    npm start # or yarn start
    ```
    You should see a message in the console indicating that the frontend development server is running and accessible in your browser at `http://localhost:3000` (or `http://localhost:5173`, etc., depending on your setup).

## Running the Application

1.  **Start the Backend Server:** In one terminal window, navigate to the `backend` directory and run your backend start command (e.g., `npm run dev`). Ensure it's running on port 8888.
2.  **Start the Frontend Development Server:** In a separate terminal window, navigate to the `frontend` directory and run your frontend start command (e.g., `npm start`). Ensure it's running on port 3000 (or your configured frontend port).
3.  **Access Moodi-Fi in your Browser:** Open your web browser and go to `http://localhost:3000`. You should see the Moodi-Fi application UI.
4.  **Login with Spotify:** Click the "Login with Spotify" button and follow the Spotify authentication flow.
5.  **Explore Features:** Once logged in, you can use the buttons to fetch your top tracks, generate summaries, and create playlists.

## Scalability and CI/CD Readiness

This project is designed with scalability and CI/CD (Continuous Integration and Continuous Deployment) in mind, although a full CI/CD pipeline is not yet implemented.  Key aspects supporting scalability and CI/CD include:

*   **Separated Frontend and Backend:**  The frontend React application and backend Node.js/Express API are intentionally separated into distinct directories. This separation allows for independent scaling and deployment of each component.
*   **JWT Authentication:** Using JWT for authentication allows for stateless and scalable API authorization.
*   **Environment Variable Configuration:**  Configuration is driven by environment variables, making it easier to deploy to different environments (development, staging, production) and manage secrets securely.
*   **Rate Limiting:** Basic rate limiting is implemented on API routes to protect against abuse and ensure API stability.
*   **Database Persistence (MongoDB):** MongoDB provides a scalable and flexible database for storing user data and summaries.
*   **Logging (Winston):** Server-side logging is implemented using Winston, which is crucial for monitoring and debugging in production.
*   **Future CI/CD Pipeline:**  The project structure is set up to be easily integrated with CI/CD tools like GitHub Actions, Jenkins, or GitLab CI. A future CI/CD pipeline could automate:
    *   Automated testing (unit tests, integration tests, end-to-end tests).
    *   Building and bundling the frontend React application.
    *   Containerization (using Docker) of both frontend and backend.
    *   Deployment to cloud platforms (AWS, Google Cloud, Heroku, etc.).

## Future Enhancements (Roadmap)

*   **Implement Audio Summary Generation:** Fully integrate a Text-to-Speech API to generate and play audio summaries of listening data.
*   **Enhanced AI Summarization:** Explore more advanced prompting techniques and Gemini model features to create even richer and more personalized summaries.
*   **User Profiles and Data Persistence:** Implement user profile management, allowing users to save summaries, generated playlists, and other personalized data.
*   **Playlist Customization:** Allow users to customize generated playlists (name, description, public/private status).
*   **Genre/Mood-Based Playlist Generation:** Enhance playlist generation to create playlists based on specific genres, moods, or activities identified in the user's listening data.
*   **Improved UI/UX:** Enhance the user interface and user experience for a more engaging and visually appealing application.
*   **CI/CD Pipeline Implementation:** Set up a fully automated CI/CD pipeline for building, testing, and deploying the application to a cloud platform.
*   **Testing:** Implement comprehensive unit tests, integration tests, and end-to-end tests for both frontend and backend to ensure code quality and stability.

## Contributing

Contributions to Moodi-Fi are welcome! If you'd like to contribute:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes and commit them with clear, concise commit messages.
4.  Submit a pull request with a detailed description of your changes.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Author

Branley Mmasi

---
