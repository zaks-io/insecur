# Problem Evidence: Agents, CI, And Secret Reveal

Last updated: 2026-05-26. Sources were gathered from public web search and should be
re-verified before quoting in public copy.

This note captures public evidence that developers are already discussing the exact problem
insecur is built around: agents and CI need to use secrets, but `.env` files, environment
variables, transcripts, logs, and agent-readable files create plaintext reveal paths.

## What People Are Saying

The strongest signal is not generic "secrets management." It is the agent-era version of
the problem:

> I want agents and CI to use secrets, but I do not want plaintext secrets in `.env`,
> process env, transcripts, logs, shell history, or agent-readable files.

That maps directly to insecur's product thesis:

- The risky object is the **read path**, not only the storage location.
- Prompt rules and ignore files are treated as too soft because agents can still run tools.
- Commit-time secret scanning is useful but too late for context contamination.
- Teams are experimenting with runtime injection, vault-backed harnesses, proxies, and
  platform-specific agent secrets, but the workflows remain fragmented.
- The buyer wants to keep using agents; the product should remove plaintext reveal rather
  than ask users to stop using the tools.

## Strong Public Signals

### Hacker News: Agent Secrets Are An Active Workflow Problem

An Ask HN thread titled "How are you managing secrets with AI agents?" states the problem
plainly: environment variables are exposed because an agent with shell access can run
`env` or `echo $API_KEY`, and `.env` files are exposed because the agent can `cat .env`.
A commenter describes an internal harness where secrets come from AWS Secrets Manager,
are never injected directly into env, and each agentic workflow receives only the secrets
it needs.

Source: https://news.ycombinator.com/item?id=46825555

### GitHub: Prompt Rules Do Not Block Tool Calls

An open `anthropics/claude-code` issue reports that Claude Code can read and echo values
from `.env`, `.dev.vars`, and credential files into the conversation transcript even when
`CLAUDE.md` explicitly forbids reading or reproducing secrets. The issue argues that
instructions are advisory and do not stop tool calls; by the time the model notices the
violation, the credential has already reached chat history.

Source: https://github.com/anthropics/claude-code/issues/44868

### Hacker News: Ignore Files Are Not Enough

A Hacker News thread about Cursor uploading `.env` contents despite `.gitignore` and
`.cursorignore` centers on the distinction between "not committed to Git" and "not read
or uploaded by an AI tool." Commenters call out the need for visibility into what gets
indexed and uploaded, and one says they avoid using Cursor on repositories containing
secrets or personal information.

Source: https://news.ycombinator.com/item?id=43331770

### Hacker News: Runtime Proxies And `op run` Are Workarounds, Not Settlement

A thread about using proxies to hide secrets from Claude Code includes the deeper concern:
even if the agent never reads `.env` directly, it may still inspect process environments,
shell history, running process args, or app config. One commenter describes using
1Password `op run` locally and stdout filtering, but notes that this does not fully remove
agent visibility risk.

Source: https://news.ycombinator.com/item?id=46605155

### Reddit: Terminal Agents Get Too Much Trust

A Reddit thread in `r/AI_Agents` asks how to stop terminal AI agents from reading `.env` or
touching production. The post frames the issue as too much ambient trust once an agent can
run from the terminal: it can reach `.env` files, production keys, internal URLs, or
commands that are available but should not be used.

Source: https://www.reddit.com/r/AI_Agents/comments/1tilkje/how_do_you_stop_terminal_ai_agents_from_reading/

### Reddit: Pull From A Vault At Runtime

In an `r/webdev` discussion about keeping secrets from AI agents, commenters describe
ignore files as inconsistent and mention avoiding real local `.env` files by pulling
secrets from a vault at runtime. The pain is practical: the workaround is more hassle, but
it avoids model-context exposure of real keys.

Source: https://www.reddit.com/r/webdev/comments/1r75vf1/keeping_secrets_from_your_ai_agent/

### Stack Overflow: Copilot Coding Agent Secret Boundaries Are Confusing

A Stack Overflow question asks how to pass secrets to GitHub Copilot Coding Agent. The
reported behavior is that a secret is known to exist in repository secrets, but is not
directly exposed in the Copilot agent execution context. This is a small signal, but it
shows developer confusion around how agent execution, CI, and secret availability intersect.

Source: https://stackoverflow.com/questions/79787876/github-copilot-coding-agent-secrets-management

### GitHub: Agent-Specific Secrets Are Becoming A Product Surface

GitHub's Copilot cloud agent documentation now has a dedicated "Agents secrets and
variables" surface. GitHub says Copilot cloud agent runs in an ephemeral GitHub
Actions-powered environment, and configured Agents secrets are exposed as environment
variables to scripts and tools the agent runs while secret values are masked in session
logs. This validates that agent-specific secret delivery is becoming a first-class
platform concern, even though the delivery mechanism still involves environment variables.

Source: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/configure-secrets-and-variables

GitHub also announced organization-level Agents secrets and variables on 2026-05-08,
describing the previous per-repository setup as painful for shared configuration across
many repositories.

Source: https://github.blog/changelog/2026-05-08-more-flexible-secrets-and-variables-for-copilot-cloud-agent/

### GitHub Community: Teams Work Around Agent Secret Restrictions

A GitHub Community discussion about Copilot-triggered workflows and secrets includes users
debating the scope boundary. One commenter says Copilot agents can access only specifically
configured Copilot/Agents secrets; another says their team is shifting away from Copilot
agent to Codex CLI inside normal GitHub Actions workflows because normal jobs have full
access to organization-level secrets.

Source: https://github.com/orgs/community/discussions/177690

## Broader Market Narrative

Several security and developer-tooling articles now frame `.env` plus agent filesystem or
shell access as the weak point. The common recommendation is to keep secrets out of the
filesystem and use runtime delivery, proxies, vault-backed handoff, or process injection.
These sources are useful for market language, but should be treated as vendor/editorial
analysis rather than direct customer interviews.

- Keyway: https://keyway.sh/articles/ai-coding-agents-secrets-security
- NoBoxDev: https://noboxdev.com/blog/five-ways-ai-agents-leak-secrets
- Docker: https://www.docker.com/blog/ai-coding-agent-horror-stories-security-risks/
- DEV Community comments:
  https://dev.to/clap/the-gap-in-ai-agent-security-nobody-talks-about-your-env-is-already-in-the-context-window-68g/comments

Academic/security research is also starting to name the broader class. An April 2026 arXiv
paper about agent filesystem safety says AI coding agents operate directly on user
filesystems where they can corrupt data, delete files, and leak secrets, based on 290
public reports across 13 frameworks.

Source: https://arxiv.org/abs/2604.13536

## Implications For insecur

The evidence supports the existing product posture:

- **First Value should stay diskless.** The first promise should be removing plaintext local
  secret files from agent-heavy development, not building another `.env` manager.
- **No-reveal should be structural.** Public complaints focus on prompt rules, ignore files,
  and log masking failing after the secret is already visible. The control has to sit below
  model behavior and ordinary tool output.
- **Runtime Injection must be scoped.** "Inject everything in this environment" would
  recreate ambient authority. Workflow-scoped Runtime Injection Policies are part of the
  value proposition, not implementation detail.
- **Protected production approval must stay agent-uncrossable.** People are worried about
  agents having terminal and CI authority. The Human Approval Surface is a real product
  boundary, not friction to hide.
- **Messaging should avoid anti-agent framing.** The users in these threads like their
  agents. The pitch is not "agents are bad"; it is "agents are fast enough that readable
  secrets are the wrong primitive."
