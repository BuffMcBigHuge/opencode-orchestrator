import { Issue } from './client.js';
import { Config } from '../config.js';

/**
 * Template for starting work comment
 */
export function startingWorkComment(issueNumber: number, branchName: string): string {
    return `## 🤖 Starting Work

I'm beginning work on this issue.

**Branch:** \`${branchName}\`
**Status:** Analyzing requirements and exploring codebase

---
_I'll post progress updates as I work. If I need clarification, I'll ask here._`;
}

/**
 * Template for progress update comment
 */
export function progressUpdateComment(
    elapsed: string,
    completed: string[],
    current: string,
    remaining: string[],
    insights?: string
): string {
    const completedList = completed.map((t) => `- [x] ${t}`).join('\n');
    const remainingList = remaining.map((t) => `- [ ] ${t}`).join('\n');

    return `## 🔄 Progress Update
**Elapsed:** ${elapsed}

### ✅ Completed
${completedList || '_None yet_'}

### 🔄 Currently Working On
${current}

### 📋 Remaining
${remainingList || '_None_'}

${insights ? `### 💡 Insights\n${insights}\n` : ''}
---
_Last updated: ${new Date().toISOString()}_`;
}

/**
 * Template for checkpoint comment
 */
export function checkpointComment(
    startTime: string,
    elapsed: string,
    completed: string[],
    current: string,
    remaining: string[],
    status: string,
    sessionId: string
): string {
    const completedList = completed.map((t) => `- [x] ${t}`).join('\n');
    const remainingList = remaining.map((t) => `- [ ] ${t}`).join('\n');

    return `## 🔖 Task Checkpoint

**Started:** ${startTime}
**Last Update:** ${new Date().toISOString()}
**Elapsed:** ${elapsed}

### ✅ Completed
${completedList || '_None yet_'}

### 🔄 In Progress
- [ ] ${current}

### 📋 Remaining
${remainingList || '_None_'}

### Current Status
${status}

### Session ID
\`${sessionId}\`

---
_Next cron cycle will continue from this checkpoint._`;
}

/**
 * Template for completion comment
 */
export function completionComment(
    summary: string,
    prNumber: number,
    prTitle: string,
    changes: string[],
    testResults: { passing: number; coverage?: number },
    sessionUrl: string
): string {
    const changesList = changes.map((c) => `- ${c}`).join('\n');

    return `## ✅ Work Completed

I've finished implementing the requested changes.

### Summary
${summary}

### Pull Request
🔗 #${prNumber} - ${prTitle}

### Changes Made
${changesList}

### Quality Gates
- ✅ Linting: Passed
- ✅ Type Checking: Passed
- ✅ Build: Passed
- ✅ Tests: ${testResults.passing} passing${testResults.coverage ? ` (${testResults.coverage}% coverage)` : ''}
- ✅ CI: Passed

### Full Session Log
📎 [View complete AI session](${sessionUrl})

---
_Please review the PR and merge when ready. Feel free to request changes or ask questions._`;
}

/**
 * Template for blocked comment
 */
export function blockedComment(
    context: string,
    questions: string[],
    options?: string[]
): string {
    const questionsList = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    const optionsList = options?.map((o) => `- ${o}`).join('\n');

    return `## 🤔 Clarification Needed

I've started working on this issue but need some clarification before proceeding.

### Context
${context}

### Questions
${questionsList}

${optionsList ? `### What I'm Considering\n${optionsList}\n` : ''}
---
_Please reply to this comment with the needed information. I'll continue once you respond._`;
}

/**
 * Template for error comment
 */
export function errorComment(
    errorType: string,
    errorDetails: string,
    attemptedAction: string,
    worktreePath: string,
    sessionUrl: string
): string {
    return `## ⚠️ Error Encountered

I encountered an error while working on this issue.

### Error Type
${errorType}

### Details
\`\`\`
${errorDetails}
\`\`\`

### What Was Attempted
${attemptedAction}

### Worktree Location
\`${worktreePath}\`

### Session Log
📎 [View session for debugging](${sessionUrl})

---
_The \`ai-blocked\` label has been added. Please investigate and reply with guidance, or remove the \`ai-task\` label to cancel._`;
}

/**
 * Template for debugging mode comment
 */
export function debuggingModeComment(
    errorDetails: string,
    worktreePath: string,
    issueNumber: number,
    sessionUrl: string
): string {
    return `## 🐛 Debugging Mode

I've encountered issues I can't automatically resolve.

### What Happened
${errorDetails}

### Worktree Location
\`${worktreePath}\`

### What You Can Do

**Option 1: Debug in worktree**
\`\`\`bash
cd ${worktreePath}
git status
# Make manual changes and test
\`\`\`

**Option 2: Provide guidance**
Reply to this comment with specific instructions.

**Option 3: Cancel task**
Remove \`ai-task\` label and I'll abandon this work.

### Session Log
📎 [View full session](${sessionUrl})`;
}

/**
 * Template for quality gate failure comment
 */
export function qualityGateFailureComment(
    gateName: string,
    output: string,
    attempts: string[],
    sessionUrl: string
): string {
    const attemptsList = attempts.map((a) => `- ${a}`).join('\n');

    return `## ⚠️ Quality Gate Failure

I encountered quality issues that I couldn't automatically fix after multiple attempts.

### Failed Gate: ${gateName}

\`\`\`
${output}
\`\`\`

### What I Tried
${attemptsList}

### Session Log
📎 [View session](${sessionUrl})

---
_Please provide guidance or manually fix the issues._`;
}
