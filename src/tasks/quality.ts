import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('quality');

export interface QualityGate {
    name: string;
    commands: string[];
    required: boolean;
}

export interface QualityResult {
    gate: string;
    passed: boolean;
    output: string;
    error?: string;
}

/**
 * Quality gate runner
 */
export class QualityGateRunner {
    constructor(private config: Config) { }

    /**
     * Detect available quality gates based on project setup
     */
    detectGates(worktreePath: string): QualityGate[] {
        const gates: QualityGate[] = [];

        // Check for package.json
        const packageJsonPath = path.join(worktreePath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const scripts = packageJson.scripts || {};

            // Linting
            if (scripts.lint) {
                gates.push({ name: 'Linting', commands: ['npm', 'run', 'lint'], required: true });
            } else if (fs.existsSync(path.join(worktreePath, '.eslintrc.js')) ||
                fs.existsSync(path.join(worktreePath, '.eslintrc.json')) ||
                fs.existsSync(path.join(worktreePath, 'eslint.config.js'))) {
                gates.push({ name: 'Linting', commands: ['npx', 'eslint', '.'], required: true });
            }

            // Type checking
            if (scripts['type-check']) {
                gates.push({ name: 'Type Checking', commands: ['npm', 'run', 'type-check'], required: true });
            } else if (fs.existsSync(path.join(worktreePath, 'tsconfig.json'))) {
                gates.push({ name: 'Type Checking', commands: ['npx', 'tsc', '--noEmit'], required: true });
            }

            // Build
            if (scripts.build) {
                gates.push({ name: 'Build', commands: ['npm', 'run', 'build'], required: true });
            }

            // Tests
            if (scripts.test) {
                gates.push({ name: 'Tests', commands: ['npm', 'test'], required: true });
            }

            // Formatting
            if (scripts.format) {
                gates.push({ name: 'Formatting', commands: ['npm', 'run', 'format'], required: false });
            }
        }

        // Check for Makefile
        const makefilePath = path.join(worktreePath, 'Makefile');
        if (fs.existsSync(makefilePath)) {
            const makefile = fs.readFileSync(makefilePath, 'utf-8');

            if (makefile.includes('lint:') && !gates.find(g => g.name === 'Linting')) {
                gates.push({ name: 'Linting', commands: ['make', 'lint'], required: true });
            }
            if (makefile.includes('test:') && !gates.find(g => g.name === 'Tests')) {
                gates.push({ name: 'Tests', commands: ['make', 'test'], required: true });
            }
            if (makefile.includes('build:') && !gates.find(g => g.name === 'Build')) {
                gates.push({ name: 'Build', commands: ['make', 'build'], required: true });
            }
        }

        // Check for Python projects
        if (fs.existsSync(path.join(worktreePath, 'pyproject.toml')) ||
            fs.existsSync(path.join(worktreePath, 'setup.py'))) {
            if (!gates.find(g => g.name === 'Tests')) {
                gates.push({ name: 'Tests', commands: ['pytest'], required: true });
            }
        }

        // Check for Rust projects
        if (fs.existsSync(path.join(worktreePath, 'Cargo.toml'))) {
            gates.push({ name: 'Linting', commands: ['cargo', 'clippy'], required: true });
            gates.push({ name: 'Build', commands: ['cargo', 'build'], required: true });
            gates.push({ name: 'Tests', commands: ['cargo', 'test'], required: true });
        }

        return gates;
    }

    /**
     * Run a single quality gate
     */
    runGate(worktreePath: string, gate: QualityGate): QualityResult {
        logger.info({ gate: gate.name }, 'Running quality gate');

        try {
            const output = execSync(gate.commands.join(' '), {
                cwd: worktreePath,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 300000, // 5 minute timeout
            });

            logger.info({ gate: gate.name }, 'Quality gate passed');
            return { gate: gate.name, passed: true, output };
        } catch (error: any) {
            const output = error.stdout || '';
            const errorOutput = error.stderr || error.message;

            logger.warn({ gate: gate.name, error: errorOutput }, 'Quality gate failed');
            return {
                gate: gate.name,
                passed: false,
                output,
                error: errorOutput,
            };
        }
    }

    /**
     * Run all quality gates
     */
    runAllGates(worktreePath: string): QualityResult[] {
        const gates = this.detectGates(worktreePath);
        const results: QualityResult[] = [];

        for (const gate of gates) {
            const result = this.runGate(worktreePath, gate);
            results.push(result);

            // Stop on required gate failure
            if (!result.passed && gate.required) {
                logger.warn({ gate: gate.name }, 'Required gate failed, stopping');
                break;
            }
        }

        return results;
    }

    /**
     * Check if all required gates passed
     */
    allRequiredPassed(results: QualityResult[]): boolean {
        const gates = this.detectGates(''); // Get gate definitions
        const requiredGates = gates.filter(g => g.required).map(g => g.name);

        return requiredGates.every(gateName => {
            const result = results.find(r => r.gate === gateName);
            return result?.passed ?? false;
        });
    }

    /**
     * Get summary of results
     */
    getSummary(results: QualityResult[]): string {
        return results
            .map(r => `- ${r.passed ? '✅' : '❌'} ${r.gate}: ${r.passed ? 'Passed' : 'Failed'}`)
            .join('\n');
    }
}
