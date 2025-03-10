# Change Log

## [1.2.4] - 2025-03-02

- Make sure we use the same output channel for both LSP servers
- Upgrade vscode-languageclient to 8.10 to [fix ordering issue](https://github.com/microsoft/vscode-languageserver-node/issues/1184)

## [1.2.3] - 2025-02-26

- Add support for `is` operator
- Add option to toggle to new `ocen lsp-server` implementation instead of node server

## [1.2.1] - 2024-12-01

- Add support for std::vector shorthands

## [1.2.0] - 2024-10-26

- Add formatting for raw string literals
- Improve syntax highlighing consistency for structs/enums

## [1.1.9] - 2024-04-23

- Trigger completion on more characters

## [1.1.8] - 2024-04-19

- Add support for `atomic` attribute

## [1.1.7] - 2024-04-19

- Add label details and documentation for completions.

## [1.1.6] - 2024-04-17

- Add support for "Signature Help". (Breaking change: Update compiler)

## [1.1.5] - 2024-04-17

- Add support for "Rename Symbol". (Breaking change: Update compiler)

## [1.1.4] - 2024-04-14

- Add "hints" and notes to diagnostic messages when available

## [1.1.3] - 2024-04-14

- Add documentation strings if available on hover in markdown
- Add Reference provider to LSP

## [1.1.2] - 2024-04-01

- Syntax highlighting for `in` operator

## [1.1.1] - 2024-04-01

- Syntax highlight the operator overloading attribute
- Add command to re-scan the current document

## [1.1.0] - 2024-03-28

- Add basic LSP support: hover, document symbols, go-to-definition, basic completions and error-reporting
- More snippets

## [1.0.5] - 2024-03-23

- Fix attribute highlighting bugs, add `variadic_format` to known list of attrs

## [1.0.4] - 2024-03-23

- Add support for highlight attributes

## [1.0.3] - 2023-08-14

- Add support for `typedef` keyword

## [1.0.2] - 2023-07-01

- Highlight `struct` correctly when using templates

## [1.0.1] - 2023-07-01

- Add some icons!

## [1.0.0] - 2023-06-30

- Initial release