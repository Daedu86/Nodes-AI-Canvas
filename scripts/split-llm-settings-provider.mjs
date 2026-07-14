import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";

const sourcePath = "components/context/llm-settings.tsx";
const persistencePath = "components/context/use-llm-settings-persistence.ts";
const actionsPath = "components/context/use-llm-settings-actions.ts";
const optionsPath = "components/context/llm-settings-model-options.ts";
const testPath = "tests/llm-settings-model-options.test.ts";

const source = await readFile(sourcePath, "utf8");
const sourceFile = ts.createSourceFile(
  sourcePath,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const printNode = (node) => printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);

const collectBindingNames = (name, output) => {
  if (ts.isIdentifier(name)) {
    output.add(name.text);
    return;
  }
  name.elements.forEach((element) => {
    if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, output);
  });
};

const getDeclaredNames = (statement) => {
  const names = new Set();
  if (ts.isVariableStatement(statement)) {
    statement.declarationList.declarations.forEach((declaration) =>
      collectBindingNames(declaration.name, names),
    );
  } else if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement)) &&
    statement.name
  ) {
    names.add(statement.name.text);
  }
  return names;
};

const findModuleStatement = (name) => {
  const statement = sourceFile.statements.find((candidate) =>
    getDeclaredNames(candidate).has(name),
  );
  if (!statement) throw new Error(`Module statement ${name} was not found.`);
  return statement;
};

const provider = sourceFile.statements.find(
  (statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "LlmSettingsProvider",
);
const useLlmSettings = sourceFile.statements.find(
  (statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "useLlmSettings",
);
if (!provider?.body || !useLlmSettings) {
  throw new Error("LLM settings provider exports were not found.");
}

const providerStatements = [...provider.body.statements];
const statementIndex = (name) =>
  providerStatements.findIndex((statement) => getDeclaredNames(statement).has(name));
const statementByName = (name) => {
  const index = statementIndex(name);
  if (index < 0) throw new Error(`Provider statement ${name} was not found.`);
  return providerStatements[index];
};

const persistImmediatelyIndex = statementIndex("persistSettingsImmediately");
if (persistImmediatelyIndex < 0) {
  throw new Error("Persistence setup boundary was not found.");
}

const persistenceSetup = providerStatements.slice(0, persistImmediatelyIndex + 1);
const saveSettingsNowStatement = statementByName("saveSettingsNow");
const hasUnsavedChangesStatement = statementByName("hasUnsavedChanges");
const availableOptionsStatement = statementByName("availableModelOptions");
const supportedConfigStatement = statementByName("getSupportedModelConfig");
const valueStatement = statementByName("value");
const providerReturn = providerStatements.findLast(ts.isReturnStatement);
if (!providerReturn) throw new Error("Provider return statement was not found.");

const actionNames = [
  "setProviderApiKey",
  "clearProviderApiKey",
  "addOpenRouterApiKey",
  "removeOpenRouterApiKey",
  "setActiveOpenRouterApiKey",
  "addOllamaApiKey",
  "removeOllamaApiKey",
  "setActiveOllamaApiKey",
  "setProviderEnabled",
  "addOpenRouterCustomModel",
  "deleteOpenRouterBuiltinModel",
  "restoreOpenRouterBuiltinModel",
  "removeOpenRouterCustomModel",
  "setProviderModels",
  "setProviderValue",
  "toggleOpenRouterModel",
];
const actionStatements = actionNames.map(statementByName);

const collectIdentifiers = (nodes, extra = []) => {
  const identifiers = new Set(extra);
  const visit = (current) => {
    if (ts.isIdentifier(current)) identifiers.add(current.text);
    ts.forEachChild(current, visit);
  };
  nodes.forEach(visit);
  return identifiers;
};

const renderImport = (declaration, usedNames) => {
  const clause = declaration.importClause;
  const moduleText = declaration.moduleSpecifier.getText(sourceFile);
  if (!clause) return printNode(declaration);

  const defaultName = clause.name && usedNames.has(clause.name.text) ? clause.name.text : null;
  let bindings = null;

  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
    if (usedNames.has(clause.namedBindings.name.text)) {
      bindings = `* as ${clause.namedBindings.name.text}`;
    }
  } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    const elements = clause.namedBindings.elements
      .filter((element) => usedNames.has(element.name.text))
      .map((element) => {
        const imported = element.propertyName
          ? `${element.propertyName.text} as ${element.name.text}`
          : element.name.text;
        return element.isTypeOnly && !clause.isTypeOnly ? `type ${imported}` : imported;
      });
    if (elements.length > 0) bindings = `{ ${elements.join(", ")} }`;
  }

  if (!defaultName && !bindings) return null;
  return `import ${clause.isTypeOnly ? "type " : ""}${[defaultName, bindings]
    .filter(Boolean)
    .join(", ")} from ${moduleText};`;
};

const originalImports = sourceFile.statements.filter(ts.isImportDeclaration);
const buildImports = (nodes, extra = []) => {
  const usedNames = collectIdentifiers(nodes, extra);
  return originalImports
    .map((declaration) => renderImport(declaration, usedNames))
    .filter(Boolean)
    .join("\n");
};

const legacyHelpers = [
  findModuleStatement("LEGACY_STORAGE_KEY_PREFIX"),
  findModuleStatement("SAVE_DEBOUNCE_MS"),
  findModuleStatement("readLegacySettings"),
  findModuleStatement("clearLegacySettings"),
];
const keyIdHelper = findModuleStatement("createProviderApiKeyId");
const modelOptionsHelper = findModuleStatement("buildAvailableModelOptions");
const contextType = findModuleStatement("LlmSettingsContextValue");
const contextValue = findModuleStatement("LlmSettingsContext");

const persistenceNodes = [
  ...legacyHelpers,
  ...persistenceSetup,
  saveSettingsNowStatement,
  hasUnsavedChangesStatement,
];
const persistenceImports = buildImports(persistenceNodes);
const persistenceReturnNames = [
  "settings",
  "setSettings",
  "policy",
  "isReady",
  "isSaving",
  "lastSaveError",
  "persistSettingsImmediately",
  "saveSettingsNow",
  "hasUnsavedChanges",
];
const persistenceSource = `"use client";\n\n${persistenceImports}\n\n${legacyHelpers
  .map(printNode)
  .join("\n\n")}\n\nexport function useLlmSettingsPersistence() {\n${[
  ...persistenceSetup,
  saveSettingsNowStatement,
  hasUnsavedChangesStatement,
]
  .map(printNode)
  .join("\n\n")}\n\n  return {\n    ${persistenceReturnNames.join(",\n    ")},\n  };\n}\n`;

const actionsImports = buildImports([keyIdHelper, ...actionStatements], [
  "React",
  "LlmSettingsState",
]);
const actionsSource = `"use client";\n\n${actionsImports}\n\n${printNode(
  keyIdHelper,
)}\n\ntype UseLlmSettingsActionsOptions = {\n  persistSettingsImmediately: (settings: LlmSettingsState) => void;\n  setSettings: React.Dispatch<React.SetStateAction<LlmSettingsState>>;\n};\n\nexport function useLlmSettingsActions({\n  persistSettingsImmediately,\n  setSettings,\n}: UseLlmSettingsActionsOptions) {\n${actionStatements
  .map(printNode)
  .join("\n\n")}\n\n  return {\n    ${actionNames.join(",\n    ")},\n  };\n}\n`;

const optionsImports = buildImports([modelOptionsHelper]);
const optionsHelperText = printNode(modelOptionsHelper).replace(
  /^const buildAvailableModelOptions/,
  "export const buildAvailableModelOptions",
);
const optionsSource = `${optionsImports}\n\n${optionsHelperText}\n`;

const providerNodes = [
  contextType,
  contextValue,
  availableOptionsStatement,
  supportedConfigStatement,
  valueStatement,
  providerReturn,
  useLlmSettings,
];
const providerImports = buildImports(providerNodes, ["React"]);
const persistenceDestructure = persistenceReturnNames.join(",\n    ");
const actionsDestructure = actionNames.join(",\n    ");
const providerSource = `"use client";\n\n${providerImports}\nimport { buildAvailableModelOptions } from "@/components/context/llm-settings-model-options";\nimport { useLlmSettingsActions } from "@/components/context/use-llm-settings-actions";\nimport { useLlmSettingsPersistence } from "@/components/context/use-llm-settings-persistence";\n\n${printNode(
  contextType,
)}\n\n${printNode(contextValue)}\n\nexport function LlmSettingsProvider({\n  children,\n}: {\n  children: React.ReactNode;\n}) {\n  const {\n    ${persistenceDestructure},\n  } = useLlmSettingsPersistence();\n  const {\n    ${actionsDestructure},\n  } = useLlmSettingsActions({ persistSettingsImmediately, setSettings });\n\n${[
  availableOptionsStatement,
  supportedConfigStatement,
  valueStatement,
  providerReturn,
]
  .map(printNode)
  .join("\n\n")}\n}\n\n${printNode(useLlmSettings)}\n`;

const testSource = `import { describe, expect, it } from "vitest";\nimport { buildAvailableModelOptions } from "@/components/context/llm-settings-model-options";\nimport { cloneDefaultLlmSettingsState } from "@/lib/llm/user-settings";\n\ndescribe("LLM settings model options", () => {\n  it("adds enabled Ollama models to the available catalog", () => {\n    const settings = cloneDefaultLlmSettingsState();\n    settings.providers.ollama.enabled = true;\n    settings.providers.ollama.models = ["llama3.2:latest"];\n\n    expect(buildAvailableModelOptions(settings)).toEqual(\n      expect.arrayContaining([\n        expect.objectContaining({\n          modelId: "llama3.2:latest",\n          provider: "ollama",\n        }),\n      ]),\n    );\n  });\n\n  it("excludes deleted built-in OpenRouter models", () => {\n    const settings = cloneDefaultLlmSettingsState();\n    const deleted = settings.providers.openrouter.enabledModels[0];\n    settings.providers.openrouter.deletedModels = deleted ? [deleted] : [];\n\n    expect(buildAvailableModelOptions(settings).some((option) => option.modelId === deleted)).toBe(\n      false,\n    );\n  });\n});\n`;

await writeFile(persistencePath, persistenceSource);
await writeFile(actionsPath, actionsSource);
await writeFile(optionsPath, optionsSource);
await writeFile(sourcePath, providerSource);
await writeFile(testPath, testSource);
