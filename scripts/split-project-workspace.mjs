import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";

const sourcePath = "components/workspace/project-workspace.tsx";
const controllerPath = "components/workspace/use-project-workspace-controller.ts";
const viewPath = "components/workspace/project-workspace-view.tsx";

const source = await readFile(sourcePath, "utf8");
const sourceFile = ts.createSourceFile(
  sourcePath,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

const projectWorkspace = sourceFile.statements.find(
  (statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "ProjectWorkspace",
);

if (!projectWorkspace?.body) {
  throw new Error("ProjectWorkspace function was not found.");
}

const statements = [...projectWorkspace.body.statements];
const guardIndex = statements.findIndex(
  (statement) =>
    ts.isIfStatement(statement) &&
    statement.expression.getText(sourceFile).includes("!activeProject") &&
    statement.expression.getText(sourceFile).includes("!projectView"),
);
const returnIndex = statements.findLastIndex((statement) => ts.isReturnStatement(statement));

if (guardIndex < 0 || returnIndex < 0 || returnIndex <= guardIndex) {
  throw new Error("ProjectWorkspace guard or render return could not be identified.");
}

const logicStatements = statements.slice(0, guardIndex);
const guardStatement = statements[guardIndex];
const renderStatement = statements[returnIndex];

if (!ts.isReturnStatement(renderStatement) || !renderStatement.expression) {
  throw new Error("ProjectWorkspace render expression was not found.");
}

const collectBindingNames = (name, output) => {
  if (ts.isIdentifier(name)) {
    output.add(name.text);
    return;
  }
  name.elements.forEach((element) => {
    if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, output);
  });
};

const declaredNames = new Set();
logicStatements.forEach((statement) => {
  if (ts.isVariableStatement(statement)) {
    statement.declarationList.declarations.forEach((declaration) =>
      collectBindingNames(declaration.name, declaredNames),
    );
  } else if (ts.isFunctionDeclaration(statement) && statement.name) {
    declaredNames.add(statement.name.text);
  }
});

const collectIdentifiers = (node) => {
  const identifiers = new Set();
  const visit = (current) => {
    if (ts.isIdentifier(current)) identifiers.add(current.text);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return identifiers;
};

const renderIdentifiers = collectIdentifiers(renderStatement.expression);
const returnNames = [...declaredNames].filter((name) => renderIdentifiers.has(name));

if (returnNames.length < 20) {
  throw new Error(`Unexpectedly small ProjectWorkspace controller surface: ${returnNames.length}`);
}

const renderImport = (declaration, usedNames) => {
  const clause = declaration.importClause;
  const moduleText = declaration.moduleSpecifier.getText(sourceFile);
  if (!clause) return declaration.getText(sourceFile);

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
  const pieces = [defaultName, bindings].filter(Boolean).join(", ");
  return `import ${clause.isTypeOnly ? "type " : ""}${pieces} from ${moduleText};`;
};

const originalImports = sourceFile.statements.filter(ts.isImportDeclaration);
const logicContainer = ts.factory.createBlock([...logicStatements, guardStatement], true);
const logicIdentifiers = collectIdentifiers(logicContainer);
const viewIdentifiers = collectIdentifiers(renderStatement.expression);

const controllerImports = originalImports
  .map((declaration) => renderImport(declaration, logicIdentifiers))
  .filter(Boolean)
  .join("\n");
const viewImports = originalImports
  .map((declaration) => renderImport(declaration, viewIdentifiers))
  .filter(Boolean)
  .join("\n");

const logicText = logicStatements.map((statement) => statement.getText(sourceFile)).join("\n\n");
const guardText = guardStatement.getText(sourceFile);
const renderText = renderStatement.expression.getText(sourceFile);
const returnObject = returnNames.join(",\n    ");
const destructuredViewNames = returnNames
  .filter((name) => renderIdentifiers.has(name))
  .join(",\n    ");

const controllerSource = `"use client";\n\n${controllerImports}\n\nconst encoder = new TextEncoder();\n\nexport function useProjectWorkspaceController() {\n${logicText}\n\n${guardText}\n\n  return {\n    ${returnObject},\n  };\n}\n`;

const viewSource = `"use client";\n\n${viewImports}\nimport type { useProjectWorkspaceController } from "@/components/workspace/use-project-workspace-controller";\n\nconst encoder = new TextEncoder();\n\ntype ProjectWorkspaceViewProps = NonNullable<\n  ReturnType<typeof useProjectWorkspaceController>\n>;\n\nexport function ProjectWorkspaceView(props: ProjectWorkspaceViewProps) {\n  const {\n    ${destructuredViewNames},\n  } = props;\n\n  return ${renderText};\n}\n`;

const wrapperSource = `"use client";\n\nimport { ProjectWorkspaceView } from "@/components/workspace/project-workspace-view";\nimport { useProjectWorkspaceController } from "@/components/workspace/use-project-workspace-controller";\n\nexport function ProjectWorkspace() {\n  const controller = useProjectWorkspaceController();\n  return controller ? <ProjectWorkspaceView {...controller} /> : null;\n}\n`;

await writeFile(controllerPath, controllerSource);
await writeFile(viewPath, viewSource);
await writeFile(sourcePath, wrapperSource);
