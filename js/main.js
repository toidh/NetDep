import { AppConfig } from './config.js';
import { Storage } from './storage.js';
import { DataService } from './data.js';
import { Auth } from './auth.js';
import { Projects } from './projects.js';
import { AIAssistant } from './ai-assistant.js';
import { MapManager } from './map.js';
import { App } from './app.js';

// Expose to window for inline HTML event handlers
window.AppConfig = AppConfig;
window.Storage = Storage;
window.DataService = DataService;
window.Auth = Auth;
// checkin-report.js là script thường (không phải module) nên đọc registry qua window
window.Projects = Projects;
window.AIAssistant = AIAssistant;
window.MapManager = MapManager;
window.App = App;
