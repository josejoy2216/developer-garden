"use strict";
// Developer Garden — extension entry point.
// Privacy: everything below operates on local metadata only. No code, file
// contents, or project information ever leaves this machine.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const store_1 = require("./store");
const skills_1 = require("./skills");
const growthEngine_1 = require("./growthEngine");
const gardenView_1 = require("./gardenView");
const summaries_1 = require("./summaries");
async function activate(context) {
    const store = await store_1.Store.load(context);
    const engine = new growthEngine_1.GrowthEngine(store, new skills_1.SkillDetector());
    const provider = new gardenView_1.GardenViewProvider(context.extensionUri, store);
    context.subscriptions.push(store, engine, provider, vscode.window.registerWebviewViewProvider(gardenView_1.GardenViewProvider.viewType, provider));
    // Gentle unlock toasts — celebrations only, fully passive otherwise.
    context.subscriptions.push(engine.onUnlock((messages) => {
        for (const m of messages) {
            void vscode.window.setStatusBarMessage(`$(sparkle) ${m}`, 8000);
        }
    }));
    // Status bar: today's growth at a glance. Click to open the garden.
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    status.command = 'developerGarden.open';
    status.tooltip = 'Open your Developer Garden';
    const refreshStatus = () => {
        const enabled = vscode.workspace
            .getConfiguration('developerGarden')
            .get('statusBar.enabled', true);
        if (!enabled) {
            status.hide();
            return;
        }
        const d = (0, summaries_1.dailySummary)(store.get());
        status.text = `$(squirrel) +${d.growth}`;
        status.show();
    };
    refreshStatus();
    context.subscriptions.push(status, store.onDidChange(refreshStatus), vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('developerGarden')) {
            refreshStatus();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('developerGarden.open', () => provider.reveal()), vscode.commands.registerCommand('developerGarden.dailySummary', () => {
        void vscode.window.showInformationMessage((0, summaries_1.dailyText)((0, summaries_1.dailySummary)(store.get())), { modal: false });
    }), vscode.commands.registerCommand('developerGarden.weeklySummary', () => {
        void vscode.window.showInformationMessage((0, summaries_1.weeklyText)((0, summaries_1.weeklySummary)(store.get())), { modal: false });
    }), vscode.commands.registerCommand('developerGarden.exportData', async () => {
        const target = await vscode.window.showSaveDialog({
            saveLabel: 'Export garden',
            filters: { JSON: ['json'] },
            defaultUri: vscode.Uri.file('developer-garden-export.json')
        });
        if (target) {
            await store.exportTo(target);
            void vscode.window.showInformationMessage('Garden exported. It is and always was only on your machine.');
        }
    }));
}
function deactivate() {
    // Store flushes on dispose via context.subscriptions.
}
//# sourceMappingURL=extension.js.map