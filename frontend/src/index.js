import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

// Define routes using react-router-dom
const router = createBrowserRouter([
    {
        path: "/*", // Catch-all path
        element: <AppWrapper />, // Use AppWrapper to render the App component
    },
]);

// AppWrapper component to encapsulate the App component
function AppWrapper() {
    return (
        <App />
    )
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        {/* Provide the router */}
        <RouterProvider router={router} />
    </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();