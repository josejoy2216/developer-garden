// Developer Garden — extension entry point.
// Privacy: everything below operates on local metadata only. No code, file
// contents, or project information ever leaves this machine.

import * as vscode from 'vscode';
import { Store } from './store';
import { SkillDetector } from './skills';
import { GrowthEngine } from './growthEngine';
import { GardenViewProvider } from './gardenView';
import { dailySummary, dailyText, weeklySummary, weeklyText } from './summaries';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const store = await Store.load(context);
  const engine = new GrowthEngine(store, new SkillDetector());
  const provider = new GardenViewProvider(context.extensionUri, store);

  context.subscriptions.push(
    store,
    engine,
    provider,
    vscode.window.registerWebviewViewProvider(GardenViewProvider.viewType, provider)
  );

  // Gentle unlock toasts — celebrations only, fully passive otherwise.
  context.subscriptions.push(
    engine.onUnlock((messages) => {
      for (const m of messages) {
        void vscode.window.setStatusBarMessage(`$(sparkle) ${m}`, 8000);
      }
    })
  );

  // Status bar: today's growth at a glance. Click to open the garden.
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.command = 'developerGarden.open';
  status.tooltip = 'Open your Developer Garden';
  const refreshStatus = () => {
    const enabled = vscode.workspace
      .getConfiguration('developerGarden')
      .get<boolean>('statusBar.enabled', true);
    if (!enabled) {
      status.hide();
      return;
    }
    const d = dailySummary(store.get());
    status.text = `$(squirrel) +${d.growth}`;
    status.show();
  };
  refreshStatus();
  context.subscriptions.push(
    status,
    store.onDidChange(refreshStatus),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('developerGarden')) {
        refreshStatus();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('developerGarden.open', () => provider.reveal()),
    vscode.commands.registerCommand('developerGarden.dailySummary', () => {
      void vscode.window.showInformationMessage(dailyText(dailySummary(store.get())), { modal: false });
    }),
    vscode.commands.registerCommand('developerGarden.weeklySummary', () => {
      void vscode.window.showInformationMessage(weeklyText(weeklySummary(store.get())), { modal: false });
    }),
    vscode.commands.registerCommand('developerGarden.exportData', async () => {
      const target = await vscode.window.showSaveDialog({
        saveLabel: 'Export garden',
        filters: { JSON: ['json'] },
        defaultUri: vscode.Uri.file('developer-garden-export.json')
      });
      if (target) {
        await store.exportTo(target);
        void vscode.window.showInformationMessage('Garden exported. It is and always was only on your machine.');
      }
    })
  );
}

export function deactivate(): void {
  // Store flushes on dispose via context.subscriptions.
}
