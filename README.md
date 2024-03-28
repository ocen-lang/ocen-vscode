# `Ocen` programming language

This extension provides syntax highlighting and some basic LSP support for [the ocen language](https://github.com/ocen-lang/ocen).

In order to use the LSP features, make sure you have `ocen` installed on your system, and have set the system enviroment variables so that the executable is available on your `PATH`, and the compiler can find all the standard libraries. For more information, [read the compiler setup instructions here](https://github.com/ocen-lang/ocen?tab=readme-ov-file#usage).


If the extension can't find the compiler by default for some reason, you can point to it directly with the `ocenLanguageServer.compiler.executablePath` setting.

---

## Buiding the extension from source

```
$ git clone https://github.com/ocen-lang/ocen-vscode
$ cd ocen-vscode
$ npm -i
$ npx vsce package
```
