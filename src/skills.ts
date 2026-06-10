// Skill detection — maps an open document to a technology, using only the
// language id, the file name, and (cheaply, once per workspace) marker files.
// File contents are never read for analysis beyond these local checks.

import * as vscode from 'vscode';
import * as path from 'path';

const LANGUAGE_SKILLS: Record<string, string> = {
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

const FILENAME_SKILLS: Array<{ test: RegExp; skill: string }> = [
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
const WORKSPACE_MARKERS: Array<{ marker: string; skill: string }> = [
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

export class SkillDetector {
  /** workspace fsPath -> framework skills detected once per session */
  private workspaceSkills = new Map<string, string[]>();

  async skillsForDocument(doc: vscode.TextDocument): Promise<string[]> {
    const skills = new Set<string>();
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

  private async frameworkSkills(folder: vscode.WorkspaceFolder): Promise<string[]> {
    const key = folder.uri.fsPath;
    const cached = this.workspaceSkills.get(key);
    if (cached) {
      return cached;
    }
    const found: string[] = [];
    await Promise.all(
      WORKSPACE_MARKERS.map(async ({ marker, skill }) => {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, marker));
          found.push(skill);
        } catch {
          /* marker absent */
        }
      })
    );
    this.workspaceSkills.set(key, found);
    return found;
  }
}
