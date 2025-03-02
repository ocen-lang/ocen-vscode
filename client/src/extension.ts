/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from "path";
import { workspace, ExtensionContext } from "vscode";
import * as vscode from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;
// Create a single output channel that will be reused
let outputChannel: vscode.OutputChannel;

class DisposableLanguageClient implements vscode.Disposable {
    constructor(private client: LanguageClient) {}

    dispose() {
        this.client.stop();
    }
}

export function activate(context: ExtensionContext) {
    outputChannel = outputChannel || vscode.window.createOutputChannel("Ocen Language Server");

    startLanguageClient(context);

    // Register a command that the user can run from the command window
    const rescanDocument = vscode.commands.registerCommand('extension.rescanDocument', () => {
        // Get the active text editor
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            documentOnChange();
        }
    });

    let isRestarting = false;

    const restartLsp = vscode.commands.registerCommand('extension.restartLsp', () => {
        if (isRestarting) return;
        isRestarting = true;
        deactivate().then(() => {
            startLanguageClient(context);
            isRestarting = false;
        });
    });

    const toggleLspBackend = vscode.commands.registerCommand('extension.toggleLspBackend', () => {
        if (isRestarting) return;
        isRestarting = true;
        const config = workspace.getConfiguration('ocen');
        const useNewBackend = config.get<boolean>('useNewBackend', false);
        config.update('useNewBackend', !useNewBackend, vscode.ConfigurationTarget.Global).then(() => {
            vscode.window.showInformationMessage(`LSP backend switched to ${!useNewBackend ? 'new' : 'default'}.`);
            deactivate().then(() => {
                startLanguageClient(context);
                isRestarting = false;
            });
        });
    });

    context.subscriptions.push(rescanDocument, restartLsp, toggleLspBackend);
}

function startLanguageClient(context: ExtensionContext) {
    const config = workspace.getConfiguration('ocen');
    const useNewBackend = config.get<boolean>('useNewBackend', false);
    const ocenPath = config.get<string>('ocenPath', 'ocen');

    let serverOptions: ServerOptions;

    if (useNewBackend) {
        serverOptions = {
            run: { command: ocenPath, args: ['lsp-server'], transport: TransportKind.stdio },
            debug: { command: ocenPath, args: ['lsp-server'], transport: TransportKind.stdio }
        };
    } else {
        const serverModule = context.asAbsolutePath(path.join("out", "server", "src", "server.js"));
        const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

        serverOptions = {
            run: { module: serverModule, transport: TransportKind.ipc },
            debug: {
                module: serverModule,
                transport: TransportKind.ipc,
                options: debugOptions,
            },
        };
    }

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: "file", language: "ocen" }],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
        },
        outputChannel: outputChannel
    };

    client = new LanguageClient(
        "ocenLanguageServer",
        "Ocen language server",
        serverOptions,
        clientOptions
    );

    client.start();

    const disposableClient = new DisposableLanguageClient(client);
    context.subscriptions.push(disposableClient);
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

function documentOnChange() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        editor.edit(editBuilder => {
            const position = new vscode.Position(0, 0);
            editBuilder.insert(position, ' ');
        }).then(success => {
            if (success) {
                editor.document.save();
                editor.edit(editBuilder => {
                    const position = new vscode.Position(0, 0);
                    const range = new vscode.Range(position, position.translate(0, 1));
                    editBuilder.delete(range);
                }).then(success => {
                    if (success) {
                        editor.document.save();
                    }
                });
            }
        });
    }
}
