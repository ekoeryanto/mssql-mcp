import { describe, expect, test } from 'bun:test';
import { buildStaticToolDefs } from './tools/staticTools.js';
import type { DatabaseCapabilityMetadata } from './types/index.js';

const defaultConfig = {
  dynamicSkillsEnabled: true,
  knowledgeEnabled: true,
  allowMutations: true,
};

describe('buildStaticToolDefs', () => {
  test('marks execute-statement and execute-procedure readOnly when metadata reports isReadOnly: true', () => {
    const meta: DatabaseCapabilityMetadata = {
      isReadOnly: true,
      canMutate: false,
      canDelete: false,
      canDrop: false,
      hasProcedures: true,
      allProceduresReadOnly: true,
      anyProcedureDestructive: false,
    };

    const tools = buildStaticToolDefs(defaultConfig, meta);
    const execStmt = tools.find((t) => t.name === 'execute-statement');
    const execProc = tools.find((t) => t.name === 'execute-procedure');

    expect(execStmt?.annotations?.readOnlyHint).toBe(true);
    expect(execStmt?.annotations?.destructiveHint).toBe(false);
    expect(execStmt?.annotations?.openWorldHint).toBe(false);

    expect(execProc?.annotations?.readOnlyHint).toBe(true);
    expect(execProc?.annotations?.destructiveHint).toBe(false);
    expect(execProc?.annotations?.openWorldHint).toBe(false);
  });

  test('marks execute-statement non-destructive and non-readonly when mutations are allowed', () => {
    const meta: DatabaseCapabilityMetadata = {
      isReadOnly: false,
      canMutate: true,
      canDelete: true,
      canDrop: true,
      hasProcedures: false,
      allProceduresReadOnly: false,
      anyProcedureDestructive: false,
    };

    const tools = buildStaticToolDefs(defaultConfig, meta);
    const execStmt = tools.find((t) => t.name === 'execute-statement');
    const execProc = tools.find((t) => t.name === 'execute-procedure');

    expect(execStmt?.annotations?.readOnlyHint).toBe(false);
    // Not assumed to be destructive by default
    expect(execStmt?.annotations?.destructiveHint).toBe(false);

    expect(execProc?.annotations?.readOnlyHint).toBe(false);
    expect(execProc?.annotations?.destructiveHint).toBe(false);
  });

  test('marks execute-procedure readOnly when all procedures in the database are read-only', () => {
    const meta: DatabaseCapabilityMetadata = {
      isReadOnly: false,
      canMutate: true,
      canDelete: true,
      canDrop: true,
      hasProcedures: true,
      allProceduresReadOnly: true,
      anyProcedureDestructive: false,
    };

    const tools = buildStaticToolDefs(defaultConfig, meta);
    const execProc = tools.find((t) => t.name === 'execute-procedure');

    expect(execProc?.annotations?.readOnlyHint).toBe(true);
    expect(execProc?.annotations?.destructiveHint).toBe(false);
  });

  test('marks execute-procedure destructive only when procedures contain destructive statements', () => {
    const meta: DatabaseCapabilityMetadata = {
      isReadOnly: false,
      canMutate: true,
      canDelete: true,
      canDrop: true,
      hasProcedures: true,
      allProceduresReadOnly: false,
      anyProcedureDestructive: true,
    };

    const tools = buildStaticToolDefs(defaultConfig, meta);
    const execProc = tools.find((t) => t.name === 'execute-procedure');

    expect(execProc?.annotations?.readOnlyHint).toBe(false);
    expect(execProc?.annotations?.destructiveHint).toBe(true);
  });

  test('falls back to allowMutations = false when no metadata is provided', () => {
    const readOnlyConfig = { ...defaultConfig, allowMutations: false };
    const tools = buildStaticToolDefs(readOnlyConfig);
    const execStmt = tools.find((t) => t.name === 'execute-statement');
    const execProc = tools.find((t) => t.name === 'execute-procedure');

    expect(execStmt?.annotations?.readOnlyHint).toBe(true);
    expect(execStmt?.annotations?.destructiveHint).toBe(false);
    expect(execProc?.annotations?.readOnlyHint).toBe(true);
    expect(execProc?.annotations?.destructiveHint).toBe(false);
  });

  test('configures execute-statement with readOnlyHint: false and destructiveHint: false when allowAdditive is true', () => {
    const additiveConfig = { ...defaultConfig, allowMutations: false, allowAdditive: true };
    const tools = buildStaticToolDefs(additiveConfig);
    const execStmt = tools.find((t) => t.name === 'execute-statement');

    expect(execStmt?.annotations?.readOnlyHint).toBe(false);
    expect(execStmt?.annotations?.destructiveHint).toBe(false);
    expect(execStmt?.description).toContain('additive INSERT statements');
  });
});
