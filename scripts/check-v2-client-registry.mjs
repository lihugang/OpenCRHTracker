#!/usr/bin/env node

// Static completeness check for the client-safe v2 operation registry.
// It parses only client-safe registry files and never imports server code.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);
const registryDir = path.join(repoRoot, 'shared/api/v2/registry');
const clientDomainDir = path.join(repoRoot, 'utils/api/v2/domain');
const expectedOperationCount = 99;
const pathParamPattern = /:([A-Za-z0-9_]+)/g;

function getPathParamNames(pathTemplate) {
    return [...pathTemplate.matchAll(pathParamPattern)].map(
        (match) => match[1]
    );
}

function unwrapExpression(expression) {
    let current = expression;
    while (
        ts.isParenthesizedExpression(current) ||
        ts.isAsExpression(current) ||
        ts.isTypeAssertionExpression(current) ||
        ts.isNonNullExpression(current) ||
        ts.isSatisfiesExpression(current)
    ) {
        current = current.expression;
    }
    return current;
}

function findContainingScope(node) {
    let current = node.parent;
    while (
        current &&
        !ts.isFunctionLike(current) &&
        !ts.isSourceFile(current)
    ) {
        current = current.parent;
    }
    return current;
}

function findVariableInitializer(source, call, variableName) {
    const scope = findContainingScope(call);
    if (!scope) {
        return null;
    }

    const callStart = call.getStart(source);
    let nearestDeclaration = null;
    function visit(node) {
        if (node !== scope && ts.isFunctionLike(node)) {
            return;
        }
        if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.name.text === variableName &&
            node.initializer &&
            node.getStart(source) < callStart &&
            (nearestDeclaration === null ||
                node.getStart(source) > nearestDeclaration.getStart(source))
        ) {
            nearestDeclaration = node;
        }
        ts.forEachChild(node, visit);
    }
    visit(scope);
    return nearestDeclaration?.initializer ?? null;
}

function resolveObjectLiteral(source, call, expression, seenNames = new Set()) {
    const unwrapped = unwrapExpression(expression);
    if (ts.isObjectLiteralExpression(unwrapped)) {
        return unwrapped;
    }
    if (!ts.isIdentifier(unwrapped) || seenNames.has(unwrapped.text)) {
        return null;
    }

    seenNames.add(unwrapped.text);
    const initializer = findVariableInitializer(source, call, unwrapped.text);
    return initializer
        ? resolveObjectLiteral(source, call, initializer, seenNames)
        : null;
}

function getPropertyName(property, source) {
    const name = property.name;
    if (
        ts.isIdentifier(name) ||
        ts.isStringLiteral(name) ||
        ts.isNumericLiteral(name)
    ) {
        return name.text;
    }
    return name.getText(source);
}

function findObjectProperty(objectLiteral, propertyName, source) {
    return objectLiteral.properties.find(
        (property) =>
            (ts.isPropertyAssignment(property) ||
                ts.isShorthandPropertyAssignment(property)) &&
            getPropertyName(property, source) === propertyName
    );
}

function resolvePropertyObject(source, call, property) {
    if (ts.isPropertyAssignment(property)) {
        return resolveObjectLiteral(source, call, property.initializer);
    }
    if (ts.isShorthandPropertyAssignment(property)) {
        return resolveObjectLiteral(source, call, property.name);
    }
    return null;
}

const entries = [];
for (const fileName of fs.readdirSync(registryDir).sort()) {
    if (!fileName.endsWith('.ts') || fileName === 'index.ts') {
        continue;
    }

    const fileText = fs.readFileSync(path.join(registryDir, fileName), 'utf8');
    const entryPattern =
        /operationName:\s*'([^']+)',\s*method:\s*'([A-Z]+)',\s*pathTemplate:\s*'([^']+)'/g;
    for (const match of fileText.matchAll(entryPattern)) {
        entries.push({
            operationName: match[1],
            method: match[2],
            pathTemplate: match[3]
        });
    }
}

const names = new Set(entries.map((entry) => entry.operationName));
const methodPathPairs = new Set(
    entries.map((entry) => `${entry.method} ${entry.pathTemplate}`)
);

if (entries.length !== expectedOperationCount) {
    throw new Error(
        `expected ${expectedOperationCount} client registry entries, got ${entries.length}`
    );
}
if (names.size !== expectedOperationCount) {
    throw new Error('client registry operation names are not unique');
}
if (methodPathPairs.size !== expectedOperationCount) {
    throw new Error('client registry method/path pairs are not unique');
}

const dynamicEntries = new Map(
    entries
        .map((entry) => ({
            ...entry,
            pathParamNames: [...new Set(getPathParamNames(entry.pathTemplate))]
        }))
        .filter((entry) => entry.pathParamNames.length > 0)
        .map((entry) => [entry.operationName, entry])
);
const pathParamIssues = [];
let checkedDynamicCalls = 0;

for (const fileName of fs.readdirSync(clientDomainDir).sort()) {
    if (!fileName.endsWith('.ts')) {
        continue;
    }

    const filePath = path.join(clientDomainDir, fileName);
    const source = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );

    function visit(node) {
        if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            (node.expression.text === 'requestV2' ||
                node.expression.text === 'requestV2Raw')
        ) {
            const operationArgument = node.arguments[0];
            const inputArgument = node.arguments[1];
            const entry =
                operationArgument && ts.isIdentifier(operationArgument)
                    ? dynamicEntries.get(operationArgument.text)
                    : undefined;
            if (entry) {
                checkedDynamicCalls += 1;
                const position = source.getLineAndCharacterOfPosition(
                    node.getStart(source)
                );
                const location = `${path.relative(repoRoot, filePath)}:${position.line + 1}`;
                const inputObject = inputArgument
                    ? resolveObjectLiteral(source, node, inputArgument)
                    : null;
                if (!inputObject) {
                    pathParamIssues.push(
                        `${location} ${entry.operationName}: request input cannot be statically resolved`
                    );
                } else {
                    const paramsProperty = findObjectProperty(
                        inputObject,
                        'params',
                        source
                    );
                    const paramsObject = paramsProperty
                        ? resolvePropertyObject(source, node, paramsProperty)
                        : null;
                    if (paramsProperty && !paramsObject) {
                        pathParamIssues.push(
                            `${location} ${entry.operationName}: params cannot be statically resolved`
                        );
                    } else {
                        const providedParamNames = new Set(
                            (paramsObject?.properties ?? [])
                                .filter(
                                    (property) =>
                                        ts.isPropertyAssignment(property) ||
                                        ts.isShorthandPropertyAssignment(
                                            property
                                        )
                                )
                                .map((property) =>
                                    getPropertyName(property, source)
                                )
                        );
                        const missingParamNames = entry.pathParamNames.filter(
                            (paramName) => !providedParamNames.has(paramName)
                        );
                        if (missingParamNames.length > 0) {
                            pathParamIssues.push(
                                `${location} ${entry.operationName}: missing params ${missingParamNames.join(', ')}`
                            );
                        }
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
}

if (pathParamIssues.length > 0) {
    throw new Error(
        `client v2 path parameter check failed:\n${pathParamIssues
            .map((issue) => `- ${issue}`)
            .join('\n')}`
    );
}

console.log(
    `client registry OK (${entries.length} operations, ${checkedDynamicCalls} dynamic client calls)`
);
