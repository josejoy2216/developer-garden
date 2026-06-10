"use strict";
// Persistence: one JSON file in VS Code's global storage directory.
// Everything stays on the user's machine. Nothing is transmitted, ever.
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
exports.Store = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const FILE_NAME = 'garden.json';
class Store {
    constructor(context, state) {
        this.context = context;
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChange = this._onDidChange.event;
        this.state = state;
        this.fileUri = vscode.Uri.joinPath(context.globalStorageUri, FILE_NAME);
    }
    static async load(context) {
        const fileUri = vscode.Uri.joinPath(context.globalStorageUri, FILE_NAME);
        let state = (0, types_1.emptyState)();
        try {
            const bytes = await vscode.workspace.fs.readFile(fileUri);
            const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
            if (parsed && typeof parsed === 'object' && parsed.version <= types_1.STATE_VERSION) {
                state = { ...(0, types_1.emptyState)(), ...parsed, version: types_1.STATE_VERSION };
            }
        }
        catch {
            // First run (or unreadable file) — start a fresh garden, never crash.
        }
        return new Store(context, state);
    }
    get() {
        return this.state;
    }
    /** Mutate state inside fn, then schedule a debounced write + notify the view. */
    update(fn) {
        fn(this.state);
        this._onDidChange.fire(this.state);
        this.scheduleSave();
    }
    scheduleSave() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => void this.flush(), 2000);
    }
    async flush() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        try {
            await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
            const json = JSON.stringify(this.state);
            await vscode.workspace.fs.writeFile(this.fileUri, Buffer.from(json, 'utf8'));
        }
        catch (err) {
            console.error('[developer-garden] failed to save garden state', err);
        }
    }
    async exportTo(target) {
        const json = JSON.stringify(this.state, null, 2);
        await vscode.workspace.fs.writeFile(target, Buffer.from(json, 'utf8'));
    }
    dispose() {
        void this.flush();
        this._onDidChange.dispose();
    }
}
exports.Store = Store;
//# sourceMappingURL=store.js.map