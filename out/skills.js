"use strict";
// Skill detection — maps an open document to a technology, using only the
// language id, the file name, and (cheaply, once per workspace) marker files.
// File contents are never read for analysis beyond these local checks.
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
exports.SkillDetector = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const LANGUAGE_SKILLS = {
    typescript: 'TypeScript',
    typescriptreact: 'React',
    javascriptreact: 'React',
    javascript: 'JavaScript',
    python: 'Python',
    php: 'PHP',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    kotlin: 'Kotlin',
    swift: 'Swift',
    ruby: 'Ruby',
    csharp: 'C#',
    cpp: 'C++',
    c: 'C',
    dart: 'Dart',
    vue: 'Vue',
    svelte: 'Svelte',
    html: 'HTML & CSS',
    css: 'HTML & CSS',
    scss: 'HTML & CSS',
    less: 'HTML & CSS',
    sql: 'SQL',
    shellscript: 'Shell',
    powershell: 'PowerShell',
    dockerfile: 'Docker',
    terraform: 'Terraform',
    yaml: '', // resolved by filename below
    json: ''
};
const FILENAME_SKILLS = [
    { test: /^dockerfile/i, skill: 'Docker' },
    { test: /docker-compose.*\.ya?ml$/i, skill: 'Docker' },
    { test: /\.tf$/i, skill: 'Terraform' },
    { test: /^(serverless|sam-template)\.ya?ml$/i, skill: 'AWS' },
    { test: /cloudformation.*\.(ya?ml|json)$/i, skill: 'AWS' },
    { test: /^\.github[\\/].*\.ya?ml$/i, skill: 'CI/CD' },
    { test: /^(\.gitlab-ci|azure-pipelines)\.ya?ml$/i, skill: 'CI/CD' },
    { test: /^kustomization\.ya?ml$/i, skill: 'Kubernetes' },
    { test: /\.k8s\.ya?ml$/i, skill: 'Kubernetes' }
];
/** Workspace marker files that indicate a framework skill. */
const WORKSPACE_MARKERS = [
    { marker: 'artisan', skill: 'Laravel' },
    { marker: 'wp-config.php', skill: 'WordPress' },
    { marker: 'next.config.js', skill: 'Next.js' },
    { marker: 'next.config.mjs', skill: 'Next.js' },
    { marker: 'next.config.ts', skill: 'Next.js' },
    { marker: 'nuxt.config.ts', skill: 'Nuxt' },
    { marker: 'angular.json', skill: 'Angular' },
    { marker: 'manage.py', skill: 'Django' },
    { marker: 'Cargo.toml', skill: 'Rust' },
    { marker: 'go.mod', skill: 'Go' },
    { marker: 'pubspec.yaml', skill: 'Flutter' }
];
class SkillDetector {
    constructor() {
        /** workspace fsPath -> framework skills detected once per session */
        this.workspaceSkills = new Map();
    }
    async skillsForDocument(doc) {
        const skills = new Set();
        const base = path.basename(doc.uri.fsPath);
        for (const { test, skill } of FILENAME_SKILLS) {
            if (test.test(base) || test.test(vscode.workspace.asRelativePath(doc.uri))) {
                skills.add(skill);
            }
        }
        const byLang = LANGUAGE_SKILLS[doc.languageId];
        if (byLang) {
            skills.add(byLang);
        }
        const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
        if (folder) {
            for (const s of await this.frameworkSkills(folder)) {
                skills.add(s);
            }
        }
        return [...skills];
    }
    async frameworkSkills(folder) {
        const key = folder.uri.fsPath;
        const cached = this.workspaceSkills.get(key);
        if (cached) {
            return cached;
        }
        const found = [];
        await Promise.all(WORKSPACE_MARKERS.map(async ({ marker, skill }) => {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, marker));
                found.push(skill);
            }
            catch {
                /* marker absent */
            }
        }));
        this.workspaceSkills.set(key, found);
        return found;
    }
}
exports.SkillDetector = SkillDetector;
//# sourceMappingURL=skills.js.map