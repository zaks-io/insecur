#!/usr/bin/env node
import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { loadConfig, saveConfig } from './config';
import { apiFetch, getDotenv, parseDotenv } from './api';

const program = new Command();
program.name('insecur').description('CLI for the insecur secrets manager').version('0.0.0');

program
  .command('login')
  .description('Save host + machine token to ~/.insecur/config.json')
  .requiredOption('--host <url>', 'Worker URL, e.g. https://insecur.example.workers.dev')
  .requiredOption('--token <token>', 'Machine token (ins_live_...)')
  .action(async (opts: { host: string; token: string }) => {
    await saveConfig({ host: opts.host.replace(/\/+$/, ''), token: opts.token });
    const cfg = await loadConfig();
    const me = await apiFetch(cfg, '/v1/me');
    if (!me.ok) {
      console.error('Token rejected by host:', me.status, await me.text());
      process.exit(1);
    }
    const body = (await me.json()) as { identity?: { name?: string; type?: string } };
    console.log(`Logged in as ${body.identity?.name} (${body.identity?.type})`);
  });

program
  .command('pull')
  .description('Print the .env for a project/env, or write to a file')
  .requiredOption('-p, --project <slug>', 'Project slug')
  .requiredOption('-e, --env <slug>', 'Environment slug')
  .option('-o, --out <path>', 'Write to file instead of stdout')
  .action(async (opts: { project: string; env: string; out?: string }) => {
    const cfg = await loadConfig();
    const dotenv = await getDotenv(cfg, opts.project, opts.env);
    if (opts.out) {
      await writeFile(opts.out, dotenv, { mode: 0o600 });
      console.error(`Wrote ${opts.out}`);
    } else {
      process.stdout.write(dotenv);
    }
  });

program
  .command('run')
  .description('Run a command with secrets injected as env vars')
  .requiredOption('-p, --project <slug>', 'Project slug')
  .requiredOption('-e, --env <slug>', 'Environment slug')
  .allowUnknownOption()
  .argument('<cmd...>', 'Command to run')
  .action(async (cmd: string[], opts: { project: string; env: string }) => {
    const cfg = await loadConfig();
    const dotenv = await getDotenv(cfg, opts.project, opts.env);
    const injected = parseDotenv(dotenv);
    const [bin, ...args] = cmd;
    if (!bin) {
      console.error('No command provided');
      process.exit(2);
    }
    const child = spawn(bin, args, {
      stdio: 'inherit',
      env: { ...process.env, ...injected },
    });
    child.on('exit', (code) => process.exit(code ?? 0));
    child.on('error', (err) => {
      console.error(err);
      process.exit(1);
    });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
