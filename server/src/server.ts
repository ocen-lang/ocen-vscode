/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    HandlerResult,
    Definition,
    DocumentSymbol,
    SymbolKind,
    HoverParams,
    TypeDefinitionParams,
    InsertTextFormat,
    Hover,
    Location,
    MarkupKind
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

interface OcenTextDocument extends TextDocument {
    ocenInlayHints?: InlayHint[];
}

interface OcenSymbol {
    name: string;
    detail?: string;
    kind: "namespace" | "function" | "variable" | "method" | "struct" | "class" | "enum" | "enum-member";
    range: { start_line: number; start_col: number; end_line: number; end_col: number };
    selection_range: { start_line: number; start_col: number; end_line: number; end_col: number };
    children: OcenSymbol[];
}

import {
    InlayHint,
    InlayHintParams,
} from "vscode-languageserver-protocol";

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

import fs = require("fs");
import tmp = require("tmp");

import util = require("node:util");
import { fileURLToPath } from "node:url";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const exec = util.promisify(require("node:child_process").exec);

const tmpFile = tmp.fileSync();

function getClickableFilePosition(textDocumentPositionParams: TextDocumentPositionParams) {
    return `${textDocumentPositionParams.textDocument.uri.replace("file://", "")}:${
        textDocumentPositionParams.position.line
    }:${textDocumentPositionParams.position.character}`;
}

// FIXME: Type `Range` as return here has some weird errors...
function getRange(obj: any): any {
    return {
        start: {
            line: obj.start_line - 1,
            character: obj.start_col - 1,
        },
        end: {
            line: obj.end_line - 1,
            character: obj.end_col - 1,
        },
    };
}

async function durationLogWrapper<T>(label: string, fn: () => Promise<T>): Promise<T> {
    console.log("Triggered " + label + ": ...");
    console.time(label);
    const result = await fn();

    // This purposefully has the same prefix length as the "Triggered " log above,
    // also does not add a newline at the end.
    process.stdout.write("Finished  ");
    console.timeEnd(label);
    return new Promise<T>(resolve => resolve(result));
}

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            // Tell the client that this server doesn't support code completion. (yet)
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: [".", ":"],
            },
            referencesProvider: true,
            // inlayHintProvider: {
            //     resolveProvider: false,
            // },
            definitionProvider: true,
            typeDefinitionProvider: true,
            documentSymbolProvider: true,
            hoverProvider: true,
            // documentFormattingProvider: true,
            // documentRangeFormattingProvider: true,
        },
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true,
            },
        };
    }

    connection.console.log('Ocen language server initialized');
    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            // connection.console.log('Workspace folder change event received.');
        });
    }
});

async function goToDefinition(
    document: TextDocument,
    ocenOutput: string
): Promise<HandlerResult<Definition, void> | undefined> {
    return await durationLogWrapper(`goToDefinition`, async () => {
        const lines = ocenOutput.split("\n").filter(l => l.length > 0);
        for (const line of lines) {
            const obj = JSON.parse(line);
            // connection.console.log("going to type definition");
            // connection.console.log(obj);
            if (obj.file === "" || obj.file == "<default>") return;

            const uri = obj.file
                ? "file://" + (await fs.promises.realpath(obj.file))
                : document.uri;

            return {
                uri: uri,
                range: getRange(obj),
            };
        }
    });
}

async function getReferences(
    document: TextDocument,
    ocenOutput: string
): Promise<HandlerResult<Location[], void> | undefined> {
    return await durationLogWrapper(`getReferences`, async () => {
        const lines = ocenOutput.split("\n").filter(l => l.length > 0);
        for (const line of lines) {
            const obj = JSON.parse(line);

            const response = [];
            for (const reference of obj) {
                const uri = reference.file
                    ? "file://" + (await fs.promises.realpath(reference.file))
                    : document.uri;
                reference.uri = uri;
                response.push({
                    uri: uri,
                    range: getRange(reference),
                });
            }
            return response;
        }
    });
}

connection.onDocumentSymbol(async (request): Promise<DocumentSymbol[]> => {
    return await durationLogWrapper(`onDocumentSymbol`, async () => {
        const settings = await getDocumentSettings(request.textDocument.uri);
        const document = documents.get(request.textDocument.uri);
        if (!document) return [];

        const text = document.getText();
        const stdout = await runCompiler(
            text,
            "--doc-symbols",
            settings,
            fileURLToPath(document.uri)
        );
        const toSymbolDefinition = (symbol: OcenSymbol): DocumentSymbol => {
            const kind_map = {
                namespace: SymbolKind.Namespace,
                function: SymbolKind.Function,
                method: SymbolKind.Method,
                struct: SymbolKind.Struct,
                class: SymbolKind.Class,
                enum: SymbolKind.Enum,
                variable: SymbolKind.Variable,
                "enum-member": SymbolKind.EnumMember,
            };
            return {
                name: symbol.name,
                detail: symbol.detail,
                kind: kind_map[symbol.kind],
                range: getRange(symbol.range),
                selectionRange: getRange(symbol.selection_range),
                children: symbol.children.map(child => toSymbolDefinition(child)),
            };
        };
        try {
            const obj = JSON.parse(stdout) as OcenSymbol[];
            const result = obj.map(symbol =>
                toSymbolDefinition(symbol)
            );
            return result;
        } catch (e) {
            return [];
        }
    });
});

connection.onDefinition(async request => {
    return await durationLogWrapper(
        `onDefinition ${getClickableFilePosition(request)}`,
        async () => {
            const document = documents.get(request.textDocument.uri);
            if (!document) return;
            const settings = await getDocumentSettings(request.textDocument.uri);
            const text = document.getText();
            const stdout = await runCompiler(
                text,
                `-d ${request.position.line + 1} ${request.position.character + 1}`,
                settings,
                fileURLToPath(document.uri)
            );
            return goToDefinition(document, stdout);
        }
    );
});

connection.onTypeDefinition(async (request: TypeDefinitionParams) => {
    return await durationLogWrapper(
        `onTypeDefinition ${getClickableFilePosition(request)}`,
        async () => {
            const document = documents.get(request.textDocument.uri);
            if (!document) return;
            const settings = await getDocumentSettings(request.textDocument.uri);
            const text = document.getText();
            const stdout = await runCompiler(
                text,
                `-t ${request.position.line + 1} ${request.position.character + 1}`,
                settings,
                fileURLToPath(document.uri)
            );
            return goToDefinition(document, stdout);
        }
    );
});

connection.onReferences(async (request: TextDocumentPositionParams) => {
    return await durationLogWrapper(
        `onTypeDefinition ${getClickableFilePosition(request)}`,
        async () => {
            const document = documents.get(request.textDocument.uri);
            if (!document) return;
            const settings = await getDocumentSettings(request.textDocument.uri);
            const text = document.getText();
            const stdout = await runCompiler(
                text,
                `-r ${request.position.line + 1} ${request.position.character + 1}`,
                settings,
                fileURLToPath(document.uri)
            );
            return getReferences(document, stdout);
        }
    );
});


connection.onHover(async (request: HoverParams) => {
    return await durationLogWrapper(`onHover ${getClickableFilePosition(request)}`, async () => {
        const document = documents.get(request.textDocument.uri);
        const settings = await getDocumentSettings(request.textDocument.uri);

        const text = document?.getText();
        if (!(typeof text == "string")) return null;
        const stdout = await runCompiler(
            text,
            `-h ${request.position.line+1} ${request.position.character+1}`,
            settings,
            document ? fileURLToPath(document.uri) : undefined
        );

        const lines = stdout.split("\n").filter(l => l.length > 0);
        for (const line of lines) {
            const obj = JSON.parse(line);

            if (obj.hover == "") {
                return null;
            }

            if (obj.hover.includes("\n")) {
                const first = obj.hover.split("\n")[0];
                const markdown = obj.hover.split("\n").slice(1).join("\n");
                const hoverString = `\`\`\`ocen\n${first}\n\`\`\`\n${markdown}`;
                const contents = {
                    value: hoverString,
                    kind: MarkupKind.Markdown
                };
                const hover: Hover = { contents };
                return hover;

            } else {
                const contents = {
                    value: obj.hover,
                    language: "ocen"
                };
                const hover: Hover = { contents };
                return hover;
            }
        }
    });
});

// The example settings
interface ExampleSettings {
    maxNumberOfProblems: number;
    maxCompilerInvocationTime: number;
    compiler: {
        executablePath: string;
    };
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = {
    maxNumberOfProblems: 1000,
    maxCompilerInvocationTime: 5000,
    compiler: { executablePath: "ocen" },
};

let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <ExampleSettings>(change.settings.ocenLanguageServer || defaultSettings);
    }

    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: "ocenLanguageServer",
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function throttle(fn: (...args: any) => void, delay: number) {
    let shouldWait = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let waitingArgs: any | null;
    const timeoutFunc = () => {
        if (waitingArgs == null) {
            shouldWait = false;
        } else {
            fn(...waitingArgs);
            waitingArgs = null;
            setTimeout(timeoutFunc, delay);
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (...args: any) => {
        if (shouldWait) {
            waitingArgs = args;
            return;
        }

        fn(...args);
        shouldWait = true;

        setTimeout(timeoutFunc, delay);
    };
}

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(
    (() => {
        const throttledValidateTextDocument = throttle(validateTextDocument, 500);
        return change => {
            throttledValidateTextDocument(change.document);
        };
    })()
);

async function runCompiler(
    text: string,
    flags: string,
    settings: ExampleSettings,
    path?: string
): Promise<string> {
    try {
        fs.writeFileSync(tmpFile.name, text);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        // connection.console.log(e);
    }

    const show_path = path ? `--show-path ${path}` : ``;
    const command = `${
        settings.compiler.executablePath
    } lsp ${show_path} ${flags} ${tmpFile.name}`;

    console.info(`Running command: ${command}`);

    let stdout = "";
    try {
        const output = await exec(
            command,
            {
                timeout: settings.maxCompilerInvocationTime,
            }
        );
        stdout = output.stdout;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        stdout = e.stdout;
        console.error(e);
    }

    return stdout;
}

async function validateTextDocument(textDocument: OcenTextDocument): Promise<void> {
    return await durationLogWrapper(`validateTextDocument ${textDocument.uri}`, async () => {
        if (!hasDiagnosticRelatedInformationCapability) {
            console.error("Trying to validate a document with no diagnostic capability");
            return;
        }

        // // In this simple example we get the settings for every validate run.
        const settings = await getDocumentSettings(textDocument.uri);

        // The validator creates diagnostics for all uppercase words length 2 and more
        const text = textDocument.getText();

        const stdout = await runCompiler(
            text,
            "--validate",
            settings,
            fileURLToPath(textDocument.uri)
        );

        textDocument.ocenInlayHints = [];

        const diagnostics: Diagnostic[] = [];

        const lines = stdout.split("\n").filter(l => l.length > 0);
        for (const line of lines) {
            // connection.console.log(line);
            try {
                const obj = JSON.parse(line);

                // HACK: Ignore everything that isn't about file ID #1 here, since that's always the current editing buffer.
                // if (obj.file_id != 1) { continue; }
                let severity: DiagnosticSeverity = DiagnosticSeverity.Error;

                switch (obj.severity) {
                    case "Information":
                        severity = DiagnosticSeverity.Information;
                        break;
                    case "Hint":
                        severity = DiagnosticSeverity.Hint;
                        break;
                    case "Warning":
                        severity = DiagnosticSeverity.Warning;
                        break;
                    case "Error":
                        severity = DiagnosticSeverity.Error;
                        break;
                }

                const diagnostic: Diagnostic = {
                    severity,
                    range: getRange(obj.span),
                    message: obj.message,
                    source: textDocument.uri,
                };

                if (obj.extra_info) {
                    diagnostic.relatedInformation = [{
                        location: {
                            uri: obj.extra_info.file
                                ? "file://" + (await fs.promises.realpath(obj.extra_info.file))
                                : textDocument.uri,
                            range: getRange(obj.extra_info.span),
                        },
                        message: obj.extra_info.message,
                    }];
                }

                // connection.console.log(diagnostic.message);

                diagnostics.push(diagnostic);

            } catch (e) {
                console.error(e);
            }
        }

        // Send the computed diagnostics to VSCode.
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log("We received an file change event");
});

// This handler provides the initial list of the completion items.
connection.onCompletion(async (request: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    return await durationLogWrapper(
        `onCompletion ${getClickableFilePosition(request)}`,
        async () => {
            // The pass parameter contains the position of the text document in
            // which code complete got requested. For the example we ignore this
            // info and always provide the same completion items.

            const document = documents.get(request.textDocument.uri);
            const settings = await getDocumentSettings(request.textDocument.uri);

            const text = document?.getText();

            if (typeof text == "string") {
                const stdout = await runCompiler(
                    text,
                    `-c ${request.position.line + 1} ${request.position.character + 1}`,
                    settings,
                    document ? fileURLToPath(document.uri) : undefined
                );

                const lines = stdout.split("\n").filter(l => l.length > 0);
                for (const line of lines) {
                    try {
                        const obj = JSON.parse(line);
                        const output = [];
                        let index = 1;
                        for (const completion of obj.completions) {
                            output.push({
                                label: completion.label,
                                insertText: completion.insertText,
                                detail: completion.detail,
                                insertTextFormat: InsertTextFormat.Snippet,
                                kind: completion.kind == "function"
                                    ? CompletionItemKind.Function
                                    : CompletionItemKind.Field,
                                data: index,
                            });
                            index++;
                        }
                        return output;
                    } catch (e) {
                        console.error(e);
                    }
                }
            }

            return [];
        }
    );
});

// // This handler resolves additional information for the item selected in
// // the completion list.
// connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
//     if (item.data === 1) {
//         item.detail = "TypeScript details";
//         item.documentation = "TypeScript documentation";
//     } else if (item.data === 2) {
//         item.detail = "JavaScript details";
//         item.documentation = "JavaScript documentation";
//     }
//     return item;
// });

connection.languages.inlayHint.on((params: InlayHintParams) => {
    const document = documents.get(params.textDocument.uri) as OcenTextDocument;
    return document.ocenInlayHints;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
