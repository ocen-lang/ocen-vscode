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

class DisposableLanguageClient implements vscode.Disposable {
    constructor(private client: LanguageClient) {}

    dispose() {
        this.client.stop();
    }
}

export function activate(context: ExtensionContext) {
    // The server is implemented in node
    const serverModule = context.asAbsolutePath(path.join("out", "server", "src", "server.js"));
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions,
        },
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: [{ scheme: "file", language: "ocen" }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
        },
    };

    // Register a command that the user can run from the command window
    const disposable = vscode.commands.registerCommand('extension.rescanDocument', () => {
        // Get the active text editor
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            documentOnChange();
        }
    });


    // Create the language client and start the client.
    client = new LanguageClient(
        "ocenLanguageServer",
        "Ocen language server",
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    client.start();

    // Create a disposable wrapper around the language client
    const disposableClient = new DisposableLanguageClient(client);
    context.subscriptions.push(disposable, disposableClient);
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
