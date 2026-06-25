#!/usr/bin/env node

// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '..');

const defaultOutputDir = path.join(uiRoot, 'src', 'i18n', 'candidates');

const defaultTargets = [
    path.join(uiRoot, 'src'),
    path.join(uiRoot, 'plugins'),
    path.join(repoRoot, 'cvat-canvas', 'src'),
    path.join(repoRoot, 'cvat-canvas3d', 'src'),
];

const skippedDirectoryNames = new Set([
    '.git',
    'coverage',
    'dist',
    'node_modules',
]);

const visibleJsxAttributes = new Set([
    'alt',
    'aria-label',
    'cancelText',
    'emptyText',
    'label',
    'okText',
    'overlay',
    'placeholder',
    'title',
    'tooltip',
]);

const visibleObjectKeys = new Set([
    'cancelText',
    'content',
    'description',
    'emptyText',
    'label',
    'message',
    'okText',
    'placeholder',
    'title',
    'tooltip',
]);

const visibleCallOwners = new Set([
    'message',
    'Modal',
    'notification',
]);

const visibleCallMethods = new Set([
    'confirm',
    'error',
    'info',
    'loading',
    'open',
    'success',
    'warn',
    'warning',
]);

function parseArgs(argv) {
    const options = {
        outputDir: defaultOutputDir,
        formats: new Set(['json', 'md']),
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === '--out') {
            index += 1;
            if (!argv[index]) {
                throw new Error('--out requires a directory path');
            }
            options.outputDir = path.resolve(process.cwd(), argv[index]);
        } else if (arg === '--json') {
            options.formats = new Set(['json']);
        } else if (arg === '--md') {
            options.formats = new Set(['md']);
        } else if (arg === '--both') {
            options.formats = new Set(['json', 'md']);
        } else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function printHelp() {
    console.log(`Usage: node scripts/collect-i18n-candidates.cjs [options]

Options:
  --out <dir>  Output directory. Defaults to cvat-ui/src/i18n/candidates
  --json       Write only ui-text-candidates.json
  --md         Write only ui-text-candidates.md
  --both       Write both JSON and Markdown outputs. This is the default.
  -h, --help   Show this help message
`);
}

function pathExists(inputPath) {
    return fs.existsSync(inputPath);
}

function toRepoRelative(inputPath) {
    return path.relative(repoRoot, inputPath).replace(/\\/g, '/');
}

function collectFiles(directory) {
    if (!pathExists(directory)) {
        return [];
    }

    const files = [];
    const pending = [directory];

    while (pending.length) {
        const current = pending.pop();
        const entries = fs.readdirSync(current, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);

            if (entry.isDirectory()) {
                if (skippedDirectoryNames.has(entry.name)) {
                    continue;
                }

                if (toRepoRelative(fullPath) === 'cvat-ui/src/i18n') {
                    continue;
                }

                pending.push(fullPath);
            } else if (entry.isFile() && isSupportedSourceFile(fullPath)) {
                files.push(fullPath);
            }
        }
    }

    return files.sort((fileA, fileB) => toRepoRelative(fileA).localeCompare(toRepoRelative(fileB)));
}

function isSupportedSourceFile(filePath) {
    if (filePath.endsWith('.d.ts')) {
        return false;
    }

    return filePath.endsWith('.ts') || filePath.endsWith('.tsx');
}

function normalizeText(text) {
    return text
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isLikelyUserVisibleEnglish(text) {
    if (!text || text.length < 2) {
        return false;
    }

    if (!/[A-Za-z]{2,}/.test(text)) {
        return false;
    }

    if (/^&[a-z]+;$/i.test(text)) {
        return false;
    }

    if (/^(https?:|data:|mailto:|#|\/)/i.test(text)) {
        return false;
    }

    if (/^[A-Z0-9_]+$/.test(text) && text.length > 3) {
        return false;
    }

    if (/^[a-z0-9_.:-]+$/.test(text) && /[_.:/-]/.test(text)) {
        return false;
    }

    if (/^[\w.-]+\.(png|jpg|jpeg|gif|svg|json|xml|zip|js|ts|tsx|css|scss|onnx|wasm)$/i.test(text)) {
        return false;
    }

    if (/^[a-z]+\/[a-z0-9.+-]+$/i.test(text)) {
        return false;
    }

    return true;
}

function expressionToText(node, sourceFile) {
    if (!node) {
        return null;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return node.text;
    }

    if (ts.isJsxText(node)) {
        return node.getText(sourceFile);
    }

    if (ts.isJsxExpression(node)) {
        return expressionToText(node.expression, sourceFile);
    }

    if (ts.isTemplateExpression(node)) {
        let text = node.head.text;
        for (const span of node.templateSpans) {
            text += '${...}';
            text += span.literal.text;
        }
        return text;
    }

    if (ts.isParenthesizedExpression(node)) {
        return expressionToText(node.expression, sourceFile);
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = expressionToText(node.left, sourceFile);
        const right = expressionToText(node.right, sourceFile);

        if (left !== null && right !== null) {
            return `${left}${right}`;
        }
    }

    return null;
}

function propertyNameToText(name) {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }

    return null;
}

function callExpressionToText(expression) {
    if (ts.isPropertyAccessExpression(expression)) {
        const owner = expression.expression.getText();
        const method = expression.name.text;

        if (visibleCallOwners.has(owner) && visibleCallMethods.has(method)) {
            return `${owner}.${method}`;
        }
    }

    return null;
}

function isDocumentTitleAssignment(node) {
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
        return false;
    }

    if (!ts.isPropertyAccessExpression(node.left)) {
        return false;
    }

    return node.left.getText() === 'document.title' || node.left.getText() === 'window.document.title';
}

function getLineAndColumn(sourceFile, node) {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

    return {
        line: position.line + 1,
        column: position.character + 1,
    };
}

function addCandidate(candidates, sourceFile, filePath, node, kind, source, rawText) {
    const text = normalizeText(rawText || '');

    if (!isLikelyUserVisibleEnglish(text)) {
        return;
    }

    const { line, column } = getLineAndColumn(sourceFile, node);

    candidates.push({
        file: toRepoRelative(filePath),
        line,
        column,
        kind,
        source,
        text,
    });
}

function scanSourceFile(filePath) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
    const candidates = [];

    function visit(node) {
        if (ts.isJsxText(node)) {
            addCandidate(candidates, sourceFile, filePath, node, 'jsx-text', 'children', node.getText(sourceFile));
        }

        if (ts.isJsxAttribute(node)) {
            const attributeName = node.name.getText(sourceFile);

            if (visibleJsxAttributes.has(attributeName) && node.initializer) {
                const text = expressionToText(node.initializer, sourceFile);
                addCandidate(candidates, sourceFile, filePath, node, 'jsx-attribute', attributeName, text);
            }
        }

        if (ts.isPropertyAssignment(node)) {
            const propertyName = propertyNameToText(node.name);

            if (propertyName && visibleObjectKeys.has(propertyName)) {
                const text = expressionToText(node.initializer, sourceFile);
                addCandidate(candidates, sourceFile, filePath, node, 'object-property', propertyName, text);
            }
        }

        if (ts.isCallExpression(node)) {
            const callSource = callExpressionToText(node.expression);

            if (callSource) {
                node.arguments.forEach((argument, argumentIndex) => {
                    if (ts.isObjectLiteralExpression(argument)) {
                        return;
                    }

                    const text = expressionToText(argument, sourceFile);
                    addCandidate(
                        candidates,
                        sourceFile,
                        filePath,
                        argument,
                        'call-argument',
                        `${callSource} argument ${argumentIndex}`,
                        text,
                    );
                });
            }
        }

        if (isDocumentTitleAssignment(node)) {
            const text = expressionToText(node.right, sourceFile);
            addCandidate(candidates, sourceFile, filePath, node, 'assignment', 'document.title', text);
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return candidates;
}

function areaForFile(filePath) {
    if (filePath.startsWith('cvat-ui/src/audio/')) {
        return 'cvat-ui/src/audio';
    }

    if (filePath.startsWith('cvat-ui/src/')) {
        return 'cvat-ui/src';
    }

    if (filePath.startsWith('cvat-ui/plugins/')) {
        return 'cvat-ui/plugins';
    }

    if (filePath.startsWith('cvat-canvas3d/')) {
        return 'cvat-canvas3d';
    }

    if (filePath.startsWith('cvat-canvas/')) {
        return 'cvat-canvas';
    }

    return 'other';
}

function summarize(candidates) {
    const uniqueTexts = new Set(candidates.map((candidate) => candidate.text));
    const uniqueFiles = new Set(candidates.map((candidate) => candidate.file));
    const byArea = new Map();

    for (const candidate of candidates) {
        const area = areaForFile(candidate.file);
        const current = byArea.get(area) || {
            occurrences: 0,
            files: new Set(),
        };

        current.occurrences += 1;
        current.files.add(candidate.file);
        byArea.set(area, current);
    }

    return {
        occurrences: candidates.length,
        uniqueTexts: uniqueTexts.size,
        files: uniqueFiles.size,
        byArea: Array.from(byArea.entries())
            .map(([area, value]) => ({
                area,
                occurrences: value.occurrences,
                files: value.files.size,
            }))
            .sort((areaA, areaB) => areaB.occurrences - areaA.occurrences),
    };
}

function escapeMarkdownTableCell(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, ' ');
}

function truncateForMarkdown(value, maxLength = 220) {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 3)}...`;
}

function writeMarkdown(outputPath, candidates, summary, scannedRoots) {
    const lines = [
        '# UI Text Candidates',
        '',
        'Generated by `node scripts/collect-i18n-candidates.cjs`.',
        '',
        '## Scope',
        '',
        ...scannedRoots.map((root) => `- \`${toRepoRelative(root)}\``),
        '',
        '## Summary',
        '',
        `- Occurrences: ${summary.occurrences}`,
        `- Unique texts: ${summary.uniqueTexts}`,
        `- Files: ${summary.files}`,
        '',
        '## By Area',
        '',
        '| Area | Occurrences | Files |',
        '| --- | ---: | ---: |',
        ...summary.byArea.map((entry) => (
            `| ${escapeMarkdownTableCell(entry.area)} | ${entry.occurrences} | ${entry.files} |`
        )),
        '',
        '## Candidates',
        '',
        'The Markdown table truncates long text for review. Use `ui-text-candidates.json` for exact full strings.',
        '',
        '| File | Line | Kind | Source | Text |',
        '| --- | ---: | --- | --- | --- |',
        ...candidates.map((candidate) => (
            `| \`${escapeMarkdownTableCell(candidate.file)}\` | ${candidate.line} | ` +
            `${escapeMarkdownTableCell(candidate.kind)} | ${escapeMarkdownTableCell(candidate.source)} | ` +
            `${escapeMarkdownTableCell(truncateForMarkdown(candidate.text))} |`
        )),
        '',
    ];

    fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
}

function writeJson(outputPath, candidates, summary, scannedRoots) {
    const payload = {
        generatedBy: 'node scripts/collect-i18n-candidates.cjs',
        scannedRoots: scannedRoots.map(toRepoRelative),
        summary,
        candidates,
    };

    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const files = defaultTargets.flatMap(collectFiles);
    const candidates = files.flatMap(scanSourceFile)
        .sort((candidateA, candidateB) => (
            candidateA.file.localeCompare(candidateB.file) ||
            candidateA.line - candidateB.line ||
            candidateA.column - candidateB.column ||
            candidateA.text.localeCompare(candidateB.text)
        ));
    const summary = summarize(candidates);

    fs.mkdirSync(options.outputDir, { recursive: true });

    if (options.formats.has('json')) {
        writeJson(path.join(options.outputDir, 'ui-text-candidates.json'), candidates, summary, defaultTargets);
    }

    if (options.formats.has('md')) {
        writeMarkdown(path.join(options.outputDir, 'ui-text-candidates.md'), candidates, summary, defaultTargets);
    }

    console.log(`Scanned ${files.length} files.`);
    console.log(`Found ${summary.occurrences} candidate occurrences in ${summary.files} files.`);
    console.log(`Unique candidate texts: ${summary.uniqueTexts}.`);
    console.log(`Output directory: ${options.outputDir}`);
}

main();
