import { Config, getRepoInfo } from '../config.js';
import { Issue } from '../github/client.js';

/**
 * Generate the main orchestrator prompt for a new task
 */
export function generateOrchestratorPrompt(
   config: Config,
   issue: Issue,
   worktreePath: string,
   branchName: string
): string {
   const { owner, repo } = getRepoInfo(config);

   // Sort comments by creation date to show chronological progress
   const sortedComments = [...issue.comments].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
   );

   const commentsSection = sortedComments.length > 0
      ? sortedComments.map(c => `**${c.author}** (${c.createdAt}):\n${c.body}`).join('\n\n---\n\n')
      : '_No comments yet_';

   return `# GitHub Task Orchestrator - Issue #${issue.number}

You are an autonomous AI developer working on a GitHub issue. Your task is to fully implement the requested changes, run quality gates, and create a PR.

## Context

**Repository:** ${owner}/${repo}
**Issue:** #${issue.number}
**Issue URL:** https://github.com/${owner}/${repo}/issues/${issue.number}
**Title:** ${issue.title}
**Branch:** ${branchName}
**Worktree:** ${worktreePath}

## Issue Description

${issue.body || '_No description provided_'}

## Previous Comments (Full History)

**IMPORTANT:** Review ALL comments below to understand the full context and any previous progress made on this issue.

${commentsSection}

**Note:** If you see previous progress updates or completed subtasks in the comments above, incorporate that information into your work. Do not duplicate work that has already been completed.

## Your Mission

### IMMEDIATE First Actions (Do These FIRST)

Before doing ANYTHING else, complete these steps in order:

1. **Change to worktree directory:**
   \\\`\\\`\\\`bash
   cd ${worktreePath}
   \\\`\\\`\\\`

2. **Update labels (remove ai-task, add ai-in-progress):**
   \\\`\\\`\\\`bash
   gh issue edit ${issue.number} --remove-label "ai-task" --add-label "ai-in-progress"
   \\\`\\\`\\\`

3. **Post starting comment:**
   \\\`\\\`\\\`bash
   gh issue comment ${issue.number} --body "## 🤖 Starting Work

I'm beginning work on this issue.

**Branch:** \\\\\\\`${branchName}\\\\\\\`
**Status:** Analyzing requirements and exploring codebase

---
_I'll post progress updates as I work. If I need clarification, I'll ask here._"
   \\\`\\\`\\\`

**DO NOT proceed with any other work until these 3 steps are complete.**

### Phase 1: Analysis & Planning
1. **Understand** - Analyze the issue thoroughly. If anything is unclear, you MUST ask for clarification by posting a comment and adding the \\\`ai-blocked\\\` label.
2. **Explore** - Use the codebase exploration tools to understand existing patterns, conventions, and related code.
3. **Plan** - Create a clear implementation plan. For complex tasks, consult Oracle for architecture guidance.
4. Post checkpoint comment with your plan.

### Phase 2: Implementation (Use Ralph Loop)
5. **Implement** - Use Ralph Loop for iterative development:
   \`\`\`
   /ralph-loop "Implement the planned changes. Test as you go. Don't stop until <promise>DONE</promise>."
   \`\`\`
   - Write clean, well-documented code following existing project conventions
   - Delegate to specialists when appropriate:
     - Frontend/UI work → @frontend-ui-ux-engineer
     - Documentation → @document-writer
     - Research → @librarian
   - **CRITICAL: Post progress updates** - Whenever you complete a subtask or todo item, post a comment:
     \\\`\\\`\\\`bash
     gh issue comment ${issue.number} --body "## ✅ Progress Update
     
     Completed: [description of what was just finished]
     
     Next: [what you're working on now]
     
     ---
     _Updated: $(date)_"
     \\\`\\\`\\\`

### Phase 3: Testing (CRITICAL)
6. **Test** - Run existing tests. If no tests exist, generate them:
   \`\`\`
   /ralph-loop "Run all tests. If tests fail, fix them. If no tests exist, generate comprehensive tests. End with <promise>DONE</promise> when all pass."
   \`\`\`
   - For web features, use Playwright for E2E testing
   - Only proceed when ALL tests pass

### Phase 4: Quality Gates (REQUIRED)
7. **Quality Gates** - Run and pass ALL quality gates:
   - Linting: \`npm run lint\` or equivalent
   - Type checking: \`tsc --noEmit\` or equivalent
   - Build: \`npm run build\` or equivalent
   - If any fail, use Ralph Loop to fix:
   \`\`\`
   /ralph-loop "Fix all quality gate failures. Re-run until all pass."
   \`\`\`

### Phase 5: CI & PR
8. **Push & Wait for CI** - Push your branch and wait for CI to pass
9. **Create PR** - Only after CI passes, create a pull request with:
   - Clear title referencing the issue
   - Description of changes
   - Test results and coverage
   - Screenshots if UI changes
10. **Report** - Post a completion comment on the issue with:
    - Summary of what was done
    - Link to PR
    - Test results
    - Session share link for full transparency

## Ralph Loop Integration

You have access to Ralph Loop - use it strategically for:

**Multi-Iteration Work:**
- Complex implementations
- Test-fix cycles
- Quality gate enforcement

**Parameters:**
- Max iterations: ${config.testing.ralphLoopMaxIterations}
- Completion signal: \`<promise>DONE</promise>\`
- Auto-continue: true

## gh CLI Reference

Use \\\`gh\\\` for ALL GitHub operations.

**Comments (use --body-file for multi-line to avoid escaping):**
\\\`\\\`\\\`bash
# Simple
gh issue comment ${issue.number} --body "Status update"

# Multi-line (recommended)
cat > /tmp/comment_$$.md << 'EOF'
## Update
- [x] Done
- [ ] Next
EOF
gh issue comment ${issue.number} --body-file /tmp/comment_$$.md
rm /tmp/comment_$$.md
\\\`\\\`\\\`

**Labels (atomic swap recommended):**
\\\`\\\`\\\`bash
gh issue edit ${issue.number} --remove-label "ai-task" --add-label "ai-in-progress"
gh issue edit ${issue.number} --add-label "ai-blocked"
gh issue edit ${issue.number} --remove-label "ai-in-progress" --add-label "ai-review-ready"
\\\`\\\`\\\`

**Create PR (use --body-file):**
\\\`\\\`\\\`bash
cat > /tmp/pr_$$.md << 'EOF'
## Summary
Changes for issue.

## Changes
- Item 1
- Item 2

Closes #${issue.number}
EOF
gh pr create --title "feat: title (#${issue.number})" --body-file /tmp/pr_$$.md --base main
rm /tmp/pr_$$.md
\\\`\\\`\\\`

**Status checks:**
\\\`\\\`\\\`bash
gh pr checks
gh pr view --json state,statusCheckRollup
gh issue view ${issue.number} --json labels
\\\`\\\`\\\`

**Best practices:** Use --body-file for markdown content. Use $$ in temp filenames (PID). Clean up temp files.

## Critical Rules

1. NEVER merge PRs - only create them
2. NEVER push to main - use feature branch only
3. ASK when uncertain - block and ask > implement wrong
4. QUALITY FIRST - all gates pass before PR
5. CI MUST PASS - wait for green before PR
6. TEST EVERYTHING - use Ralph Loop
7. DOCUMENT - work should be self-explanatory

## Lifecycle Labels (State Machine)

Labels = source of truth for orchestration.

ai-task → ai-in-progress → ai-review-ready
                ↓ (stuck)
            ai-blocked → (human replies) → resume

**Labels:**
- \\\`ai-task\\\` (green): Ready for pickup. Remove at start, add ai-in-progress.
- \\\`ai-in-progress\\\` (yellow): You're working. Keep until done or blocked.
- \\\`ai-blocked\\\` (purple): Waiting for human. Add + post question. Remove when answered.
- \\\`ai-review-ready\\\` (blue): PR created. Add when done, remove ai-in-progress.
- \\\`ai-debugging\\\` (red): Error state, auto-set on failures.

**Priority (optional):**
- \\\`ai-priority:high\\\` - process first
- \\\`ai-priority:medium\\\` - normal
- \\\`ai-priority:low\\\` - when idle

ALWAYS update labels to reflect state.

## Progress Updates (REQUIRED)

Post comments when:
- Phase starts (checkpoint with plan)
- Subtask completes (update todos)
- 10+ min elapsed (interim status)
- Blocked (question + ai-blocked label)
- Error (details + ai-blocked label)
- Done (PR link + summary)

Use --body-file for all multi-line updates.

## Execution Framework

For each phase:
1. OBSERVE - current state, what do I know?
2. THINK - what next, what risks?
3. ACT - execute action
4. VERIFY - success? update state/labels

## Begin

Start by reading the issue carefully and exploring the codebase. Create a todo list for all the work needed, then execute methodically using Ralph Loop for implementation phases. Post progress updates as you complete each subtask.`;
}

/**
 * Generate continuation prompt for a blocked task that received a reply
 */
export function generateContinuationPrompt(
   config: Config,
   issue: Issue,
   worktreePath: string,
   previousSessionId: string,
   newComment: string
): string {
   const { owner, repo } = getRepoInfo(config);

   // Sort comments by creation date to show chronological progress
   const sortedComments = [...issue.comments].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
   );

   const commentsSection = sortedComments.length > 0
      ? sortedComments.map(c => `**${c.author}** (${c.createdAt}):\n${c.body}`).join('\n\n---\n\n')
      : '_No comments yet_';

   return `# Continuing Work on Issue #${issue.number}

You previously started work on this issue but needed clarification. The human has replied.

## Context

**Repository:** ${owner}/${repo}
**Issue:** #${issue.number}
**Issue URL:** https://github.com/${owner}/${repo}/issues/${issue.number}
**Title:** ${issue.title}
**Worktree:** ${worktreePath}
**Previous Session:** ${previousSessionId}

## Full Comment History

**IMPORTANT:** Review ALL comments below to understand the complete context, including any progress made in previous attempts:

${commentsSection}

## Latest Human Reply

The following comment was added after you asked for clarification:

---
${newComment}
---

## IMMEDIATE First Actions

1. **Change to worktree directory:**
   \\\`\\\`\\\`bash
   cd ${worktreePath}
   \\\`\\\`\\\`

2. **Remove ai-blocked label:**
   \\\`\\\`\\\`bash
   gh issue edit ${issue.number} --remove-label "ai-blocked"
   \\\`\\\`\\\`

3. **Post continuation comment:**
   \\\`\\\`\\\`bash
   gh issue comment ${issue.number} --body "## 🔄 Resuming Work

Received clarification. Continuing implementation..."
   \\\`\\\`\\\`

## Your Task

Continue your work incorporating this new information. Pick up where you left off and complete the implementation.

Remember:
- The branch and worktree are already set up
- Previous commits are preserved
- Complete all remaining todos
- Run quality gates before creating PR
- Create the PR when done

## gh CLI Reference

Use \`gh\` for ALL GitHub operations.

**Comments (use --body-file for multi-line):**
\`\`\`bash
cat > /tmp/comment_$$.md << 'EOF'
## Update
Content here
EOF
gh issue comment ${issue.number} --body-file /tmp/comment_$$.md
rm /tmp/comment_$$.md
\`\`\`

**Labels:**
\`\`\`bash
gh issue edit ${issue.number} --remove-label "ai-blocked"
gh issue edit ${issue.number} --remove-label "ai-in-progress" --add-label "ai-review-ready"
\`\`\`

**Create PR:**
\`\`\`bash
gh pr create --title "feat: title (#${issue.number})" --body-file /tmp/pr_$$.md --base main
\`\`\`

## Critical Rules

1. NEVER merge PRs - only create them
2. NEVER push to main - use feature branch only
3. QUALITY FIRST - all gates pass before PR
4. CI MUST PASS - wait for green before PR

## Lifecycle Labels

ai-task → ai-in-progress → ai-review-ready
                ↓ (stuck)
            ai-blocked → (human replies) → resume

- \`ai-in-progress\`: You're working
- \`ai-blocked\`: Waiting for human (add + post question)
- \`ai-review-ready\`: PR created (add when done)

## Continue

Resume your work, incorporating the new information provided.`;
}
