import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { LOGO } from './logo.js';
import './styles.css';
import { testFirebase } from "./testFirebase.js";

testFirebase();

// Use the SeaFlow logo as the browser tab icon.
const icon = document.querySelector("link[rel~='icon']") || document.head.appendChild(document.createElement('link'));
icon.rel = 'icon';
icon.href = LOGO;
document.title = 'SeaFlow';

createRoot(document.getElementById('root')).render(<App />);
